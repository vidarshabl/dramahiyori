"use client";
import Image from "next/image";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import type {TitleSummary} from "@/lib/db";
import {Icon} from "./SiteChrome";
import {MediaCard,RailControls} from "./MediaRail";
import {useScrollReveal} from "./useScrollReveal";
import { IMAGE_BLUR_DATA_URL } from "@/lib/image-placeholder";

const heroSlideKey=(item:TitleSummary)=>(item as TitleSummary&{slide_id?:string}).slide_id||item.id;
const artFallback="radial-gradient(ellipse at 72% 25%,rgba(232,62,104,.2),transparent 36%),linear-gradient(135deg,#211329,#11111a 70%,#08080d)";

function HeroArtwork({item,className,priority=false}:{item:TitleSummary;className:string;priority?:boolean}) {
 let source="";
 try{const url=new URL(item.backdrop_url);if(url.protocol==="https:"||url.protocol==="http:")source=url.toString();}catch{}
 return <div className={className} aria-hidden="true" style={{backgroundImage:artFallback}}>{source&&<Image fill src={source} alt="" sizes="100vw" quality={90} priority={priority} loading={priority?undefined:"lazy"} placeholder="blur" blurDataURL={IMAGE_BLUR_DATA_URL} unoptimized={source.startsWith("http:")} className="hero-art-image"/>}</div>;
}

