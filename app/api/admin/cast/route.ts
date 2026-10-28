import { randomUUID } from "node:crypto";
import { currentAdmin } from "@/lib/auth";
import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { database, type DatabaseAdapter } from "@/lib/db";
import { isAllowedMediaUrl } from "@/lib/security";
import { recordCastImageUsages } from "@/lib/media-usage";
import { invalidatePublicCatalogCache } from "@/lib/catalog";

export const runtime="nodejs";

const slugify=(value:string)=>value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,180);
const roles=["cast","director","writer","producer"] as const;
type GalleryInput={url:string;caption:string;attribution:string};
type CreditInput={titleId:string;characterName:string;roleType:typeof roles[number];sortOrder:number};

function validate(body:Record<string,unknown>) {
  const name=typeof body.name==="string"?body.name.trim():"";
  const slug=typeof body.slug==="string"&&body.slug.trim()?slugify(body.slug.trim()):slugify(name);
  const biography=typeof body.biography==="string"?body.biography.trim():"";
  const nationality=typeof body.nationality==="string"?body.nationality.trim().slice(0,100):"";
  const profession=typeof body.profession==="string"?body.profession.trim().slice(0,100):"Actor";
  const portraitUrl=typeof body.portraitUrl==="string"?body.portraitUrl.trim():"";
  if(name.length<2||name.length>160||!slug||biography.length>10000||!isAllowedMediaUrl(portraitUrl))return {error:"Check the profile name, portrait URL, and biography length."};
  const rawGallery=Array.isArray(body.gallery)?body.gallery:[];
  if(rawGallery.length>30)return {error:"A profile can have up to 30 additional photos."};
  const gallery:GalleryInput[]=[];
  for(const [index,value] of rawGallery.entries()) {
    const photo=value as Record<string,unknown>;
    const url=typeof photo?.url==="string"?photo.url.trim():"";
    const caption=typeof photo?.caption==="string"?photo.caption.trim().slice(0,200):"";
    const attribution=typeof photo?.attribution==="string"?photo.attribution.trim().slice(0,200):"";
    if(!url||!isAllowedMediaUrl(url))return {error:`Check photo ${index+1}; use a valid HTTPS image URL.`};
    if(!gallery.some(item=>item.url===url))gallery.push({url,caption,attribution});
  }
  const rawCredits=Array.isArray(body.credits)?body.credits:[];
  if(rawCredits.length>100)return {error:"A profile can have up to 100 title credits."};
  const credits:CreditInput[]=[];
  for(const [index,value] of rawCredits.entries()) {
    const credit=value as Record<string,unknown>;
    const titleId=typeof credit?.titleId==="string"?credit.titleId.trim():"";
    const characterName=typeof credit?.characterName==="string"?credit.characterName.trim().slice(0,160):"";
    const roleValue=credit?.roleType;
    if(roleValue!=null&&!roles.includes(roleValue as typeof roles[number]))return {error:`Choose a valid role for title credit ${index+1}.`};
    const roleType=roleValue==null?"cast":roleValue as typeof roles[number];
    const sortOrder=credit?.sortOrder==null?index:Number(credit.sortOrder);
    if(!titleId||!Number.isInteger(sortOrder)||sortOrder<0||sortOrder>10000)return {error:`Check title credit ${index+1}.`};
    const key=[titleId,characterName,roleType].join("\u0000");
    if(!credits.some(item=>[item.titleId,item.characterName,item.roleType].join("\u0000")===key))credits.push({titleId,characterName,roleType,sortOrder});
  }
  return {name,slug,biography,nationality,profession,portraitUrl,gallery,credits};
}

async function writeGallery(db:DatabaseAdapter,memberId:string,gallery:GalleryInput[]) {
  await db.prepare("DELETE FROM cast_gallery WHERE cast_member_id=?").run(memberId);
  for(const [sortOrder,photo] of gallery.entries())await db.prepare("INSERT INTO cast_gallery(id,cast_member_id,image_url,caption,attribution,sort_order) VALUES(?,?,?,?,?,?)").run(randomUUID(),memberId,photo.url,photo.caption,photo.attribution,sortOrder);
}

async function writeCredits(db:DatabaseAdapter,memberId:string,credits:CreditInput[]) {
  await db.prepare("DELETE FROM title_cast WHERE cast_member_id=?").run(memberId);
  for(const credit of credits) {
    const title=await db.prepare("SELECT id FROM titles WHERE id=?").get(credit.titleId);
    if(!title)throw new Error("INVALID_TITLE_CREDIT");
    await db.prepare("INSERT INTO title_cast(id,title_id,cast_member_id,character_name,role_type,sort_order) VALUES(?,?,?,?,?,?)").run(randomUUID(),credit.titleId,memberId,credit.characterName,credit.roleType,credit.sortOrder);
  }
}

