import { randomUUID } from "node:crypto";
import { isValidMediaUrl } from "./security.ts";
import { recordMediaUsage } from "./media-usage.ts";
import type { DatabaseAdapter } from "./db.ts";

type ExistingEpisode = { id: string; episode_number: number; season_number: number };

/** Persist the admin editor's episodes while keeping the IDs referenced by watch progress. */
export async function persistTitleEpisodes(db: DatabaseAdapter, titleId: string, episodes: Record<string, unknown>[]) {
  const existing = await db.prepare(`SELECT e.id,e.episode_number,s.season_number FROM episodes e
    JOIN seasons s ON s.id=e.season_id WHERE s.title_id=?`).all(titleId) as ExistingEpisode[];
  const existingById = new Map(existing.map((episode) => [episode.id, episode]));
  const existingByPosition = new Map(existing.map((episode) => [`${episode.season_number}:${episode.episode_number}`, episode]));
  const usedIds = new Set<string>();
  const targets = episodes.map((episode, index) => {
    const seasonNumber = Number(episode.seasonNumber) || 1;
    const episodeNumber = Number(episode.episodeNumber) || index + 1;
    const requestedId = typeof episode.id === "string" ? episode.id : "";
    const matched = requestedId ? existingById.get(requestedId) : existingByPosition.get(`${seasonNumber}:${episodeNumber}`);
    if (requestedId && !matched) throw new Error("INVALID_EPISODE_ID");
    if (matched && usedIds.has(matched.id)) throw new Error("INVALID_EPISODE_ID");
    const id = matched?.id || randomUUID();
    if (matched) usedIds.add(id);
    const thumbnailUrl = typeof episode.thumbnailUrl === "string" && isValidMediaUrl(episode.thumbnailUrl) ? episode.thumbnailUrl.trim() : "";
    const rawRuntime = Number(episode.durationMinutes);
    const rawPublishAt = typeof episode.publishAt === "string" ? episode.publishAt.trim() : "";
    const publishAt = rawPublishAt ? new Date(rawPublishAt).toISOString() : null;
    const tracks = Array.isArray(episode.subtitles) ? episode.subtitles as Record<string, unknown>[] : [];
    return {
      id,
      matched: Boolean(matched),
      seasonNumber,
      episodeNumber,
      title: String(episode.title).trim(),
      synopsis: typeof episode.synopsis === "string" ? episode.synopsis.slice(0, 1000) : "",
      thumbnailUrl,
      durationMinutes: Number.isSafeInteger(rawRuntime) && rawRuntime > 0 ? rawRuntime : null,
      videoUrl: typeof episode.videoUrl === "string" ? episode.videoUrl.trim() : "",
      airDate: typeof episode.airDate === "string" && episode.airDate ? episode.airDate : null,
      publishAt,
      published: episode.published === false ? 0 : 1,
      tracks,
    };
  });

  const seasonRows = await db.prepare("SELECT id,season_number FROM seasons WHERE title_id=?").all(titleId) as Array<{ id: string; season_number: number }>;
  const seasonIds = new Map(seasonRows.map((season) => [Number(season.season_number), season.id]));
  for (const seasonNumber of new Set(targets.map((episode) => episode.seasonNumber))) {
    if (seasonIds.has(seasonNumber)) continue;
    const seasonId = randomUUID();
    seasonIds.set(seasonNumber, seasonId);
    await db.prepare("INSERT INTO seasons(id,title_id,season_number,name) VALUES(?,?,?,?)")
      .run(seasonId, titleId, seasonNumber, `Season ${seasonNumber}`);
  }

  await db.prepare("DELETE FROM subtitle_tracks WHERE episode_id IN (SELECT e.id FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE s.title_id=?)").run(titleId);
  await db.prepare("DELETE FROM content_subtitle_tracks WHERE episode_id IN (SELECT e.id FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE s.title_id=?)").run(titleId);
  await db.prepare("DELETE FROM media_asset_usages WHERE episode_id IN (SELECT e.id FROM episodes e JOIN seasons s ON s.id=e.season_id WHERE s.title_id=?)").run(titleId);
  for (const episode of existing) {
    if (!usedIds.has(episode.id)) await db.prepare("DELETE FROM episodes WHERE id=?").run(episode.id);
  }

  // Temporarily move surviving rows out of the way so episode swaps do not collide with
  // UNIQUE(season_id, episode_number), while keeping IDs stable for watch progress.
  let temporaryNumber = -1;
  for (const episode of targets) {
    if (episode.matched) await db.prepare("UPDATE episodes SET episode_number=? WHERE id=?").run(temporaryNumber--, episode.id);
  }
  for (const episode of targets) {
    if (!episode.matched) {
      await db.prepare(`INSERT INTO episodes(id,season_id,episode_number,title,synopsis,thumbnail_url,duration_minutes,video_url,air_date,publish_at,published,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`)
        .run(episode.id, seasonIds.get(episode.seasonNumber), temporaryNumber--, episode.title, episode.synopsis, episode.thumbnailUrl, episode.durationMinutes, episode.videoUrl, episode.airDate, episode.publishAt, episode.published);
    }
  }

  for (const episode of targets) {
    await db.prepare(`UPDATE episodes SET season_id=?,episode_number=?,title=?,synopsis=?,thumbnail_url=?,duration_minutes=?,video_url=?,air_date=?,publish_at=?,published=? WHERE id=?`)
      .run(seasonIds.get(episode.seasonNumber), episode.episodeNumber, episode.title, episode.synopsis, episode.thumbnailUrl, episode.durationMinutes, episode.videoUrl, episode.airDate, episode.publishAt, episode.published, episode.id);
    await recordMediaUsage(db, episode.thumbnailUrl, { episodeId: episode.id }, "episode_thumbnail");

    const legacySourceId = `legacy-episode-${episode.id}`;
    if (episode.videoUrl) {
      await db.prepare(`INSERT INTO video_sources(id,episode_id,kind,quality,url,priority,status)
        VALUES(?,?,'mp4','auto',?,-1000,'active') ON CONFLICT(id) DO UPDATE SET url=excluded.url,status='active',updated_at=CURRENT_TIMESTAMP`)
        .run(legacySourceId, episode.id, episode.videoUrl);
    } else {
      await db.prepare("DELETE FROM video_sources WHERE id=?").run(legacySourceId);
    }

    for (const track of episode.tracks) {
      if (typeof track.language !== "string" || typeof track.fileUrl !== "string" || !isValidMediaUrl(track.fileUrl)) continue;
      const language = track.language.trim().slice(0, 20);
      if (!language) continue;
      const label = typeof track.label === "string" ? track.label.trim().slice(0, 80) || language : language;
      const kind = track.kind === "captions" ? "captions" : "subtitles";
      const isDefault = track.isDefault === true ? 1 : 0;
      const timingOffset = Number.isFinite(Number(track.timingOffset)) ? Math.max(-60, Math.min(60, Number(track.timingOffset))) : 0;
      const subtitleId = randomUUID();
      await db.prepare("INSERT INTO content_subtitle_tracks(id,episode_id,language,label,vtt_url,kind,is_default,timing_offset) VALUES(?,?,?,?,?,?,?,?)")
        .run(subtitleId, episode.id, language, label, track.fileUrl.trim(), kind, isDefault, timingOffset);
      await db.prepare("INSERT INTO subtitle_tracks(id,episode_id,language,label,file_url,kind) VALUES(?,?,?,?,?,?)")
        .run(subtitleId, episode.id, language, label, track.fileUrl.trim(), kind);
    }
  }
  await db.prepare("DELETE FROM seasons WHERE title_id=? AND NOT EXISTS (SELECT 1 FROM episodes WHERE episodes.season_id=seasons.id)").run(titleId);
}
