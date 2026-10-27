import { del, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { currentAdmin } from "@/lib/auth";
import { badRequest, json, sameOriginOrReject } from "@/lib/api";
import { database } from "@/lib/db";

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
  const items=await database.prepare("SELECT id,url,pathname,filename,content_type,size_bytes,created_at FROM media_assets ORDER BY created_at DESC LIMIT 300").all();
  return json({items,storageConfigured:blobConfigured(),maxImageBytes:MAX_IMAGE_BYTES});
}

export async function POST(request:Request) {
  const rejected=sameOriginOrReject(request);if(rejected)return rejected;
  const admin=await currentAdmin();if(!admin)return badRequest("Administrator access is required.",403);
  if(!blobConfigured())return badRequest("Persistent image storage is not configured. Connect a Vercel Blob store to this project first.",503);
  let file:FormDataEntryValue|null;
  try {file=(await request.formData()).get("file");} catch {return badRequest("Choose an image file to upload.");}
  if(typeof File==="undefined"||!(file instanceof File))return badRequest("Choose an image file to upload.");
  if(file.size<1||file.size>MAX_IMAGE_BYTES)return badRequest("Images must be smaller than 4 MB.",413);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const image=inspectImage(bytes);
  if(!image)return badRequest("Upload a real JPEG, PNG, WebP, GIF, or AVIF image. SVG and other file types are not accepted.");
  const id=randomUUID(),filename=`${safeBasename(file.name)}.${image.extension}`,pathname=`deardrama/${id}-${filename}`;
  let uploadedUrl="";
  try {
    const blob=await put(pathname,file,{access:"public",addRandomSuffix:false,contentType:image.contentType,cacheControlMaxAge:60*60*24*30});
    uploadedUrl=blob.url;
    await database.transaction(async tx=>{
      await tx.prepare("INSERT INTO media_assets(id,url,pathname,filename,content_type,size_bytes,uploaded_by) VALUES(?,?,?,?,?,?,?)").run(id,blob.url,blob.pathname,filename,image.contentType,file.size,admin.id);
    });
    return json({item:{id,url:blob.url,pathname:blob.pathname,filename,content_type:image.contentType,size_bytes:file.size}} ,201);
  } catch {
    if(uploadedUrl)await del(uploadedUrl).catch(()=>{});
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
