import { cookies } from "next/headers";
import { database, getUserById } from "./db";
import { newSessionToken, tokenHash } from "./security";

export const SESSION_COOKIE = "deardrama_session";
const SESSION_DAYS = 30;

export async function currentUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = database.prepare("SELECT user_id,expires_at FROM sessions WHERE token_hash=?").get(tokenHash(token)) as {user_id:string;expires_at:string}|undefined;
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
    if (session) database.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash(token));
    return null;
  }
  const user = getUserById(session.user_id);
  if (!user || user.status !== "active") return null;
  return user;
}

export async function createSession(userId:string) {
  const token = newSessionToken();
  const expires = new Date(Date.now()+SESSION_DAYS*86400000).toISOString();
  database.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").run(tokenHash(token),userId,expires);
  const jar=await cookies();
  jar.set(SESSION_COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV === "production",sameSite:"lax",path:"/",expires:new Date(expires)});
}

export async function destroySession() {
  const jar=await cookies(); const token=jar.get(SESSION_COOKIE)?.value;
  if(token) database.prepare("DELETE FROM sessions WHERE token_hash=?").run(tokenHash(token));
  jar.delete(SESSION_COOKIE);
}

export async function currentAdmin() { const user=await currentUser(); return user?.role === "admin" ? user : null; }
