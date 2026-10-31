export type EpisodeLocation = { id: string; season_number: number; episode_number: number; playable?: boolean };

export function getNextPlayableEpisode<T extends EpisodeLocation>(episodes: T[], currentId: string) {
  const index = episodes.findIndex((episode) => episode.id === currentId);
  if (index < 0) return null;
  return episodes.slice(index + 1).find((episode) => episode.playable !== false) || null;
}

/** Returns the next source once; callers should stop instead of cycling failed sources. */
export function getNextSourceIndex(currentIndex: number, sourceCount: number) {
  if (!Number.isInteger(currentIndex) || !Number.isInteger(sourceCount) || currentIndex < 0 || sourceCount < 1) return null;
  return currentIndex + 1 < sourceCount ? currentIndex + 1 : null;
}

/** Prefer the administrator's highest-priority source, then the best quality. */
export function sortVideoSources<T extends { priority?: number; quality?: string; updated_at?: string }>(sources: T[]) {
  const qualityRank: Record<string, number> = { "1080p": 4, "720p": 3, "480p": 2, auto: 1 };
  return [...sources].sort((a, b) =>
    (Number(b.priority) || 0) - (Number(a.priority) || 0)
    || (Date.parse(b.updated_at || "") || 0) - (Date.parse(a.updated_at || "") || 0)
    || (qualityRank[b.quality || "auto"] || 0) - (qualityRank[a.quality || "auto"] || 0),
  );
}

export function isEpisodeNew(createdAt: string, now = Date.now()) {
  const rawDate = typeof createdAt === "string" ? createdAt.trim() : "";
  const normalizedDate = /^\d{4}-\d{2}-\d{2} \d/.test(rawDate) ? rawDate.replace(" ", "T") + "Z" : rawDate;
  const timestamp = Date.parse(normalizedDate);
  const age = now - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age < 48 * 60 * 60_000;
}

export type GuestProgressRecord = {
  title_id: string;
  episode_id: string | null;
  slug: string;
  title: string;
  poster_url: string;
  episode_number: number | null;
  position_seconds: number;
  duration_seconds: number;
  updated_at: string;
};

export function parseGuestProgress(value: string): GuestProgressRecord[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): GuestProgressRecord[] => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      const position = Number(item.position_seconds), duration = Number(item.duration_seconds);
      if (typeof item.title_id !== "string" || !item.title_id || typeof item.slug !== "string" || !item.slug || typeof item.title !== "string" || !item.title || !Number.isFinite(position) || position < 0 || !Number.isFinite(duration) || duration < 0) return [];
      return [{
        title_id: item.title_id,
        episode_id: typeof item.episode_id === "string" ? item.episode_id : null,
        slug: item.slug,
        title: item.title.slice(0, 200),
        poster_url: typeof item.poster_url === "string" ? item.poster_url.slice(0, 2048) : "",
        episode_number: Number.isInteger(Number(item.episode_number)) && Number(item.episode_number) > 0 ? Number(item.episode_number) : null,
        position_seconds: Math.min(position, 86400),
        duration_seconds: Math.min(duration, 86400),
        updated_at: typeof item.updated_at === "string" ? item.updated_at : "",
      }];
    }).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, 20);
  } catch {
    return [];
  }
}