export function FeaturedHero({items}:{items:TitleSummary[]}) {
 const previousIndex=useRef(0);const [index,setIndex]=useState(0),[previousItem,setPreviousItem]=useState<TitleSummary|null>(null),[paused,setPaused]=useState(false),[interacting,setInteracting]=useState(false),[reducedMotion,setReducedMotion]=useState(false);const item=items[index];
 const hasFeaturedRotation=items.length>1&&items.every(title=>title.featured===1),autoRotate=hasFeaturedRotation&&!reducedMotion;
 function changeSlide(nextIndex:number){if(nextIndex!==index)setIndex(nextIndex);}
 useEffect(()=>{if(index>=items.length){setPreviousItem(null);setIndex(0);}},[index,items.length]);
 useEffect(()=>{const previous=items[previousIndex.current];if(previous&&previousIndex.current!==index)setPreviousItem(previous);previousIndex.current=index;},[index,items]);
 useEffect(()=>{const preference=window.matchMedia("(prefers-reduced-motion: reduce)"),sync=()=>setReducedMotion(preference.matches);sync();preference.addEventListener?.("change",sync);return()=>preference.removeEventListener?.("change",sync);},[]);
 useEffect(()=>{if(!previousItem)return;const delay=window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:820;const timer=window.setTimeout(()=>setPreviousItem(null),delay);return()=>window.clearTimeout(timer);},[previousItem]);
 useEffect(()=>{if(!autoRotate||paused||interacting||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;let timer:number|undefined;const schedule=()=>{if(timer)window.clearTimeout(timer);if(!document.hidden)timer=window.setTimeout(()=>setIndex(current=>(current+1)%items.length),8500);};schedule();document.addEventListener("visibilitychange",schedule);return()=>{if(timer)window.clearTimeout(timer);document.removeEventListener("visibilitychange",schedule);};},[autoRotate,items.length,index,paused,interacting]);
 if(!item)return null;
 const canPlay=item.has_playable_source===1;
 const watchHref="/watch?"+new URLSearchParams({slug:item.slug,...(item.first_playable_episode_id?{episode:item.first_playable_episode_id}:{})}).toString();
 const meta=[item.alternative_title,item.release_year?String(item.release_year):"",item.type==="movie"?"Film":"Series"].filter(Boolean);
 return <section className="hero" onMouseEnter={()=>setInteracting(true)} onMouseLeave={()=>setInteracting(false)} onFocusCapture={()=>setInteracting(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setInteracting(false);}} onTouchStart={()=>setPaused(true)}>
   {previousItem&&<HeroArtwork key={"out-"+heroSlideKey(previousItem)} item={previousItem} className="hero-art hero-art-outgoing"/>}
   <HeroArtwork key={heroSlideKey(item)} item={item} className="hero-art hero-art-incoming" priority={index===0}/>
   <div className="hero-grain"/><div className="hero-copy" key={heroSlideKey(item)}><div className="hero-overline"><span className="featured-mark"><Icon name="spark"/></span> {item.featured===1?"FEATURED STORY":"A STORY TO STAY"} <span className="overline-line"/></div><span className="hero-demo">{item.demo===1?"SAMPLE STORY":item.featured===1?"FEATURED TITLE":"FROM THE COLLECTION"}</span><h1>{item.title}</h1>{meta.length>0&&<p className="hero-alt">{meta.map((value,metaIndex)=><span key={value}>{metaIndex>0&&<i aria-hidden="true"> · </i>}{value}</span>)}</p>}<div className="hero-genres">{item.genres?.slice(0,3).map(g=><span key={g}>{g}</span>)}</div>{item.synopsis&&<p className="hero-synopsis">{item.synopsis}</p>}<div className="hero-actions">{canPlay?<><Link href={watchHref} className="button button-primary"><Icon name="play"/> Watch now</Link><Link href={"/title/"+item.slug} className="button button-glass">More details <span>↗</span></Link></>:<Link href={"/title/"+item.slug} className="button button-primary">Explore story <span>↗</span></Link>}</div>{(item.demo===1||item.country)&&<div className="hero-note"><span>✧</span> {item.demo===1?"An original sample story for demonstration":item.country}</div>}</div>
   {items.length>1&&<div className="hero-controls"><span className="hero-counter">{String(index+1).padStart(2,"0")} <i>/</i> {String(items.length).padStart(2,"0")}</span><div className="hero-progress" role="group" aria-label="Choose a featured story">{items.map((slide,slideIndex)=><button type="button" key={heroSlideKey(slide)} className={slideIndex===index?"is-active":""} aria-label={`Show featured story ${slideIndex+1}`} aria-pressed={slideIndex===index} onClick={()=>changeSlide(slideIndex)}/>)}</div>{autoRotate&&<button type="button" className="hero-control" aria-label={paused?"Resume featured story rotation":"Pause featured story rotation"} aria-pressed={paused} onClick={()=>{setPaused(value=>!value);setInteracting(false);}}>{paused?"▶":"Ⅱ"}</button>}<button type="button" className="hero-control" aria-label="Previous featured story" onClick={()=>changeSlide((index+items.length-1)%items.length)}>←</button><button type="button" className="hero-control" aria-label="Next featured story" onClick={()=>changeSlide((index+1)%items.length)}>→</button></div>}
   <div className="hero-side-label">A NEW CHAPTER BEGINS <span>✦</span></div>
 </section>;
}

export function ContinueWatching(){
 const [items,setItems]=useState<any[]>([]);
 const rail=useRef<HTMLDivElement>(null);
 const section=useScrollReveal<HTMLElement>();
 const [canPrevious,setCanPrevious]=useState(false),[canNext,setCanNext]=useState(false);
 useEffect(()=>{fetch("/api/progress").then(r=>r.json()).then(d=>setItems(d.items||[])).catch(()=>{});},[]);
 useEffect(()=>{const element=rail.current;if(!element)return;const update=()=>{const max=element.scrollWidth-element.clientWidth;setCanPrevious(element.scrollLeft>2);setCanNext(max>2&&element.scrollLeft<max-2);};update();element.addEventListener("scroll",update,{passive:true});window.addEventListener("resize",update);return()=>{element.removeEventListener("scroll",update);window.removeEventListener("resize",update);};},[items.length]);
 function scrollRail(direction:number){const element=rail.current;if(element)element.scrollBy({left:direction*Math.max(element.clientWidth*.8,240),behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});}
 if(!items.length)return null;
 return <section ref={section} className="continue-section scroll-reveal"><div className="section-heading"><div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Continue watching</h2></div>{items.length>1&&<RailControls label="Continue watching" canPrevious={canPrevious} canNext={canNext} onPrevious={()=>scrollRail(-1)} onNext={()=>scrollRail(1)}/>}</div><div className="continue-rail" ref={rail}>{items.map(item=><Link href={"/watch?slug="+item.slug+(item.episode_id?"&episode="+item.episode_id:"")} key={item.title_id} className="continue-card"><div className="continue-thumb">{item.poster_url&&<Image fill sizes="84px" src={item.poster_url} alt="" loading="lazy" placeholder="blur" blurDataURL={IMAGE_BLUR_DATA_URL}/>}<span className="continue-play">▶</span><span className="progress-track"><i style={{width:(item.duration_seconds?Math.min(100,Math.max(3,item.position_seconds/item.duration_seconds*100)):3)+"%"}}/></span></div><div><h3>{item.title}</h3><span>{item.episode_number?"Episode "+item.episode_number+" · ":""}Continue watching</span></div></Link>)}</div></section>;
}

export function MoodGrid({moods}:{moods:string[]}) {const section=useScrollReveal<HTMLElement>();return <section ref={section} className="mood-section scroll-reveal"><div className="section-heading"><div><span className="eyebrow">TELL US HOW YOU FEEL</span><h2>Stories for this mood</h2></div><Link href="/genres" className="text-link">All genres <span>↗</span></Link></div><div className="mood-grid">{moods.map((m,i)=><Link href={"/browse?genre="+encodeURIComponent(m)} className={"mood-tile mood-"+(i%5)} key={m}><span className="mood-spark">{["✦","☾","♡","✧","⋆"][i%5]}</span><span>{m}</span><span className="mood-arrow">↗</span></Link>)}</div></section>}

export function ResultsGrid({items,empty="No titles found yet."}:{items:TitleSummary[];empty?:string}){if(!items.length)return <div className="empty-state"><span>☾</span><h2>{empty}</h2><p>Try another search or browse a different mood.</p><Link href="/genres" className="text-link">Explore genres <span>↗</span></Link></div>;return <div className="results-grid">{items.map(item=><MediaCard key={item.id} item={item}/>)}</div>}
