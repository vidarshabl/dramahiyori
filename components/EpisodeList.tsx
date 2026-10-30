"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isEpisodeNew } from "@/lib/watch-utils";

type Episode = { id: string; title: string; episode_number: number; synopsis: string; thumbnail_url: string; duration_minutes: number | null; created_at: string };
type Season = { id: string; season_number: number; name: string; episodes: Episode[] };

export function EpisodeList({ slug, seasons, currentEpisodeId }: { titleId?: string; slug: string; seasons: Season[]; currentEpisodeId: string }) {
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  useEffect(() => { fetch("/api/watched-episodes", { cache: "no-store" }).then((response) => response.json()).then((data) => setWatched(new Set((data.items || []).map((item: any) => item.episode_id)))).catch(() => {}); }, []);
  async function toggle(episodeId: string) {
    const next = !watched.has(episodeId);
    try {
      const response = await fetch("/api/watched-episodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ episodeId, watched: next }) });
      const data = await response.json();
      if (response.status === 401) { setNotice("Sign in to keep your watched episodes synced."); return; }
      if (!response.ok) throw new Error(data.error || "Could not update watched status.");
      setWatched((current) => { const value = new Set(current); if (next) value.add(episodeId); else value.delete(episodeId); return value; });
      setNotice("");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not update watched status."); }
  }
  return <section className="watch-episode-list" aria-label="Episodes">
    <div className="section-heading"><div><span className="eyebrow">THE STORY CONTINUES</span><h2>Episodes</h2></div></div>
    {notice && <p className="episode-list-notice" role="status">{notice}</p>}
    <div className="watch-season-list">{seasons.map((season) => <details key={season.id} open={season.episodes.some((episode) => episode.id === currentEpisodeId)}><summary>{season.name || `Season ${season.season_number}`} <span>{season.episodes.length} episodes</span></summary><ol>{season.episodes.map((episode) => <li key={episode.id} className={episode.id === currentEpisodeId ? "is-current" : undefined}><Link href={`/watch/${encodeURIComponent(slug)}/${season.season_number}-${episode.episode_number}`} aria-current={episode.id === currentEpisodeId ? "page" : undefined}><span className="episode-number">{String(episode.episode_number).padStart(2, "0")}</span><span className="episode-name">{episode.title}<small>{episode.duration_minutes ? `${episode.duration_minutes} min` : episode.synopsis}</small></span>{isEpisodeNew(episode.created_at) && <span className="episode-new">NEW</span>}{watched.has(episode.id) && <span className="episode-watched" aria-label="Watched">✓</span>}</Link><button type="button" className="episode-watched-toggle" aria-pressed={watched.has(episode.id)} aria-label={`${watched.has(episode.id) ? "Mark unwatched" : "Mark watched"}: ${episode.title}`} onClick={() => void toggle(episode.id)}>{watched.has(episode.id) ? "✓" : "○"}</button></li>)}</ol></details>)}</div>
  </section>;
}
