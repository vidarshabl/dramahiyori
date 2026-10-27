import { del, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { currentAdmin } from "@/lib/auth";
import { badRequest, json, sameOriginOrReject } from "@/lib/api";
import { database } from "@/lib/db";
import { MEDIA_ROLES, type MediaRole } from "@/lib/media-usage";

export const runtime="nodejs";
const MAX_IMAGE_BYTES=4*1024*1024;

function blobConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN||(process.env.VERCEL_OIDC_TOKEN&&process.env.BLOB_STORE_ID));
}

function inspectImage(bytes:Uint8Array) {
  if(bytes.length>=8&&bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47&&bytes[4]===0x0d&&bytes[5]===0x0a&&bytes[6]===0x1a&&bytes[7]===0x0a)return {contentType:"image/png",extension:"png"};
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return {contentType:"image/jpeg",extension:"jpg"};
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP")return {contentType:"image/webp",extension:"webp"};
  if(bytes.length>=6&&["GIF87a","GIF89a"].includes(String.fromCharCode(...bytes.slice(0,6))))return {contentType:"image/gif",extension:"gif"};
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(4,8))==="ftyp"&&["avif","avis"].includes(String.fromCharCode(...bytes.slice(8,12))))return {contentType:"image/avif",extension:"avif"};
  return null;
}

function safeBasename(filename:string) {
  const withoutExtension=filename.replace(/\.[^.]+$/g,"");
  const safe=withoutExtension.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60);
  return safe||"image";
}

export async function GET() {
  const admin=await currentAdmin();if(!admin)return badRequest("Administrator access is required.",403);
  const [items,usages]=await Promise.all([
    database.prepare("SELECT id,url,pathname,filename,content_type,size_bytes,role,created_at FROM media_assets ORDER BY created_at DESC LIMIT 300").all() as Promise<Record<string,any>[]>,
    database.prepare(`SELECT u.media_asset_id,u.role,u.sort_order,u.caption,u.attribution,
      t.title AS title_name,t.slug AS title_slug,c.name AS cast_name,c.slug AS cast_slug,e.title AS episode_name
      FROM media_asset_usages u LEFT JOIN titles t ON t.id=u.title_id
      LEFT JOIN cast_members c ON c.id=u.cast_member_id LEFT JOIN episodes e ON e.id=u.episode_id
      ORDER BY u.sort_order,u.id`).all() as Promise<Record<string,any>[]>,
  ]);
  const byAsset=new Map<string,Record<string,any>[]>();
  for(const usage of usages)byAsset.set(usage.media_asset_id,[...(byAsset.get(usage.media_asset_id)||[]),usage]);
  return json({items:items.map(item=>({...item,usages:byAsset.get(item.id)||[]})),storageConfigured:blobConfigured(),maxImageBytes:MAX_IMAGE_BYTES});
}

