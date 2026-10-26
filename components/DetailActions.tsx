"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
export function DetailActions({id,slug}:{id:string;slug:string}) {
 const [saved,setSaved]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{fetch("/api/watchlist").then(r=>r.json()).then(d=>setSaved((d.items||[]).some((item:any)=>item.id===id))).catch(()=>{});},[id]);
 async function toggle(){setMessage("");const res=await fetch(saved?"/api/watchlist?titleId="+encodeURIComponent(id):"/api/watchlist",{method:saved?"DELETE":"POST",headers:saved?undefined:{"Content-Type":"application/json"},body:saved?undefined:JSON.stringify({titleId:id})});const data=await res.json();if(!res.ok){setMessage(data.error||"Please try again.");return;}setSaved(!saved);}
 return <div className="detail-actions"><Link className="button button-primary" href={"/watch?slug="+slug}><span>▶</span> Watch now</Link><button className={"button button-glass"+(saved?" saved-button":"")} onClick={toggle}>{saved?"♥":"＋"} {saved?"In your watchlist":"Add to watchlist"}</button>{message&&<span role="status" className="action-message">{message}</span>}</div>;
}
