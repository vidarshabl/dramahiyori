import { currentAdmin } from "@/lib/auth";
import { database } from "@/lib/db";
import { badRequest, json } from "@/lib/api";
export const runtime="nodejs";
export async function GET() {
  const admin=await currentAdmin(); if(!admin)return badRequest("Administrator access is required.",403);
  const count=(sql:string)=>Number((database.prepare(sql).get() as {n:number}).n);
  const stats={users:count("SELECT COUNT(*) n FROM users WHERE role='user'"),movies:count("SELECT COUNT(*) n FROM titles WHERE type='movie'"),series:count("SELECT COUNT(*) n FROM titles WHERE type='series'"),episodes:count("SELECT COUNT(*) n FROM episodes"),published:count("SELECT COUNT(*) n FROM titles WHERE published=1"),drafts:count("SELECT COUNT(*) n FROM titles WHERE published=0")};
  const titles=database.prepare("SELECT id,title,slug,type,published,updated_at,demo FROM titles ORDER BY updated_at DESC LIMIT 12").all();
  const users=database.prepare("SELECT id,email,display_name,status,created_at FROM users WHERE role='user' ORDER BY created_at DESC LIMIT 8").all();
  const audit=database.prepare("SELECT a.action,a.entity_type,a.entity_id,a.created_at,u.email FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 12").all();
  return json({stats,titles,users,audit});
}
