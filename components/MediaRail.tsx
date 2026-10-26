"use client";
import Link from "next/link";
import { useState } from "react";
import type { Title } from "@/lib/db";

export function MediaCard({item,initialSaved=false}:{item:Title;initialSaved?:boolean}) {
  const [saved,setSaved]=useState(initialSaved),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function toggle(e:React.MouseEvent) {
    e.preventDefault();e.stopPropagation();if(busy)return;setBusy(true);setMessage("");
    try {const response=await fetch(saved?"/api/watchlist?titleId="+encodeURIComponent(item.id):"/api/watchlist",{method:saved?"DELETE":"POST",headers:saved?undefined:{"Content-Type":"application/json"},body:saved?undefined:JSON.stringify({titleId:item.id})});const data=await response.json();if(response.status===401){setMessage("Sign in to save");setTimeout(()=>location.assign("/login?next="+encodeURIComponent(location.pathname)),700);}else if(!response.ok)throw new Error(data.error||"Could not update watchlist");else setSaved(!saved);}catch(error){setMessage(error instanceof Error?error.message:"Please try again.");}finally{setBusy(false);}
  }
  return <article className="media-card">
    <Link href={"/title/"+item.slug} className="poster-link" aria-label={"View "+item.title}>
      <div className="poster-wrap"><img src={item.poster_url||""} alt={item.title+" poster"} loading="lazy" onError={e=>{e.currentTarget.style.visibility="hidden";}}/><div className="poster-fallback" aria-hidden="true"><span>✦</span>{item.title}</div><span className="poster-type">{item.type==="movie"?"FILM":"SERIES"}</span>{item.demo===1&&<span className="demo-pill">SAMPLE</span>}<span className="poster-play"><span>▶</span></span></div>
      <div className="card-meta"><h3>{item.title}</h3><div className="card-submeta"><span>{item.release_year||"—"}</span><i>·</i><span>{item.status==="ongoing"?"Ongoing":item.status==="upcoming"?"Coming soon":"Complete"}</span></div><p>{item.genres?.slice(0,2).join(" · ")}</p></div>
    </Link>
    <button className={"save-card"+(saved?" is-saved":"")} onClick={toggle} disabled={busy} aria-label={(saved?"Remove from":"Add to")+" watchlist: "+item.title} aria-pressed={saved}>{saved?"♥":"＋"}</button>{message&&<span className="card-message" role="status">{message}</span>}
  </article>;
}

export function MediaRail({title,eyebrow,items,href}:{title:string;eyebrow?:string;items:Title[];href?:string}) {
  if(!items.length)return null;
  return <section className="rail-section"><div className="section-heading"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{href&&<Link href={href} className="text-link">See all <span>↗</span></Link>}</div><div className="media-rail">{items.map(item=><MediaCard key={item.id} item={item}/>)}</div></section>;
}

