import { currentAdmin } from "@/lib/auth";
import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { database } from "@/lib/db";
export const runtime="nodejs";
const allowed=["brand","tagline","about","contactEmail"];
export async function GET() {
  if(!await currentAdmin())return badRequest("Administrator access is required.",403);
  return json({settings:Object.fromEntries((database.prepare("SELECT key,value FROM site_settings").all() as {key:string;value:string}[]).map(x=>[x.key,x.value]))});
}
export async function PUT(request:Request) {
  const rejected=sameOriginOrReject(request);if(rejected)return rejected;
  const admin=await currentAdmin();if(!admin)return badRequest("Administrator access is required.",403);
  const body=await readJson(request);if(!body)return badRequest("Enter settings to save.");
  for(const key of allowed)if(typeof body[key]==="string")database.prepare("INSERT INTO site_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(key,(body[key] as string).slice(0,1000));
  database.prepare("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(?,?,?,?)").run(admin.id,"settings.update","settings","site");
  return json({saved:true});
}
