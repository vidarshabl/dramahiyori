"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { EpisodeRelease } from "@/lib/db";
import { IMAGE_BLUR_DATA_URL } from "@/lib/image-placeholder";

function TimeAgo({ date }: { date: string }) {
  const [label, setLabel] = useState("New episode");
  useEffect(() => {
    const render = () => {
      const rawDate = typeof date === "string" ? date.trim() : "";
      const normalizedDate = /^\d{4}-\d{2}-\d{2} \d/.test(rawDate) ? rawDate.replace(" ", "T") + "Z" : rawDate;
      const parsedDate = Date.parse(normalizedDate);
      if (!Number.isFinite(parsedDate)) { setLabel("New episode"); return; }
      const seconds = Math.max(0, Math.floor((Date.now() - parsedDate) / 1000));
      const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [[60,"second"],[3600,"minute"],[86400,"hour"],[604800,"day"],[2629800,"week"],[31557600,"month"]];
      let amount = seconds, unit: Intl.RelativeTimeFormatUnit = "second";
      for (const [threshold,nextUnit] of units) { if (seconds >= threshold) { amount = Math.floor(seconds / threshold); unit = nextUnit; } }
      setLabel(new Intl.RelativeTimeFormat(undefined,{numeric:"auto"}).format(-amount,unit));
    };
    render(); const timer=window.setInterval(render,60_000); return()=>window.clearInterval(timer);
  },[date]);
  return <time dateTime={date}>{label}</time>;
}

export function EpisodeReleaseRail({ items }: { items: EpisodeRelease[] }) {
  if (!items.length) return null;
  return <section className="episode-release-section">
    <div className="section-heading"><div><span className="eyebrow">FRESH FROM THE STORY</span><h2>Latest episodes</h2></div><Link href="/new" className="text-link">All new releases <span>↗</span></Link></div>
    <div className="episode-release-rail">{items.map((episode)=><Link className="episode-release-card" key={episode.id} href={`/watch/${encodeURIComponent(episode.slug)}/${episode.season_number}-${episode.episode_number}`}>
      <span className="episode-release-poster">{episode.poster_url&&<Image fill src={episode.poster_url} alt="" sizes="(max-width: 640px) 42vw, 180px" loading="lazy" placeholder="blur" blurDataURL={IMAGE_BLUR_DATA_URL}/>}<span className="episode-release-play" aria-hidden="true">▶</span></span>
      <span className="episode-release-copy"><strong>{episode.title}</strong><span>S{episode.season_number} · E{episode.episode_number} · {episode.episode_title}</span><small><TimeAgo date={episode.created_at}/>{Number(episode.has_sinhala_subtitles)===1&&<span lang="si">සිංහල උපසිරැසි</span>}</small></span>
    </Link>)}</div>
  </section>;
}
