import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { database } from "./db.ts";

const SCRYPT_KEY_BYTES = 64;
const SCRYPT_OPTIONS = {N:32768,r:8,p:1,maxmem:64*1024*1024};

export function hashPassword(password:string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password,salt,SCRYPT_KEY_BYTES,SCRYPT_OPTIONS).toString("hex");
  return `scrypt$${salt}$${hash}`;
}
export function verifyPassword(password:string, encoded:string) {
  const parts=encoded.split("$");
  if(parts.length!==3)return false;
  const [algorithm,salt,hash] = parts;
  if (algorithm !== "scrypt" || !salt || !/^[a-f\d]{32}$/i.test(salt) || !/^[a-f\d]{128}$/i.test(hash || "")) return false;
  const actual = scryptSync(password,salt,SCRYPT_KEY_BYTES,SCRYPT_OPTIONS);
  const expected = Buffer.from(hash,"hex");
  return expected.length === actual.length && timingSafeEqual(actual,expected);
}
export const newSessionToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token:string) => createHash("sha256").update(token).digest("hex");

export function isAllowedMediaUrl(value:string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return false;
    const host=url.hostname.toLowerCase();
    const allowed = (process.env.MEDIA_ALLOWED_HOSTS || "").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
    const internetArchiveHost=host==="archive.org"||host.endsWith(".archive.org");
    return internetArchiveHost || allowed.length === 0 || allowed.includes(host);
  } catch { return false; }
}

export function isValidMediaUrl(value:string) {
  if (!value) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    return process.env.NODE_ENV !== "production" || url.protocol === "https:";
  } catch { return false; }
}

export function checkSameOrigin(request:Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function recentAttempts(email:string) {
  const cutoff = new Date(Date.now()-15*60*1000).toISOString().slice(0,19).replace("T"," ");
  const normalized=email.toLowerCase().slice(0,254);
  const row=await database.prepare("SELECT COUNT(*) AS count FROM auth_attempts WHERE email_key=? AND attempted_at>=?").get(normalized,cutoff) as {count:number};
  return Number(row.count);
}
export async function recordAttempt(email:string) {
  await database.prepare("INSERT INTO auth_attempts(email_key) VALUES(?)").run(email.toLowerCase().slice(0,254));
}
