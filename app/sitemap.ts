import type {MetadataRoute} from "next";
import {database} from "@/lib/db";
import {getSiteOrigin} from "@/lib/site-url";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export default async function sitemap():Promise<MetadataRoute.Sitemap>{const base=getSiteOrigin();const pages=["/","/browse","/genres","/new","/about","/contact","/help","/privacy","/terms","/content-policy"].map(path=>({url:new URL(path,base).toString(),lastModified:new Date(),changeFrequency:"weekly" as const,priority:path==="/"?1:.7}));const titles=await database.prepare("SELECT slug,updated_at FROM titles WHERE published=1").all() as {slug:string;updated_at:string}[];return [...pages,...titles.map(t=>({url:new URL(`/title/${encodeURIComponent(t.slug)}`,base).toString(),lastModified:new Date(t.updated_at.replace(" ","T")+"Z"),changeFrequency:"monthly" as const,priority:.6}))];}
