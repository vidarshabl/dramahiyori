"use client";

import Link from "next/link";
import {FormEvent,useCallback,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {RemoteImage} from "./RemoteImage";

type Photo={url:string;caption:string;attribution:string};
type Credit={titleId:string;characterName:string;roleType:"cast"|"director"|"writer"|"producer";sortOrder:number};
type TitleOption={id:string;title:string;published:number};
type CastItem={id:string;slug:string;name:string;biography:string;nationality:string;profession:string;portrait_url:string;credits:Credit[];gallery:Photo[]};
type MediaItem={id:string;url:string;pathname:string;filename:string;content_type:string;size_bytes:number;created_at:string};
const blankPerson={name:"",slug:"",biography:"",nationality:"",profession:"Actor",portraitUrl:""};
function mediaDate(value:string){const date=new Date(value.replace(" ","T")+"Z");return Number.isNaN(date.getTime())?"Date unavailable":new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(date);}

export function CastStudio({assetUrls=[]}:{assetUrls?:string[]}) {
  const router=useRouter();
  const [members,setMembers]=useState<CastItem[]>([]),[titles,setTitles]=useState<TitleOption[]>([]),[person,setPerson]=useState(blankPerson),[credits,setCredits]=useState<Credit[]>([]),[gallery,setGallery]=useState<Photo[]>([]);
  const [editing,setEditing]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const portraitListId="cast-media-url-list";

  const load=useCallback(async()=>{
    const response=await fetch("/api/admin/cast");
    if(response.status===403){router.replace("/admin/login");return;}
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Cast profiles could not be loaded.");
    setMembers(data.items||[]);setTitles(data.titles||[]);
  },[router]);
  useEffect(()=>{load().catch(reason=>setError(reason instanceof Error?reason.message:"Cast profiles could not be loaded."));},[load]);

  function reset() {setEditing("");setPerson({...blankPerson});setCredits([]);setGallery([]);}
  function edit(member:CastItem) {
    setEditing(member.id);setPerson({name:member.name,slug:member.slug,biography:member.biography||"",nationality:member.nationality||"",profession:member.profession||"",portraitUrl:member.portrait_url||""});
    setCredits((member.credits||[]).map((credit:any)=>({titleId:credit.title_id,characterName:credit.character_name||"",roleType:credit.role_type,sortOrder:Number(credit.sort_order)||0})));
    setGallery((member.gallery||[]).map((photo:any)=>({url:photo.image_url,caption:photo.caption||"",attribution:photo.attribution||""})));
    setMessage("");setError("");window.scrollTo({top:0,behavior:"smooth"});
  }
  async function save(event:FormEvent) {
    event.preventDefault();setBusy(true);setError("");setMessage("");
    try {
      const response=await fetch("/api/admin/cast",{method:editing?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...person,id:editing||undefined,credits,gallery})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"The profile could not be saved.");
      setMessage("Cast profile saved.");reset();await load();
    } catch(reason) {setError(reason instanceof Error?reason.message:"Please try again.");}
    finally {setBusy(false);}
  }
  async function remove(member:CastItem) {
    if(!confirm(`Delete ${member.name}'s profile and its credits? This cannot be undone.`))return;
    setError("");
    try {const response=await fetch("/api/admin/cast?id="+encodeURIComponent(member.id),{method:"DELETE"});const data=await response.json();if(!response.ok)throw new Error(data.error||"The profile could not be deleted.");setMessage("Cast profile deleted.");if(editing===member.id)reset();await load();}
    catch(reason){setError(reason instanceof Error?reason.message:"Please try again.");}
  }

  return <>
    <div className="admin-page-intro"><h2>Cast &amp; crew</h2><p>Create reusable profiles and connect people to published titles with their role, character, and display order.</p></div>
    {message&&<p className="admin-message" role="status">{message}</p>}{error&&<p className="admin-message admin-error" role="alert">{error}</p>}
    <section className="admin-section"><div className="admin-section-title"><h3>{editing?"Edit profile":"New cast profile"}</h3><div className="admin-actions"><button type="button" className="button button-glass" onClick={()=>{reset();setMessage("");setError("");}}>＋ New profile</button>{editing&&<Link className="text-link" href={"/people/"+person.slug} target="_blank">Preview profile ↗</Link>}</div></div>
      <form className="admin-editor cast-editor" onSubmit={save}>
        <label>Name<input required maxLength={160} value={person.name} onChange={event=>setPerson({...person,name:event.target.value})}/></label>
        <label>URL slug<input value={person.slug} maxLength={180} placeholder="generated-from-name" onChange={event=>setPerson({...person,slug:event.target.value})}/></label>
        <label>Profession<input maxLength={100} value={person.profession} onChange={event=>setPerson({...person,profession:event.target.value})} placeholder="Actor, Director, Writer"/></label>
        <label>Nationality / origin<input maxLength={100} value={person.nationality} onChange={event=>setPerson({...person,nationality:event.target.value})}/></label>
        <label className="wide">Portrait URL<input list={portraitListId} type="url" value={person.portraitUrl} onChange={event=>setPerson({...person,portraitUrl:event.target.value})} placeholder="https://…"/></label>
        <label className="wide">Biography<textarea maxLength={10000} value={person.biography} onChange={event=>setPerson({...person,biography:event.target.value})}/></label>
        <div className="wide admin-nested-editor"><div className="admin-section-title"><div><h4>Photos</h4><small>Add authorized image URLs, captions, and credits.</small></div><button type="button" disabled={gallery.length>=30} onClick={()=>setGallery(rows=>[...rows,{url:"",caption:"",attribution:""}])}>＋ Add photo</button></div>
          {gallery.map((photo,index)=><div className="admin-inline-row" key={index}><label className="row-url">Photo URL<input required list={portraitListId} type="url" value={photo.url} onChange={event=>setGallery(rows=>rows.map((item,i)=>i===index?{...item,url:event.target.value}:item))}/></label><label>Caption<input maxLength={200} value={photo.caption} onChange={event=>setGallery(rows=>rows.map((item,i)=>i===index?{...item,caption:event.target.value}:item))}/></label><label>Attribution<input maxLength={200} value={photo.attribution} onChange={event=>setGallery(rows=>rows.map((item,i)=>i===index?{...item,attribution:event.target.value}:item))}/></label><button type="button" className="row-remove" onClick={()=>setGallery(rows=>rows.filter((_,i)=>i!==index))} aria-label={`Remove photo ${index+1}`}>×</button></div>)}
          {!gallery.length&&<p className="admin-muted">No additional photos yet.</p>}
        </div>
        <div className="wide admin-nested-editor"><div className="admin-section-title"><div><h4>Title credits</h4><small>Credits for draft titles remain private until the title is published.</small></div><button type="button" disabled={credits.length>=100} onClick={()=>setCredits(rows=>[...rows,{titleId:"",characterName:"",roleType:"cast",sortOrder:rows.length}])}>＋ Add credit</button></div>
          {credits.map((credit,index)=><div className="admin-inline-row credit-row" key={index}><label className="row-title">Title<select required value={credit.titleId} onChange={event=>setCredits(credits.map((item,i)=>i===index?{...item,titleId:event.target.value}:item))}><option value="">Choose a title</option>{titles.map(title=><option key={title.id} value={title.id}>{title.title}{title.published?"":" · Draft"}</option>)}</select></label><label>Role<select value={credit.roleType} onChange={event=>setCredits(credits.map((item,i)=>i===index?{...item,roleType:event.target.value as Credit["roleType"]}:item))}><option value="cast">Cast</option><option value="director">Director</option><option value="writer">Writer</option><option value="producer">Producer</option></select></label>{credit.roleType==="cast"&&<label>Character<input maxLength={160} value={credit.characterName} onChange={event=>setCredits(credits.map((item,i)=>i===index?{...item,characterName:event.target.value}:item))}/></label>}<label>Order<input type="number" min="0" max="10000" value={credit.sortOrder} onChange={event=>setCredits(credits.map((item,i)=>i===index?{...item,sortOrder:Number(event.target.value)}:item))}/></label><button type="button" className="row-remove" onClick={()=>setCredits(credits.filter((_,i)=>i!==index))} aria-label={`Remove title credit ${index+1}`}>×</button></div>)}
          {!credits.length&&<p className="admin-muted">No title credits yet. Public profiles appear when linked to at least one published title.</p>}
        </div>
        <div className="admin-actions wide"><button disabled={busy} className="button button-primary">{busy?"Saving…":"Save profile"}</button><button type="button" className="button button-glass" onClick={reset}>Cancel</button></div>
      </form>
    </section>
    <section className="admin-section"><div className="admin-section-title"><h3>Profiles ({members.length})</h3></div><div className="admin-cast-list">{members.map(member=><article className="admin-cast-row" key={member.id}><div className="admin-cast-avatar">{member.portrait_url?<RemoteImage src={member.portrait_url} alt="" sizes="50px" fallbackLabel={member.name}/>:<span>✦</span>}</div><div className="admin-cast-info"><strong>{member.name}</strong><span>{member.profession||"Cast & crew"} · {(member.credits||[]).length} title credits</span><small>{member.slug}</small></div><div className="admin-user-actions"><button type="button" onClick={()=>edit(member)}>Edit</button><button type="button" onClick={()=>remove(member)}>Delete</button><Link href={"/people/"+member.slug} target="_blank">Preview</Link></div></article>)}{!members.length&&<p className="admin-notice">No cast profiles have been added yet.</p>}</div></section>
    {assetUrls.length>0&&<datalist id={portraitListId}>{assetUrls.map(url=><option key={url} value={url}/>)}</datalist>}
  </>;
}

