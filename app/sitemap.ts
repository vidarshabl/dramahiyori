import type {MetadataRoute} from "next";
import {database} from "@/lib/db";
import {getSiteOrigin} from "@/lib/site-url";
export const runtime="nodejs";
export const dynamic="force-dynamic";
function lastModified(value:string|null|undefined):Date {
  const text=value?.trim()||"";
  const normalized=/^\d{4}-\d{2}-\d{2} \d/.test(text)?text.replace(" ","T")+"Z":text;
  const timestamp=Date.parse(normalized);
  return Number.isFinite(timestamp)?new Date(timestamp):new Date(0);
}

export default async function sitemap():Promise<MetadataRoute.Sitemap>{
  const base=getSiteOrigin();
  const pages=["/","/browse","/genres","/people","/new","/schedule","/about","/contact","/help","/privacy","/terms","/content-policy"].map(path=>({url:new URL(path,base).toString(),lastModified:new Date(),changeFrequency:"weekly" as const,priority:path==="/"?1:.7}));
  const [titles,people,episodes]=await Promise.all([
    database.prepare("SELECT slug,updated_at FROM titles WHERE published=1").all() as Promise<{slug:string;updated_at:string|null}[]>,
    database.prepare("SELECT cm.slug,cm.updated_at FROM cast_members cm WHERE EXISTS (SELECT 1 FROM title_cast tc JOIN titles t ON t.id=tc.title_id WHERE tc.cast_member_id=cm.id AND t.published=1)").all() as Promise<{slug:string;updated_at:string|null}[]>,
    database.prepare(`SELECT t.slug,s.season_number,e.episode_number,
      COALESCE(NULLIF(e.publish_at,''),NULLIF(e.created_at,''),NULLIF(t.updated_at,''),NULLIF(t.created_at,''),CURRENT_TIMESTAMP) AS updated_at
      FROM episodes e JOIN seasons s ON s.id=e.season_id JOIN titles t ON t.id=s.title_id
      WHERE t.published=1 AND e.published=1 AND (e.publish_at IS NULL OR datetime(e.publish_at)<=CURRENT_TIMESTAMP)`)
      .all() as Promise<{slug:string;season_number:number;episode_number:number;updated_at:string|null}[]>,
  ]);
  return [
    ...pages,
    ...titles.map(title=>({url:new URL(`/title/${encodeURIComponent(title.slug)}`,base).toString(),lastModified:lastModified(title.updated_at),changeFrequency:"monthly" as const,priority:.6})),
    ...episodes.map(episode=>({url:new URL(`/watch/${encodeURIComponent(episode.slug)}/${episode.season_number}-${episode.episode_number}`,base).toString(),lastModified:lastModified(episode.updated_at),changeFrequency:"weekly" as const,priority:.4})),
    ...people.map(person=>({url:new URL(`/people/${encodeURIComponent(person.slug)}`,base).toString(),lastModified:lastModified(person.updated_at),changeFrequency:"monthly" as const,priority:.4})),
  ];
}
