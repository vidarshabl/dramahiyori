import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { database, getUserByEmail } from "@/lib/db";
import { recentAttempts, recordAttempt, verifyPassword } from "@/lib/security";

export const runtime="nodejs";
export async function POST(request:Request) {
  const rejected=sameOriginOrReject(request); if(rejected)return rejected;
  const body=await readJson(request); const email=typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password=typeof body?.password === "string" ? body.password : "";
  if(!email || !password || email.length>254) return badRequest("Enter your administrator email and password.");
  const key=`admin:${email}`;
  if(recentAttempts(key)>=8) return badRequest("Too many sign-in attempts. Please try again in 15 minutes.",429);
  recordAttempt(key);
  const user=getUserByEmail(email);
  if(!user || user.role!=="admin" || user.status!=="active" || !verifyPassword(password,user.password_hash)) return badRequest("Email or password isn't correct.",401);
  await createSession(user.id);
  database.prepare("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(?,?,?,?)").run(user.id,"admin.login","session",user.id);
  return json({user:{id:user.id,email:user.email,display_name:user.display_name,role:user.role}});
}