export function MediaLibrary({onChanged}:{onChanged?:()=>void}) {
  const input=useRef<HTMLInputElement>(null);
  const [items,setItems]=useState<MediaItem[]>([]),[configured,setConfigured]=useState(false),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [maxBytes,setMaxBytes]=useState(4*1024*1024);
  const load=useCallback(async()=>{
    try{const response=await fetch("/api/admin/media");const data=await response.json();
      if(!response.ok)throw new Error(data.error||"The media library could not be loaded.");
      setItems(data.items||[]);setConfigured(Boolean(data.storageConfigured));setMaxBytes(Number(data.maxImageBytes)||4*1024*1024);
    }finally{setLoaded(true);}
  },[]);
  useEffect(()=>{load().catch(reason=>setError(reason instanceof Error?reason.message:"The media library could not be loaded."));},[load]);
  async function upload(event:FormEvent) {
    event.preventDefault();setError("");setMessage("");const file=input.current?.files?.[0];if(!file){setError("Choose an image first.");return;}
    if(file.size>maxBytes){setError("Images must be smaller than 4 MB.");return;}
    setBusy(true);
    try {const form=new FormData();form.set("file",file);const response=await fetch("/api/admin/media",{method:"POST",body:form});const data=await response.json();if(!response.ok)throw new Error(data.error||"The image could not be uploaded.");setMessage("Image uploaded and saved to the media library.");if(input.current)input.current.value="";await load();onChanged?.();}
    catch(reason){setError(reason instanceof Error?reason.message:"Upload failed. Please try again.");}
    finally{setBusy(false);}
  }
  async function copy(url:string) {
    try{await navigator.clipboard.writeText(url);setMessage("Image URL copied. Paste it into a poster, backdrop, portrait, or gallery field.");}
    catch{setError("Clipboard access is unavailable. Open the image and copy its address.");}
  }
  async function remove(item:MediaItem) {
    if(!confirm(`Delete ${item.filename}? Images referenced by a title or profile cannot be removed.`))return;
    setError("");setMessage("");
    try{const response=await fetch("/api/admin/media?id="+encodeURIComponent(item.id),{method:"DELETE"});const data=await response.json();if(!response.ok)throw new Error(data.error||"The image could not be removed.");setMessage("Image removed.");await load();onChanged?.();}
    catch(reason){setError(reason instanceof Error?reason.message:"Please try again.");}
  }
  return <>
    <div className="admin-page-intro"><h2>Media library</h2><p>Upload and reuse production-ready images for posters, backdrops, cast portraits, and galleries.</p></div>
    {message&&<p className="admin-message" role="status">{message}</p>}{error&&<p className="admin-message admin-error" role="alert">{error}</p>}
    <section className="admin-section"><div className="admin-section-title"><h3>Upload an image</h3><span>JPEG, PNG, WebP, GIF, or AVIF · max 4 MB</span></div>
      {!loaded?<p className="admin-notice" role="status">Checking storage connection…</p>:!configured?<div className="admin-storage-note"><strong>Persistent storage is not connected yet.</strong><p>Connect a public Vercel Blob store to this project. Until then, uploads stay disabled and this page will not report a false success.</p></div>:<form className="admin-upload-form" onSubmit={upload}><label>Choose a file<input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" required/></label><button disabled={busy} className="button button-primary">{busy?"Uploading…":"Upload to library"}</button></form>}
    </section>
    <section className="admin-section"><div className="admin-section-title"><h3>Uploaded images ({items.length})</h3></div><div className="admin-media-grid">{items.map(item=><article className="admin-media-card" key={item.id}><div className="admin-media-preview"><RemoteImage src={item.url} alt={item.filename} sizes="(max-width: 650px) 42vw, 210px" fallbackLabel={item.filename}/></div><div className="admin-media-meta"><strong title={item.filename}>{item.filename}</strong><span>{item.content_type} · {(item.size_bytes/1024).toFixed(0)} KB</span><time dateTime={item.created_at}>{mediaDate(item.created_at)}</time></div><div className="admin-media-actions"><button type="button" onClick={()=>copy(item.url)}>Copy URL</button><button type="button" onClick={()=>remove(item)}>Delete</button></div></article>)}{loaded&&!items.length&&<p className="admin-notice">{configured?"Your uploaded images will appear here.":"Connect storage to enable persistent image uploads."}</p>}</div></section>
  </>;
}
