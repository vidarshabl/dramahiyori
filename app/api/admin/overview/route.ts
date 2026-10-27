import { currentAdmin } from "@/lib/auth";
import { database } from "@/lib/db";
import { badRequest, json } from "@/lib/api";
export const runtime="nodejs";
export async function GET() {
  const admin=await currentAdmin(); if(!admin)return badRequest("Administrator access is required.",403);
  const count=async(sql:string)=>Number(((await database.prepare(sql).get()) as {n:number}).n);
  const [userCount,movies,series,episodes,published,drafts,cast,media]=await Promise.all([count("SELECT COUNT(*) n FROM users WHERE role='user'"),count("SELECT COUNT(*) n FROM titles WHERE type='movie'"),count("SELECT COUNT(*) n FROM titles WHERE type='series'"),count("SELECT COUNT(*) n FROM episodes"),count("SELECT COUNT(*) n FROM titles WHERE published=1"),count("SELECT COUNT(*) n FROM titles WHERE published=0"),count("SELECT COUNT(*) n FROM cast_members"),count("SELECT COUNT(*) n FROM media_assets")]);
  const stats={users:userCount,movies,series,episodes,published,drafts,cast,media};
  const [titles,users,audit]=await Promise.all([database.prepare("SELECT id,title,slug,type,published,updated_at,demo FROM titles ORDER BY updated_at DESC LIMIT 12").all(),database.prepare("SELECT id,email,display_name,status,created_at FROM users WHERE role='user' ORDER BY created_at DESC LIMIT 8").all(),database.prepare("SELECT a.action,a.entity_type,a.entity_id,a.created_at,u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 12").all()]);
  return json({stats,titles,users,audit});
}
