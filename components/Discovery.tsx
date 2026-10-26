"use client";
import {useEffect,useState} from "react";
import {usePathname,useRouter} from "next/navigation";
import type {Title} from "@/lib/db";
import {ResultsGrid} from "./HomeExperience";

type Filters={q?:string;genre?:string;country?:string;year?:string;type?:string;status?:string;sort?:string};
export function SearchExperience({initialFilters={},genres=[],countries=[],years=[]}:{initialFilters?:Filters;genres?:string[];countries?:string[];years?:number[]}) {
 const [filters,setFilters]=useState<Filters>({...initialFilters}),[items,setItems]=useState<Title[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[page,setPage]=useState(1),[hasMore,setHasMore]=useState(false);
 const router=useRouter(),pathname=usePathname();
 useEffect(()=>{const timer=setTimeout(async()=>{setLoading(true);setError("");const params=new URLSearchParams();Object.entries(filters).forEach(([k,v])=>{if(v)params.set(k,v);});if(page>1)params.set("page",String(page));router.replace(pathname+(params.toString()?"?"+params.toString():""),{scroll:false});try{const res=await fetch("/api/titles?"+params.toString(),{cache:"no-store"});if(!res.ok)throw new Error("Titles could not be loaded.");const data=await res.json();setItems(old=>page===1?data.items||[]:[...old,...(data.items||[])]);setHasMore((data.items||[]).length===24);}catch(err){setError(err instanceof Error?err.message:"Please check your connection.");}finally{setLoading(false);}},250);return()=>clearTimeout(timer);},[filters,page,pathname,router]);
 function change(key:keyof Filters,value:string){setPage(1);setFilters(f=>({...f,[key]:value||undefined}));}
 function clear(){setPage(1);setFilters({});}
 return <div className="discovery-wrap"><div className="discovery-tools">
  <label className="search-field"><span>⌕</span><input list="title-suggestions" value={filters.q||""} onChange={e=>change("q",e.target.value)} placeholder="Search by title or alternate title" aria-label="Search by title or alternate title"/><datalist id="title-suggestions">{items.slice(0,8).map(t=><option key={t.id} value={t.title}/>)}</datalist></label>
  <select value={filters.genre||""} onChange={e=>change("genre",e.target.value)} aria-label="Filter by genre"><option value="">All moods & genres</option>{genres.map(g=><option key={g}>{g}</option>)}</select>
  <select value={filters.country||""} onChange={e=>change("country",e.target.value)} aria-label="Filter by country"><option value="">All countries</option>{countries.map(x=><option key={x}>{x}</option>)}</select>
  <select value={filters.year||""} onChange={e=>change("year",e.target.value)} aria-label="Filter by release year"><option value="">Any year</option>{years.map(x=><option key={x}>{x}</option>)}</select>
  <select value={filters.type||""} onChange={e=>change("type",e.target.value)} aria-label="Filter by content type"><option value="">Movies & series</option><option value="series">Series</option><option value="movie">Movies</option></select>
  <select value={filters.status||""} onChange={e=>change("status",e.target.value)} aria-label="Filter by completion status"><option value="">Any status</option><option value="ongoing">Ongoing</option><option value="completed">Completed</option><option value="upcoming">Upcoming</option></select>
  <select value={filters.sort||"newest"} onChange={e=>change("sort",e.target.value)} aria-label="Sort titles"><option value="newest">Recently added</option><option value="popular">Popular</option><option value="alpha">A to Z</option><option value="oldest">Oldest release</option></select>
  <button className="clear-filters" onClick={clear}>Clear filters</button></div>
  <div className="results-status" aria-live="polite">{error?<span className="error-text">{error}</span>:loading?"Finding stories…":items.length+" stories to explore"}</div>
  {loading&&page===1?<div className="results-grid">{Array.from({length:8},(_,i)=><div className="skeleton-card" key={i}><div/><span/></div>)}</div>:<ResultsGrid items={items} empty="No stories in this corner yet."/>}
  {hasMore&&<div className="load-more-wrap"><button className="button button-outline" onClick={()=>setPage(n=>n+1)} disabled={loading}>{loading?"Finding more…":"Show more stories"}</button></div>}
 </div>;
}