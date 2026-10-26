import { currentAdmin } from "@/lib/auth";
import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { database } from "@/lib/db";
export const runtime="nodejs";
export async function GET(request:Request) {
  const admin=await currentAdmin(); if(!admin)return badRequest("Administrator access is required.",403);
  const url=new URL(request.url), q=(url.searchParams.get("q")||"").slice(0,100), page=Math.max(1,Number(url.searchParams.get("page")||1));
  const items=await database.prepare("SELECT id,email,display_name,status,created_at FROM users WHERE role='user' AND (email LIKE ? OR display_name LIKE ?) ORDER BY created_at DESC LIMIT 30 OFFSET ?").all(`%${q}%`,`%${q}%`,(page-1)*30);
  return json({items,page});
}
export async function PATCH(request:Request) {
  const rejected=sameOriginOrReject(request); if(rejected)return rejected;
  const admin=await currentAdmin(); if(!admin)return badRequest("Administrator access is required.",403);
  const body=await readJson(request); if(typeof body?.userId!=="string"||!(body.status==="active"||body.status==="disabled"))return badRequest("Choose a valid account status.");
  const result=await database.prepare("UPDATE users SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND role='user'").run(body.status,body.userId);
  if(!Number(result.changes))return badRequest("That user could not be found.",404);
  if(body.status==="disabled")await database.prepare("DELETE FROM sessions WHERE user_id=?").run(body.userId);
  await database.prepare("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)").run(admin.id,`user.${body.status}`,"user",body.userId,"{}");
  return json({saved:true});
}
