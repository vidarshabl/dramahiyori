import Link from "next/link";
import { notFound } from "next/navigation";
import { getTitle } from "@/lib/catalog";
import { isValidMediaUrl } from "@/lib/security";
import { VideoPlayer } from "@/components/VideoPlayer";
import { EpisodeList } from "@/components/EpisodeList";
import { getNextPlayableEpisode } from "@/lib/watch-utils";
import { getSiteOrigin } from "@/lib/site-url";
import { DownloadButton } from "@/components/DownloadButton";

function watchPath(slug: string, episode: any) { return `/watch/${encodeURIComponent(slug)}/${episode.season_number}-${episode.episode_number}`; }

export async function WatchExperience({ slug, episodeId, position }: { slug: string; episodeId?: string; position?: string }) {
  const item = await getTitle(slug) as any;
  if (!item) notFound();
  const episodes = (item.seasons || []).flatMap((season: any) => season.episodes || []);
  let current = episodeId ? episodes.find((episode: any) => episode.id === episodeId) : null;
  if (position) {
    const match = /^(\d{1,2})-(\d{1,3})$/.exec(position);
    if (!match) notFound();
    current = episodes.find((episode: any) => Number(episode.season_number) === Number(match[1]) && Number(episode.episode_number) === Number(match[2]));
  }
  if ((episodeId || position) && !current) notFound();
  if (!current && episodes.length) current = episodes.find((episode: any) => episode.sources?.length || episode.video_url) || episodes[0];
  const sources: any[] = current ? [...(current.sources || []), ...(item.sources || [])] : [...(item.sources || [])];
  const legacyUrl = current?.video_url || item.video_url || "";
  if (legacyUrl && !sources.some((source) => source.url === legacyUrl)) sources.push({ kind: legacyUrl.toLowerCase().includes(".m3u8") ? "hls" : "mp4", quality: "auto", url: legacyUrl, priority: -1000 });
  const playableSources = sources.filter((source, index, list) => isValidMediaUrl(source.url) && list.findIndex((candidate) => candidate.url === source.url) === index);
  const playable = playableSources[0]?.url || "";
  const currentIndex = current ? episodes.findIndex((episode: any) => episode.id === current.id) : -1;
  const navigableEpisodes = episodes.map((episode:any)=>({...episode,playable:Boolean(episode.video_url||episode.sources?.length||item.video_url||item.sources?.length)}));
  const next = current ? getNextPlayableEpisode(navigableEpisodes,current.id) : null;
  const nextUrl = next ? watchPath(item.slug, next) : "";
  const reportTargetType = current?.sources?.[0]?.id ? "video_source" : current ? "episode" : item.sources?.[0]?.id ? "video_source" : "title";
  const reportTargetId = current?.sources?.[0]?.id || current?.id || item.sources?.[0]?.id || item.id;
  const downloads = current?.downloads?.length ? current.downloads : item.downloads || [];
  const subtitles = current?.subtitles?.length ? current.subtitles : item.subtitles || [];

  const episodeSchema=current?{"@context":"https://schema.org","@type":"TVEpisode",name:current.title,description:current.synopsis||undefined,episodeNumber:current.episode_number,datePublished:current.air_date||undefined,partOfSeason:{"@type":"TVSeason",seasonNumber:current.season_number||1},partOfSeries:{"@type":"TVSeries",name:item.title,url:new URL(`/title/${encodeURIComponent(item.slug)}`,getSiteOrigin()).toString()}}:null;
  return <main className="watch-page">{episodeSchema&&<script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(episodeSchema).replace(/</g,"\\u003c")}}/>}
    <div className="watch-topline"><Link href={`/title/${encodeURIComponent(item.slug)}`}>← Back to {item.title}</Link><span className="eyebrow">{item.type === "movie" ? "A KVERSE FILM" : item.type === "variety" ? "A KVERSE VARIETY SHOW" : "A KVERSE SERIES"}</span></div>
    <h1>{item.sinhala_title ? <>{item.title}<small className="watch-sinhala-title">{item.sinhala_title}</small></> : item.title}</h1>
    {current && <p className="watch-episode-label">Season {current.season_number || 1} · Episode {current.episode_number} · {current.title}{current.duration_minutes ? ` · ${current.duration_minutes} min` : ""}</p>}
    <VideoPlayer src={playable} sources={playableSources} titleId={item.id} titleSlug={item.slug} title={item.title} posterUrl={item.poster_url||""} episodeId={current?.id || null} episodeNumber={current?.episode_number||null} subtitles={subtitles} nextUrl={nextUrl}/>
    <div className="watch-below"><p>{current?.synopsis || item.synopsis}</p>
      {downloads.length > 0 && <section className="download-panel"><div><span className="eyebrow">TAKE IT WITH YOU</span><h2>Downloads</h2></div><div className="download-links">{downloads.map((download: any) => <DownloadButton key={download.id} id={download.id} quality={download.quality} sizeMb={download.size_mb} hostLabel={download.host_label}/>)}</div></section>}
      {episodes.length > 0 && <div className="episode-switch"><span>More episodes</span>{currentIndex > 0 && <Link href={watchPath(item.slug, episodes[currentIndex - 1])}>← Previous</Link>}{next && <Link href={watchPath(item.slug, next)}>Next →</Link>}</div>}
      <Link className="text-link watch-report-link" href={`/report?targetType=${reportTargetType}&targetId=${encodeURIComponent(reportTargetId)}&reason=broken_link`}>Report a broken link ↗</Link>
      {episodes.length > 0 && <EpisodeList titleId={item.id} slug={item.slug} seasons={item.seasons} currentEpisodeId={current?.id || ""}/>}
    </div>
    {!playable && <p className="player-note">No administrator-configured stream is available for this title yet.</p>}
  </main>;
}
