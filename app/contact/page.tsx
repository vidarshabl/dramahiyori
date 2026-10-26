import {ContactPage} from "@/components/InfoPage";
import {database} from "@/lib/db";
export const runtime="nodejs";export const dynamic="force-dynamic";
export default async function Page(){const row=await database.prepare("SELECT value FROM site_settings WHERE key='contactEmail'").get() as {value:string}|undefined;return <ContactPage email={row?.value||""}/>}
