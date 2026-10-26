import {json} from "@/lib/api";
import {database} from "@/lib/db";
export const runtime="nodejs";
export async function GET(){const rows=await database.prepare("SELECT key,value FROM site_settings WHERE key IN ('brand','tagline','contactEmail')").all() as {key:string;value:string}[];return json({settings:Object.fromEntries(rows.map(row=>[row.key,row.value]))});}