export async function GET() {
  const admin=await currentAdmin();if(!admin)return badRequest("Administrator access is required.",403);
  const [members,credits,gallery,titles]=await Promise.all([
    database.prepare("SELECT id,slug,name,biography,nationality,profession,portrait_url,created_at,updated_at FROM cast_members ORDER BY name COLLATE NOCASE LIMIT 500").all() as Promise<Record<string,any>[]>,
    database.prepare("SELECT tc.id,tc.cast_member_id,tc.title_id,tc.character_name,tc.role_type,tc.sort_order,t.title,t.slug AS title_slug FROM title_cast tc JOIN titles t ON t.id=tc.title_id ORDER BY tc.sort_order,t.title COLLATE NOCASE").all() as Promise<Record<string,any>[]>,
    database.prepare("SELECT id,cast_member_id,image_url,caption,attribution,sort_order FROM cast_gallery ORDER BY sort_order,id").all() as Promise<Record<string,any>[]>,
    database.prepare("SELECT id,title,slug,type,published FROM titles ORDER BY title COLLATE NOCASE LIMIT 500").all() as Promise<Record<string,any>[]>,
  ]);
  return json({items:members.map(member=>({...member,credits:credits.filter(item=>item.cast_member_id===member.id),gallery:gallery.filter(item=>item.cast_member_id===member.id)})),titles});
}

export async function POST(request:Request) {
  const rejected=sameOriginOrReject(request);if(rejected)return rejected;
  const admin=await currentAdmin();if(!admin)return badRequest("Administrator access is required.",403);
  const body=await readJson(request);if(!body)return badRequest("Enter the cast profile details.");
  const data=validate(body);if(typeof data.error==="string")return badRequest(data.error);
  const id=randomUUID();
  try {
    await database.transaction(async tx=>{
      await tx.prepare("INSERT INTO cast_members(id,slug,name,biography,nationality,profession,portrait_url) VALUES(?,?,?,?,?,?,?)").run(id,data.slug,data.name,data.biography,data.nationality,data.profession,data.portraitUrl);
      await writeGallery(tx,id,data.gallery);await writeCredits(tx,id,data.credits);
      await recordCastImageUsages(tx,id,{portraitUrl:data.portraitUrl,gallery:data.gallery});
      await tx.prepare("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)").run(admin.id,"cast.create","cast_member",id,JSON.stringify({name:data.name}));
    });
    invalidatePublicCatalogCache();
    return json({id,slug:data.slug},201);
  } catch(error) {
    return badRequest(error instanceof Error&&error.message==="INVALID_TITLE_CREDIT"?"Choose a title that still exists.":"That profile slug may already be in use, or the profile could not be saved.",409);
  }
}

export async function PUT(request:Request) {
  const rejected=sameOriginOrReject(request);if(rejected)return rejected;
  const admin=await currentAdmin();if(!admin)return badRequest("Administrator access is required.",403);
  const body=await readJson(request);if(!body||typeof body.id!=="string")return badRequest("Choose a cast profile to update.");
  const data=validate(body);if(typeof data.error==="string")return badRequest(data.error);
  try {
    const saved=await database.transaction(async tx=>{
      const result=await tx.prepare("UPDATE cast_members SET slug=?,name=?,biography=?,nationality=?,profession=?,portrait_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(data.slug,data.name,data.biography,data.nationality,data.profession,data.portraitUrl,body.id);
      if(!Number(result.changes))return false;
      await writeGallery(tx,body.id as string,data.gallery);await writeCredits(tx,body.id as string,data.credits);
      await recordCastImageUsages(tx,body.id as string,{portraitUrl:data.portraitUrl,gallery:data.gallery});
      await tx.prepare("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)").run(admin.id,"cast.update","cast_member",body.id,JSON.stringify({name:data.name}));
      return true;
    });
    if(!saved)return badRequest("That cast profile could not be found.",404);
    invalidatePublicCatalogCache();
    return json({saved:true,slug:data.slug});
  } catch(error) {
    return badRequest(error instanceof Error&&error.message==="INVALID_TITLE_CREDIT"?"Choose a title that still exists.":"That profile could not be saved. Check that its slug is unique.",409);
  }
}

export async function DELETE(request:Request) {
  const rejected=sameOriginOrReject(request);if(rejected)return rejected;
  const admin=await currentAdmin();if(!admin)return badRequest("Administrator access is required.",403);
  const id=new URL(request.url).searchParams.get("id");if(!id)return badRequest("Choose a cast profile to delete.");
  const member=await database.prepare("SELECT name FROM cast_members WHERE id=?").get(id) as {name:string}|undefined;
  if(!member)return badRequest("That cast profile could not be found.",404);
  await database.transaction(async tx=>{
    await tx.prepare("DELETE FROM title_cast WHERE cast_member_id=?").run(id);
    await tx.prepare("DELETE FROM cast_gallery WHERE cast_member_id=?").run(id);
    await tx.prepare("DELETE FROM cast_members WHERE id=?").run(id);
    await tx.prepare("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)").run(admin.id,"cast.delete","cast_member",id,JSON.stringify({name:member.name}));
  });
  invalidatePublicCatalogCache();
  return json({deleted:true});
}
