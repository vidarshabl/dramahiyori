import {currentUser,destroySession} from "@/lib/auth";
import {badRequest,json,readJson,sameOriginOrReject} from "@/lib/api";
import {database} from "@/lib/db";
import {verifyPassword} from "@/lib/security";
export const runtime="nodejs";
export async function GET(){const user=await currentUser();return user?json({user}):badRequest("Sign in to view your account.",401);}
export async function PATCH(request:Request){const rejected=sameOriginOrReject(request);if(rejected)return rejected;const user=await currentUser();if(!user)return badRequest("Sign in to update your account.",401);const body=await readJson(request);const name=typeof body?.displayName==="string"?body.displayName.trim():"";if(name.length<2||name.length>50)return badRequest("Your display name must be between 2 and 50 characters.");database.prepare("UPDATE users SET display_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(name,user.id);return json({saved:true});}
export async function DELETE(request:Request){const rejected=sameOriginOrReject(request);if(rejected)return rejected;const user=await currentUser();if(!user)return badRequest("Sign in to delete your account.",401);const body=await readJson(request);const account=database.prepare("SELECT password_hash FROM users WHERE id=?").get(user.id) as {password_hash:string};if(typeof body?.password!=="string"||!verifyPassword(body.password,account.password_hash))return badRequest("The password you entered isn’t correct.",401);database.prepare("DELETE FROM users WHERE id=? AND role='user'").run(user.id);await destroySession();return json({deleted:true});}
