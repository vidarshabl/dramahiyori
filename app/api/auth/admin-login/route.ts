import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { database, getDatabaseConfigurationSummary, getUserByEmail } from "@/lib/db";
import { recentAttempts, recordAttempt, verifyPassword } from "@/lib/security";

export const runtime="nodejs";
function authDebug(event:string,details:Record<string,unknown>) {
  if(process.env.ADMIN_AUTH_DEBUG==="true") console.info(`[admin-auth] ${event}`,details);
}
export async function POST(request:Request) {
  const rejected=sameOriginOrReject(request); if(rejected)return rejected;
  const body=await readJson(request); const email=typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password=typeof body?.password === "string" ? body.password : "";
  if(!email || !password || email.length>254) return badRequest("Enter your administrator email and password.");
  authDebug("database-configuration",getDatabaseConfigurationSummary());
  const key=`admin:${email}`;
  if(await recentAttempts(key)>=8) return badRequest("Too many sign-in attempts. Please try again in 15 minutes.",429);
  await recordAttempt(key);
  let user;
  try {
    user=await getUserByEmail(email);
  } catch(error) {
    authDebug("database-lookup-failed",{errorType:error instanceof Error?error.name:"UnknownError"});
    throw error;
  }
  const encodedHash=typeof user?.password_hash==="string"?user.password_hash:"";
  const passwordMatches=user?verifyPassword(password,encodedHash):false;
  authDebug("credential-check",{
    userFound:Boolean(user),
    role:user?.role??null,
    status:user?.status??null,
    storedHashAlgorithm:encodedHash.split("$",1)[0]||"missing",
    passwordMatches,
  });
  if(!user || user.role!=="admin" || user.status!=="active" || !passwordMatches) return badRequest("Email or password isn't correct.",401);
  await createSession(user.id);
  await database.prepare("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(?,?,?,?)").run(user.id,"admin.login","session",user.id);
  return json({user:{id:user.id,email:user.email,display_name:user.display_name,role:user.role}});
}
