"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect,useRef,useState } from "react";
import { usePathname,useRouter } from "next/navigation";
import type { TitleSummary } from "@/lib/db";
import { IMAGE_BLUR_DATA_URL } from "@/lib/image-placeholder";
import { useScrollReveal } from "./useScrollReveal";

export function MediaCard({item,initialSaved=false,revealOrder=0}:{item:TitleSummary;initialSaved?:boolean;revealOrder?:number}) {
  const [saved,setSaved]=useState(initialSaved),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[posterFailed,setPosterFailed]=useState(!item.poster_url),[posterLoaded,setPosterLoaded]=useState(!item.poster_url);
  const pathname=usePathname(),router=useRouter();
  useEffect(()=>{setPosterFailed(!item.poster_url);setPosterLoaded(!item.poster_url);},[item.poster_url]);
  async function toggle(e:React.MouseEvent) {
    e.preventDefault();e.stopPropagation();if(busy)return;setBusy(true);setMessage("");
    try {const response=await fetch(saved?"/api/watchlist?titleId="+encodeURIComponent(item.id):"/api/watchlist",{method:saved?"DELETE":"POST",headers:saved?undefined:{"Content-Type":"application/json"},body:saved?undefined:JSON.stringify({titleId:item.id})});const data=await response.json();if(response.status===401){setMessage("Sign in to save");setTimeout(()=>location.assign("/login?next="+encodeURIComponent(location.pathname)),700);}else if(!response.ok)throw new Error(data.error||"Could not update watchlist");else{setSaved(!saved);if(pathname==="/watchlist")router.refresh();}}catch(error){setMessage(error instanceof Error?error.message:"Please try again.");}finally{setBusy(false);}
  }
  return <article className="media-card" style={{"--card-index":Math.min(8,Math.max(0,revealOrder))} as React.CSSProperties}>
    <Link href={"/title/"+item.slug} className="poster-link" aria-label={"View "+item.title}>
      <div className={"poster-wrap"+(posterFailed?" poster-failed":"")+(item.poster_url&&!posterLoaded?" poster-loading":"")}>{item.poster_url&&!posterFailed&&<Image fill sizes="(max-width: 650px) 44vw, 172px" src={item.poster_url} alt={item.title+" poster"} loading="lazy" placeholder="blur" blurDataURL={IMAGE_BLUR_DATA_URL} onLoad={()=>{setPosterLoaded(true);setPosterFailed(false);}} onError={e=>{e.currentTarget.style.visibility="hidden";setPosterLoaded(true);setPosterFailed(true);}}/>}<div className="poster-fallback" aria-hidden="true"><span>✦</span>{item.title}</div><span className="poster-type">{item.type==="movie"?"FILM":item.type==="variety"?"VARIETY":"SERIES"}</span>{item.demo===1&&<span className="demo-pill">SAMPLE</span>}{Number(item.has_sinhala_subtitles)===1&&<span className="poster-subtitle-badge" lang="si">සිංහල</span>}<span className="poster-play"><span>▶</span></span></div>
      <div className="card-meta"><h3>{item.title}</h3><div className="card-submeta"><span>{item.release_year||"—"}</span><i>·</i><span>{item.status==="ongoing"?"Ongoing":item.status==="upcoming"?"Coming soon":"Complete"}</span>{item.status==="ongoing"&&item.episode_count? <><i>·</i><span>{item.air_day&&`${item.air_day} · `}Ep {item.episode_count}{item.total_episodes?` of ${item.total_episodes}`:""}</span></>:null}</div>{Number(item.has_new_episode)===1&&<span className="new-episode-label">NEW EPISODE</span>}<p>{item.genres?.slice(0,2).join(" · ")}</p></div>
    </Link>
    <button className={"save-card"+(saved?" is-saved":"")} onClick={toggle} disabled={busy} aria-label={(saved?"Remove from":"Add to")+" watchlist: "+item.title} aria-pressed={saved}><span className="save-card-icon" aria-hidden="true">{saved?"✓":"＋"}</span></button>{message&&<span className="card-message" role="status">{message}</span>}
  </article>;
}

export function MediaRail({title,eyebrow,items,href}:{title:string;eyebrow?:string;items:TitleSummary[];href?:string}) {
  const rail=useRef<HTMLDivElement>(null);
  const section=useScrollReveal<HTMLElement>();
  const [canPrevious,setCanPrevious]=useState(false),[canNext,setCanNext]=useState(false);
  useEffect(()=>{const element=rail.current;if(!element)return;const update=()=>{const max=element.scrollWidth-element.clientWidth;setCanPrevious(element.scrollLeft>2);setCanNext(max>2&&element.scrollLeft<max-2);};update();element.addEventListener("scroll",update,{passive:true});window.addEventListener("resize",update);return()=>{element.removeEventListener("scroll",update);window.removeEventListener("resize",update);};},[items.length]);
  function scrollRail(direction:number){const element=rail.current;if(element)element.scrollBy({left:direction*Math.max(element.clientWidth*.8,240),behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});}
  if(!items.length)return null;
  return (
    <section ref={section} className="rail-section scroll-reveal">
      <div className="section-heading">
        <div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
        <div className="section-heading-actions">
          {items.length>1&&<RailControls label={title} canPrevious={canPrevious} canNext={canNext} onPrevious={()=>scrollRail(-1)} onNext={()=>scrollRail(1)}/>}
          {href&&<Link href={href} className="text-link">See all <span>↗</span></Link>}
        </div>
      </div>
      <div className="media-rail" ref={rail}>{items.map((item,index)=><MediaCard key={item.id} item={item} revealOrder={index}/>)}</div>
    </section>
  );
}

export function RailControls({label,canPrevious,canNext,onPrevious,onNext}:{label:string;canPrevious:boolean;canNext:boolean;onPrevious:()=>void;onNext:()=>void}){return <div className="rail-controls" role="group" aria-label={`${label} carousel controls`}><button type="button" onClick={onPrevious} disabled={!canPrevious} aria-label={`Scroll ${label} left`}>‹</button><button type="button" onClick={onNext} disabled={!canNext} aria-label={`Scroll ${label} right`}>›</button></div>}

