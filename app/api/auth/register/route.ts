import { badRequest, json, readJson, sameOriginOrReject } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { createUser, getUserByEmail } from "@/lib/db";
import { hashPassword, recentAttempts, recordAttempt } from "@/lib/security";

export const runtime="nodejs";
export async function POST(request:Request) {
  const rejected=sameOriginOrReject(request); if(rejected)return rejected;
  const body=await readJson(request); if(!body)return badRequest("Enter your details and try again.");
  const displayName=typeof body.displayName === "string" ? body.displayName.trim() : "";
  const email=typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password=typeof body.password === "string" ? body.password : "";
  if(typeof body.confirmPassword!=="string"||body.confirmPassword!==password)return badRequest("Those passwords don’t match.");
  if(body.terms!=="on"&&body.terms!==true)return badRequest("Please agree to the Terms and Privacy Policy.");
  if(displayName.length<2 || displayName.length>50) return badRequest("Your display name must be between 2 and 50 characters.");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254) return badRequest("Enter a valid email address.");
  if(password.length<12 || password.length>128) return badRequest("Choose a password between 12 and 128 characters.");
  if(await recentAttempts("register:"+email)>=5)return badRequest("Too many account attempts. Please try again in 15 minutes.",429);
  await recordAttempt("register:"+email);
  if(await getUserByEmail(email)) return badRequest("We couldn't create this account with those details.",409);
  try {
    // Public sign-up always creates the least-privileged role; request role fields are ignored.
    const user=await createUser({email,displayName,passwordHash:hashPassword(password)});
    await createSession(user.id);
    return json({user},201);
  } catch { return badRequest("We couldn't create your account. Please try again.",409); }
}
