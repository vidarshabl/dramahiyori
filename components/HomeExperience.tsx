"use client";
import Image from "next/image";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import type {Title} from "@/lib/db";
import {Icon} from "./SiteChrome";
import {MediaCard,RailControls} from "./MediaRail";
import {useScrollReveal} from "./useScrollReveal";

export function FeaturedHero({items}:{items:Title[]}) {
 const [index,setIndex]=useState(0),[previousItem,setPreviousItem]=useState<Title|null>(null);const item=items[index];
 function changeSlide(nextIndex:number){if(nextIndex===index)return;setPreviousItem(item);setIndex(nextIndex);}
 useEffect(()=>{if(!previousItem)return;const delay=window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:820;const timer=window.setTimeout(()=>setPreviousItem(null),delay);return()=>window.clearTimeout(timer);},[previousItem]);
 if(!item)return null;
 return <section className="hero">
   {previousItem&&<div key={"out-"+previousItem.id} className="hero-art hero-art-outgoing" aria-hidden="true" style={{backgroundImage:"url('"+previousItem.backdrop_url+"')"}}/>}
   <div key={item.id} className="hero-art hero-art-incoming" aria-hidden="true" style={{backgroundImage:"url('"+item.backdrop_url+"')"}}/>
   <div className="hero-grain"/><div className="hero-copy" key={item.id}><div className="hero-overline"><span className="featured-mark"><Icon name="spark"/></span> EDITOR’S LITTLE FAVORITE <span className="overline-line"/></div><span className="hero-demo">SAMPLE STORY</span><h1>{item.title}</h1><p className="hero-alt">{item.alternative_title} <span>·</span> {item.release_year} <span>·</span> {item.type==="movie"?"Film":"Series"}</p><div className="hero-genres">{item.genres?.slice(0,3).map(g=><span key={g}>{g}</span>)}</div><p className="hero-synopsis">{item.synopsis}</p><div className="hero-actions"><Link href={"/watch?slug="+item.slug} className="button button-primary"><Icon name="play"/> Watch now</Link><Link href={"/title/"+item.slug} className="button button-glass">More details <span>↗</span></Link></div><div className="hero-note"><span>✧</span> A cozy, original demonstration title</div></div>
   <div className="hero-controls"><span className="hero-counter">0{index+1} <i>/</i> 0{items.length}</span>{items.length>1&&<div className="hero-progress" role="group" aria-label="Choose a featured story">{items.map((slide,slideIndex)=><button type="button" key={slide.id} className={slideIndex===index?"is-active":""} aria-label={`Show featured story ${slideIndex+1}`} aria-pressed={slideIndex===index} onClick={()=>changeSlide(slideIndex)}/>)}</div>}<button className="hero-control" aria-label="Previous featured story" onClick={()=>changeSlide((index+items.length-1)%items.length)}>←</button><button className="hero-control" aria-label="Next featured story" onClick={()=>changeSlide((index+1)%items.length)}>→</button></div>
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
 function scrollRail(direction:number){const element=rail.current;if(element)element.scrollBy({left:direction*Math.max(element.clientWidth*.8,240),behavior:"smooth"});}
 if(!items.length)return null;
 return <section ref={section} className="continue-section scroll-reveal"><div className="section-heading"><div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Continue watching</h2></div>{items.length>1&&<RailControls label="Continue watching" canPrevious={canPrevious} canNext={canNext} onPrevious={()=>scrollRail(-1)} onNext={()=>scrollRail(1)}/>}</div><div className="continue-rail" ref={rail}>{items.map(item=><Link href={"/watch?slug="+item.slug+(item.episode_id?"&episode="+item.episode_id:"")} key={item.title_id} className="continue-card"><div className="continue-thumb">{item.poster_url&&<Image fill sizes="84px" src={item.poster_url} alt=""/>}<span className="continue-play">▶</span><span className="progress-track"><i style={{width:(item.duration_seconds?Math.min(100,Math.max(3,item.position_seconds/item.duration_seconds*100)):3)+"%"}}/></span></div><div><h3>{item.title}</h3><span>{item.episode_number?"Episode "+item.episode_number+" · ":""}Continue watching</span></div></Link>)}</div></section>;
}

export function MoodGrid({moods}:{moods:string[]}) {const section=useScrollReveal<HTMLElement>();return <section ref={section} className="mood-section scroll-reveal"><div className="section-heading"><div><span className="eyebrow">TELL US HOW YOU FEEL</span><h2>Stories for this mood</h2></div><Link href="/genres" className="text-link">All genres <span>↗</span></Link></div><div className="mood-grid">{moods.map((m,i)=><Link href={"/browse?genre="+encodeURIComponent(m)} className={"mood-tile mood-"+(i%5)} key={m}><span className="mood-spark">{["✦","☾","♡","✧","⋆"][i%5]}</span><span>{m}</span><span className="mood-arrow">↗</span></Link>)}</div></section>}

export function ResultsGrid({items,empty="No titles found yet."}:{items:Title[];empty?:string}){if(!items.length)return <div className="empty-state"><span>☾</span><h2>{empty}</h2><p>Try another search or browse a different mood.</p><Link href="/genres" className="text-link">Explore genres <span>↗</span></Link></div>;return <div className="results-grid">{items.map(item=><MediaCard key={item.id} item={item}/>)}</div>}
