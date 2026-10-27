import { randomUUID } from "node:crypto";
import type { DatabaseAdapter } from "./db.ts";

export const MEDIA_ROLES = ["poster","backdrop","gallery","portrait","episode_thumbnail","trailer_thumbnail","promotional","other"] as const;
export type MediaRole = typeof MEDIA_ROLES[number];

type UsageTarget = { titleId?: string; castMemberId?: string; episodeId?: string };

export async function recordMediaUsage(
  db: DatabaseAdapter,
  url: string,
  target: UsageTarget,
  role: MediaRole,
  sortOrder = 0,
  caption = "",
  attribution = "",
) {
  if (!url) return;
  const asset = await db.prepare("SELECT id FROM media_assets WHERE url=?").get(url) as { id: string } | undefined;
  if (!asset) return;
  await db.prepare(`INSERT OR IGNORE INTO media_asset_usages
    (id,media_asset_id,title_id,cast_member_id,episode_id,role,sort_order,caption,attribution)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(randomUUID(),asset.id,target.titleId ?? null,target.castMemberId ?? null,target.episodeId ?? null,role,sortOrder,caption,attribution);
}

export async function recordTitleImageUsages(
  db: DatabaseAdapter,
  titleId: string,
  title: { poster: string; backdrop: string; gallery: Array<{url:string;caption:string;attribution:string}> },
) {
  await db.prepare("DELETE FROM media_asset_usages WHERE title_id=?").run(titleId);
  await recordMediaUsage(db,title.poster,{titleId},"poster");
  await recordMediaUsage(db,title.backdrop,{titleId},"backdrop");
  for (const [sortOrder,image] of title.gallery.entries()) {
    await recordMediaUsage(db,image.url,{titleId},"gallery",sortOrder,image.caption,image.attribution);
  }
  const homeSlides=await db.prepare("SELECT backdrop_url,sort_order FROM homepage_slides WHERE title_id=? ORDER BY sort_order").all(titleId) as Array<{backdrop_url:string;sort_order:number}>;
  for(const slide of homeSlides)await recordMediaUsage(db,slide.backdrop_url,{titleId},"backdrop",slide.sort_order);
}

export async function recordCastImageUsages(
  db: DatabaseAdapter,
  castMemberId: string,
  person: { portraitUrl: string; gallery: Array<{url:string;caption:string;attribution:string}> },
) {
  await db.prepare("DELETE FROM media_asset_usages WHERE cast_member_id=?").run(castMemberId);
  await recordMediaUsage(db,person.portraitUrl,{castMemberId},"portrait");
  for (const [sortOrder,image] of person.gallery.entries()) {
    await recordMediaUsage(db,image.url,{castMemberId},"gallery",sortOrder,image.caption,image.attribution);
  }
}
