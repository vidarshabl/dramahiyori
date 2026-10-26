import { createUser, database, getUserByEmail } from "../lib/db.ts";
import { hashPassword } from "../lib/security.ts";

const email=(process.env.ADMIN_EMAIL||"").trim().toLowerCase();
const password=process.env.ADMIN_PASSWORD||"";
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Set ADMIN_EMAIL to the new administrator's email address.");
if(password.length<14||password.length>128) throw new Error("Set ADMIN_PASSWORD to a unique password with 14–128 characters.");
if(getUserByEmail(email)) throw new Error("That email already has an account. This command never promotes an existing account.");
if(Number((database.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get() as {n:number}).n)>0) throw new Error("An administrator already exists. Use your existing secure account-management procedure.");
const displayName=(process.env.ADMIN_NAME||"Platform Administrator").slice(0,50);
const user=createUser({email,displayName,passwordHash:hashPassword(password),role:"admin"});
database.prepare("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(?,?,?,?)").run(user.id,"admin.bootstrap","user",user.id);
console.log(`Administrator account created for ${user.email}. Keep its password in a password manager.`);