export async function POST(request:Request) {
  const rejected=sameOriginOrReject(request);if(rejected)return rejected;
  const admin=await currentAdmin();if(!admin)return badRequest("Administrator access is required.",403);
  if(!blobConfigured())return badRequest("Persistent image storage is not configured. Connect a Vercel Blob store to this project first.",503);
  let file:FormDataEntryValue|null,roleValue:FormDataEntryValue|null,uploadIdValue:FormDataEntryValue|null;
  try {const formData=await request.formData();file=formData.get("file");roleValue=formData.get("role");uploadIdValue=formData.get("uploadId");} catch {return badRequest("Choose an image file to upload.");}
  if(typeof File==="undefined"||!(file instanceof File))return badRequest("Choose an image file to upload.");
  const role=(typeof roleValue==="string"&&MEDIA_ROLES.includes(roleValue as MediaRole)?roleValue:"other") as MediaRole;
  const uploadId=typeof uploadIdValue==="string"?uploadIdValue:"";
  if(uploadId&&!/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(uploadId))return badRequest("This upload could not be identified. Select the file again.");
  if(uploadId){const existing=await database.prepare("SELECT id,url,pathname,filename,content_type,size_bytes,role,created_at FROM media_assets WHERE upload_id=?").get(uploadId) as Record<string,any>|undefined;if(existing)return json({item:{...existing,usages:[]}});}
  if(file.size<1||file.size>MAX_IMAGE_BYTES)return badRequest("Images must be smaller than 4 MB.",413);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const image=inspectImage(bytes);
  if(!image)return badRequest("Upload a real JPEG, PNG, WebP, GIF, or AVIF image. SVG and other file types are not accepted.");
  const id=randomUUID(),filename=`${safeBasename(file.name)}.${image.extension}`,pathname=`deardrama/${id}-${filename}`;
  let uploadedUrl="";
  try {
    const blob=await put(pathname,file,{access:"public",addRandomSuffix:false,contentType:image.contentType,cacheControlMaxAge:60*60*24*30});
    uploadedUrl=blob.url;
    const saved=await database.transaction(async tx=>{
      await tx.prepare("INSERT INTO media_assets(id,url,pathname,filename,content_type,size_bytes,role,upload_id,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?)").run(id,blob.url,blob.pathname,filename,image.contentType,file.size,role,uploadId||null,admin.id);
      return await tx.prepare("SELECT created_at FROM media_assets WHERE id=?").get(id) as {created_at:string}|undefined;
    });
    return json({item:{id,url:blob.url,pathname:blob.pathname,filename,content_type:image.contentType,size_bytes:file.size,role,created_at:saved?.created_at||new Date().toISOString(),usages:[]}} ,201);
  } catch {
    if(uploadedUrl)await del(uploadedUrl).catch(()=>{});
    if(uploadId){try{const existing=await database.prepare("SELECT id,url,pathname,filename,content_type,size_bytes,role,created_at FROM media_assets WHERE upload_id=?").get(uploadId) as Record<string,any>|undefined;if(existing)return json({item:{...existing,usages:[]}});}catch{}}
    return badRequest("The image could not be saved to the media library. Please try again.",502);
  }
}

export async function DELETE(request:Request) {
  const rejected=sameOriginOrReject(request);if(rejected)return rejected;
  const admin=await currentAdmin();if(!admin)return badRequest("Administrator access is required.",403);
  if(!blobConfigured())return badRequest("Persistent image storage is not configured.",503);
  const id=new URL(request.url).searchParams.get("id");if(!id)return badRequest("Choose an image to remove.");
  const asset=await database.prepare("SELECT id,url,pathname FROM media_assets WHERE id=?").get(id) as {id:string;url:string;pathname:string}|undefined;
  if(!asset)return badRequest("That media item could not be found.",404);
  const usage=await database.prepare("SELECT COUNT(*) AS n FROM media_asset_usages WHERE media_asset_id=?").get(id) as {n:number};
  if(Number(usage.n)>0)return badRequest("This image is assigned to content. Remove its associations before deleting it.",409);
  const refs=[
    "SELECT COUNT(*) AS n FROM titles WHERE poster_url=? OR backdrop_url=?",
    "SELECT COUNT(*) AS n FROM episodes WHERE thumbnail_url=?",
    "SELECT COUNT(*) AS n FROM cast_members WHERE portrait_url=?",
    "SELECT COUNT(*) AS n FROM title_gallery WHERE image_url=?",
    "SELECT COUNT(*) AS n FROM cast_gallery WHERE image_url=?",
  ];
  const counts=await Promise.all(refs.map((sql,index)=>database.prepare(sql).get(...(index===0?[asset.url,asset.url]:[asset.url])) as Promise<{n:number}>));
  if(counts.some(row=>Number(row.n)>0))return badRequest("This image is in use. Replace its references before deleting it.",409);
  try {
    const parsed=new URL(asset.url);
    if(parsed.protocol!=="https:"||!parsed.hostname.endsWith(".public.blob.vercel-storage.com")||!asset.pathname.startsWith("deardrama/"))return badRequest("This library entry is not a managed public image.",409);
    await del(asset.url);
    await database.prepare("DELETE FROM media_assets WHERE id=?").run(id);
    await database.prepare("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)").run(admin.id,"media.delete","media_asset",id,JSON.stringify({pathname:asset.pathname}));
    return json({deleted:true});
  } catch {
    return badRequest("The image could not be removed. Try again later.",502);
  }
}
