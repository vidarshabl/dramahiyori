"use client";
import Image from "next/image";
import Link from "next/link";
import {useEffect,useState} from "react";
import type {Title} from "@/lib/db";
import {Icon} from "./SiteChrome";
import {MediaCard} from "./MediaRail";

export function FeaturedHero({items}:{items:Title[]}) {
 const [index,setIndex]=useState(0);const item=items[index];
 if(!item)return null;
 return <section className="hero" style={{backgroundImage:"linear-gradient(90deg,rgba(13,17,32,.9) 0%,rgba(13,17,32,.56) 45%,rgba(13,17,32,.08) 100%),linear-gradient(0deg,#101321 0%,transparent 36%),url('"+item.backdrop_url+"')"}}>
   <div className="hero-grain"/><div className="hero-copy"><div className="hero-overline"><span className="featured-mark"><Icon name="spark"/></span> EDITOR’S LITTLE FAVORITE <span className="overline-line"/></div><span className="hero-demo">SAMPLE STORY</span><h1>{item.title}</h1><p className="hero-alt">{item.alternative_title} <span>·</span> {item.release_year} <span>·</span> {item.type==="movie"?"Film":"Series"}</p><div className="hero-genres">{item.genres?.slice(0,3).map(g=><span key={g}>{g}</span>)}</div><p className="hero-synopsis">{item.synopsis}</p><div className="hero-actions"><Link href={"/watch?slug="+item.slug} className="button button-primary"><Icon name="play"/> Watch now</Link><Link href={"/title/"+item.slug} className="button button-glass">More details <span>↗</span></Link></div><div className="hero-note"><span>✧</span> A cozy, original demonstration title</div></div>
   <div className="hero-controls"><span className="hero-counter">0{index+1} <i>/</i> 0{items.length}</span><button className="hero-control" aria-label="Previous featured story" onClick={()=>setIndex((index+items.length-1)%items.length)}>←</button><button className="hero-control" aria-label="Next featured story" onClick={()=>setIndex((index+1)%items.length)}>→</button></div>
   <div className="hero-side-label">A NEW CHAPTER BEGINS <span>✦</span></div>
 </section>;
}

export function ContinueWatching(){
 const [items,setItems]=useState<any[]>([]);
 useEffect(()=>{fetch("/api/progress").then(r=>r.json()).then(d=>setItems(d.items||[])).catch(()=>{});},[]);
 if(!items.length)return null;
 return <section className="continue-section"><div className="section-heading"><div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Continue watching</h2></div></div><div className="continue-rail">{items.map(item=><Link href={"/watch?slug="+item.slug+(item.episode_id?"&episode="+item.episode_id:"")} key={item.title_id} className="continue-card"><div className="continue-thumb">{item.poster_url&&<Image fill sizes="84px" src={item.poster_url} alt=""/>}<span className="continue-play">▶</span><span className="progress-track"><i style={{width:(item.duration_seconds?Math.min(100,Math.max(3,item.position_seconds/item.duration_seconds*100)):3)+"%"}}/></span></div><div><h3>{item.title}</h3><span>{item.episode_number?"Episode "+item.episode_number+" · ":""}Continue watching</span></div></Link>)}</div></section>;
}

export function MoodGrid({moods}:{moods:string[]}) {return <section className="mood-section"><div className="section-heading"><div><span className="eyebrow">TELL US HOW YOU FEEL</span><h2>Stories for this mood</h2></div><Link href="/genres" className="text-link">All genres <span>↗</span></Link></div><div className="mood-grid">{moods.map((m,i)=><Link href={"/browse?genre="+encodeURIComponent(m)} className={"mood-tile mood-"+(i%5)} key={m}><span className="mood-spark">{["✦","☾","♡","✧","⋆"][i%5]}</span><span>{m}</span><span className="mood-arrow">↗</span></Link>)}</div></section>}

export function ResultsGrid({items,empty="No titles found yet."}:{items:Title[];empty?:string}){if(!items.length)return <div className="empty-state"><span>☾</span><h2>{empty}</h2><p>Try another search or browse a different mood.</p><Link href="/genres" className="text-link">Explore genres <span>↗</span></Link></div>;return <div className="results-grid">{items.map(item=><MediaCard key={item.id} item={item}/>)}</div>}
