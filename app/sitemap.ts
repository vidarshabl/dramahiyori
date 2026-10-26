import type {MetadataRoute} from "next";
import {database} from "@/lib/db";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export default function sitemap():MetadataRoute.Sitemap{const base=(process.env.NEXT_PUBLIC_SITE_URL||"http://localhost:3000").replace(/\/$/,"");const pages=["","/browse","/genres","/new","/about","/contact","/help","/privacy","/terms","/content-policy"].map(path=>({url:base+path,lastModified:new Date(),changeFrequency:"weekly" as const,priority:path===""?1:.7}));const titles=database.prepare("SELECT slug,updated_at FROM titles WHERE published=1").all() as {slug:string;updated_at:string}[];return [...pages,...titles.map(t=>({url:base+"/title/"+t.slug,lastModified:new Date(t.updated_at.replace(" ","T")+"Z"),changeFrequency:"monthly" as const,priority:.6}))];}
