import Link from "next/link";
import {notFound} from "next/navigation";
import {getTitle} from "@/lib/db";
import {isAllowedMediaUrl} from "@/lib/security";
import {VideoPlayer} from "@/components/VideoPlayer";
export const runtime="nodejs";export const dynamic="force-dynamic";export const metadata={title:"Watch",robots:{index:false,follow:false}};
export default async function WatchPage({searchParams}:{searchParams:Promise<{slug?:string;episode?:string}>}){
 const {slug,episode}=await searchParams;if(!slug)notFound();const item=getTitle(slug) as any;if(!item)notFound();
 const episodes=item.seasons?.flatMap((s:any)=>s.episodes)||[];const current=episode?episodes.find((e:any)=>e.id===episode):episodes[0]||null;
 if(episode&&!current)notFound();
 const source=current?.video_url||item.video_url||"";const playable=source&&isAllowedMediaUrl(source)?source:"";
 const currentIndex=current?episodes.findIndex((e:any)=>e.id===current.id):-1;
 return <main className="watch-page"><div className="watch-topline"><Link href={"/title/"+item.slug}>← Back to {item.title}</Link><span className="eyebrow">{item.type==="series"?"A DEARDRAMA SERIES":"A DEARDRAMA FILM"}</span></div><h1>{item.title}</h1>{current&&<p className="watch-episode-label">Season 1 · Episode {current.episode_number} · {current.title}</p>}<VideoPlayer src={playable} titleId={item.id} episodeId={current?.id||null} subtitles={current?.subtitles||[]}/><div className="watch-below"><p>{current?.synopsis||item.synopsis}</p>{episodes.length>0&&<div className="episode-switch"><span>More episodes</span>{currentIndex>0&&<Link href={"/watch?slug="+slug+"&episode="+episodes[currentIndex-1].id}>← Previous</Link>}{currentIndex<episodes.length-1&&<Link href={"/watch?slug="+slug+"&episode="+episodes[currentIndex+1].id}>Next →</Link>}</div>}</div><p className="player-note">Only administrator-configured, authorized media sources can play here. Demo episodes intentionally have no stream.</p></main>;
}
