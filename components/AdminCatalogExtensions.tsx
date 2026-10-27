"use client";

import Link from "next/link";
import {FormEvent,useCallback,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {RemoteImage} from "./RemoteImage";
import {BatchImageUploader,type UploadedMedia,type UploadRole} from "./BatchImageUploader";

type Photo={url:string;caption:string;attribution:string};
type Credit={titleId:string;characterName:string;roleType:"cast"|"director"|"writer"|"producer";sortOrder:number};
type TitleOption={id:string;title:string;published:number};
type CastItem={id:string;slug:string;name:string;biography:string;nationality:string;profession:string;portrait_url:string;credits:Credit[];gallery:Photo[]};
export type MediaItem=UploadedMedia;
function isHttpUrl(value:string){try{const url=new URL(value);return url.protocol==="http:"||url.protocol==="https:";}catch{return false;}}
function roleLabel(role:string){return role.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());}
const blankPerson={name:"",slug:"",biography:"",nationality:"",profession:"Actor",portraitUrl:""};
function mediaDate(value:string){const date=new Date(value.replace(" ","T")+"Z");return Number.isNaN(date.getTime())?"Date unavailable":new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(date);}

export function SortablePhotoEditor({label,description,photos,onChange,assets,emptyText="No photos added yet."}:{label:string;description:string;photos:Photo[];onChange:(photos:Photo[])=>void;assets:MediaItem[];emptyText?:string}){
  const dragging=useRef<number|null>(null),listId=`media-list-${label.toLowerCase().replace(/[^a-z0-9]+/g,"-")}`;
  function move(from:number,to:number){if(to<0||to>=photos.length||from===to)return;const next=[...photos], [item]=next.splice(from,1);next.splice(to,0,item);onChange(next);}
  function drop(to:number){const from=dragging.current;dragging.current=null;if(from!==null)move(from,to);}
  return <section className="admin-nested-editor wide" aria-label={label}>
    <div className="admin-section-title"><div><h4>{label}</h4><small>{description}</small></div><button type="button" disabled={photos.length>=30} onClick={()=>onChange([...photos,{url:"",caption:"",attribution:""}])}>＋ Add photo</button></div>
    <datalist id={listId}>{assets.map(asset=><option key={asset.id} value={asset.url}>{asset.filename}</option>)}</datalist>
    {photos.map((photo,index)=><div className="admin-photo-row" key={`${photo.url}-${index}`} onDragOver={event=>{if(dragging.current!==null)event.preventDefault();}} onDrop={event=>{event.preventDefault();drop(index);}}>
      <div className="admin-photo-preview">{isHttpUrl(photo.url)?<RemoteImage src={photo.url} alt={photo.caption||`${label} ${index+1}`} sizes="92px" fallbackLabel={photo.caption||"Photo"}/>:<span aria-hidden="true">✦</span>}</div>
      <div className="admin-photo-fields"><label>Image URL<input required type="url" list={listId} value={photo.url} placeholder="https://…" onChange={event=>onChange(photos.map((row,i)=>i===index?{...row,url:event.target.value}:row))}/>
        {!!assets.length&&<select aria-label={`Choose a saved image for ${label.toLowerCase()} ${index+1}`} value={assets.some(asset=>asset.url===photo.url)?photo.url:""} onChange={event=>{if(event.target.value)onChange(photos.map((row,i)=>i===index?{...row,url:event.target.value}:row));}}><option value="">Choose from media library…</option>{assets.map(asset=><option key={asset.id} value={asset.url}>{asset.filename} · {roleLabel(asset.role)}</option>)}</select>}</label>
        <label>Caption / alt text<input maxLength={200} value={photo.caption} onChange={event=>onChange(photos.map((row,i)=>i===index?{...row,caption:event.target.value}:row))}/></label>
        <label>Attribution<input maxLength={200} value={photo.attribution} onChange={event=>onChange(photos.map((row,i)=>i===index?{...row,attribution:event.target.value}:row))}/></label></div>
      <div className="admin-photo-order"><button type="button" draggable aria-label={`Drag photo ${index+1} to reorder`} onDragStart={event=>{dragging.current=index;event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",String(index));}} onDragEnd={()=>{dragging.current=null;}}>⠿</button><button type="button" disabled={index===0} onClick={()=>move(index,index-1)} aria-label={`Move photo ${index+1} up`}>↑</button><button type="button" disabled={index===photos.length-1} onClick={()=>move(index,index+1)} aria-label={`Move photo ${index+1} down`}>↓</button><button type="button" className="row-remove" onClick={()=>onChange(photos.filter((_,i)=>i!==index))} aria-label={`Remove photo ${index+1}`}>×</button></div>
    </div>)}
    {!photos.length&&<p className="admin-muted">{emptyText}</p>}
  </section>;
}

export function CastStudio({assets=[]}:{assets?:MediaItem[]}) {
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
        <label className="wide">Portrait URL<input list={portraitListId} type="url" value={person.portraitUrl} onChange={event=>setPerson({...person,portraitUrl:event.target.value})} placeholder="https://…"/>{!!assets.length&&<select aria-label="Choose a cast portrait from the media library" value={assets.some(asset=>asset.url===person.portraitUrl)?person.portraitUrl:""} onChange={event=>setPerson({...person,portraitUrl:event.target.value})}><option value="">Choose an uploaded portrait…</option>{assets.map(asset=><option key={asset.id} value={asset.url}>{asset.filename}</option>)}</select>}</label>
        <label className="wide">Biography<textarea maxLength={10000} value={person.biography} onChange={event=>setPerson({...person,biography:event.target.value})}/></label>
        <BatchImageUploader title="Add portrait and gallery images" description="Upload several photos; choose a role for each file and they will be added to this profile." roles={[{value:"portrait",label:"Profile portrait"},{value:"gallery",label:"Gallery photo"}]} onUploaded={(asset,role)=>{if(role==="portrait")setPerson(current=>({...current,portraitUrl:asset.url}));else setGallery(current=>[...current,{url:asset.url,caption:asset.filename.replace(/\.[^.]+$/,""),attribution:""}]);setMessage("Image uploaded and assigned to this profile. Save the profile to keep the association.");}}/>
        <SortablePhotoEditor label="Profile photos" description="Additional portraits and photographs; drag to reorder, or use the arrow controls." photos={gallery} onChange={setGallery} assets={assets} emptyText="No additional photos yet."/>
        <div className="wide admin-nested-editor"><div className="admin-section-title"><div><h4>Title credits</h4><small>Credits for draft titles remain private until the title is published.</small></div><button type="button" disabled={credits.length>=100} onClick={()=>setCredits(rows=>[...rows,{titleId:"",characterName:"",roleType:"cast",sortOrder:rows.length}])}>＋ Add credit</button></div>
          {credits.map((credit,index)=><div className="admin-inline-row credit-row" key={index}><label className="row-title">Title<select required value={credit.titleId} onChange={event=>setCredits(credits.map((item,i)=>i===index?{...item,titleId:event.target.value}:item))}><option value="">Choose a title</option>{titles.map(title=><option key={title.id} value={title.id}>{title.title}{title.published?"":" · Draft"}</option>)}</select></label><label>Role<select value={credit.roleType} onChange={event=>setCredits(credits.map((item,i)=>i===index?{...item,roleType:event.target.value as Credit["roleType"]}:item))}><option value="cast">Cast</option><option value="director">Director</option><option value="writer">Writer</option><option value="producer">Producer</option></select></label>{credit.roleType==="cast"&&<label>Character<input maxLength={160} value={credit.characterName} onChange={event=>setCredits(credits.map((item,i)=>i===index?{...item,characterName:event.target.value}:item))}/></label>}<label>Order<input type="number" min="0" max="10000" value={credit.sortOrder} onChange={event=>setCredits(credits.map((item,i)=>i===index?{...item,sortOrder:Number(event.target.value)}:item))}/></label><button type="button" className="row-remove" onClick={()=>setCredits(credits.filter((_,i)=>i!==index))} aria-label={`Remove title credit ${index+1}`}>×</button></div>)}
          {!credits.length&&<p className="admin-muted">No title credits yet. Public profiles appear when linked to at least one published title.</p>}
        </div>
        <div className="admin-actions wide"><button disabled={busy} className="button button-primary">{busy?"Saving…":"Save profile"}</button><button type="button" className="button button-glass" onClick={reset}>Cancel</button></div>
      </form>
    </section>
    <section className="admin-section"><div className="admin-section-title"><h3>Profiles ({members.length})</h3></div><div className="admin-cast-list">{members.map(member=><article className="admin-cast-row" key={member.id}><div className="admin-cast-avatar">{member.portrait_url?<RemoteImage src={member.portrait_url} alt="" sizes="50px" fallbackLabel={member.name}/>:<span>✦</span>}</div><div className="admin-cast-info"><strong>{member.name}</strong><span>{member.profession||"Cast & crew"} · {(member.credits||[]).length} title credits</span><small>{member.slug}</small></div><div className="admin-user-actions"><button type="button" onClick={()=>edit(member)}>Edit</button><button type="button" onClick={()=>remove(member)}>Delete</button><Link href={"/people/"+member.slug} target="_blank">Preview</Link></div></article>)}{!members.length&&<p className="admin-notice">No cast profiles have been added yet.</p>}</div></section>
    {!!assets.length&&<datalist id={portraitListId}>{assets.map(asset=><option key={asset.id} value={asset.url}>{asset.filename}</option>)}</datalist>}
  </>;
}

export function MediaLibrary({onChanged}:{onChanged?:()=>void}) {
  const [items,setItems]=useState<MediaItem[]>([]),[configured,setConfigured]=useState(false),[loaded,setLoaded]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const [maxBytes,setMaxBytes]=useState(4*1024*1024);
  const [search,setSearch]=useState(""),[roleFilter,setRoleFilter]=useState("all"),[associationFilter,setAssociationFilter]=useState("all"),[view,setView]=useState<"grid"|"list">("grid"),[dimensions,setDimensions]=useState<Record<string,string>>({});
  const load=useCallback(async()=>{
    try{const response=await fetch("/api/admin/media");const data=await response.json();
      if(!response.ok)throw new Error(data.error||"The media library could not be loaded.");
      setItems(data.items||[]);setConfigured(Boolean(data.storageConfigured));setMaxBytes(Number(data.maxImageBytes)||4*1024*1024);
    }finally{setLoaded(true);}
  },[]);
  useEffect(()=>{load().catch(reason=>setError(reason instanceof Error?reason.message:"The media library could not be loaded."));},[load]);
  const roles:UploadRole[]=[{value:"other",label:"General image"},{value:"poster",label:"Poster"},{value:"backdrop",label:"Backdrop"},{value:"gallery",label:"Gallery photo"},{value:"portrait",label:"Cast portrait"},{value:"episode_thumbnail",label:"Episode thumbnail"},{value:"trailer_thumbnail",label:"Trailer thumbnail"},{value:"promotional",label:"Promotional artwork"}];
  const visibleItems=items.filter(item=>{
    const usages=item.usages||[],matchesText=[item.filename,item.role,...usages.flatMap(usage=>[usage.title_name,usage.cast_name,usage.episode_name,usage.role])].filter(Boolean).join(" ").toLowerCase().includes(search.trim().toLowerCase());
    return matchesText&&(roleFilter==="all"||item.role===roleFilter||usages.some(usage=>usage.role===roleFilter))&&(associationFilter==="all"||(associationFilter==="assigned"?usages.length>0:usages.length===0));
  });
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
    <div className="admin-page-intro"><h2>Media library</h2><p>Upload and reuse images for posters, backdrops, cast portraits, episode artwork, and galleries.</p></div>
    {message&&<p className="admin-message" role="status">{message}</p>}{error&&<p className="admin-message admin-error" role="alert">{error}</p>}
    <section className="admin-section"><div className="admin-section-title"><h3>Upload images</h3><span>JPEG, PNG, WebP, GIF, or AVIF · max 4 MB each</span></div>
      {!loaded?<p className="admin-notice" role="status">Checking storage connection…</p>:!configured?<div className="admin-storage-note"><strong>Persistent storage is not connected yet.</strong><p>Connect a public Vercel Blob store to this project. Until then, uploads stay disabled and this page will not report a false success.</p></div>:null}
      {loaded&&configured&&<BatchImageUploader maxBytes={maxBytes} roles={roles} title="Batch upload" description="Drop a group of images or select multiple files. Each file has its own role and retry state." onUploaded={item=>{setItems(current=>[item,...current.filter(existing=>existing.id!==item.id)]);setMessage(`${item.filename} uploaded and saved to the media library.`);onChanged?.();}}/>}
    </section>
    <section className="admin-section"><div className="admin-section-title"><h3>Uploaded images ({visibleItems.length}{visibleItems.length!==items.length?` of ${items.length}`:""})</h3><div className="media-view-toggle"><button type="button" aria-pressed={view==="grid"} onClick={()=>setView("grid")}>Grid</button><button type="button" aria-pressed={view==="list"} onClick={()=>setView("list")}>List</button></div></div>
      <div className="admin-media-toolbar"><label>Search images<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="File or associated title/person"/></label><label>Role<select value={roleFilter} onChange={event=>setRoleFilter(event.target.value)}><option value="all">All roles</option>{roles.filter(role=>role.value!=="other").map(role=><option key={role.value} value={role.value}>{role.label}</option>)}</select></label><label>Association<select value={associationFilter} onChange={event=>setAssociationFilter(event.target.value)}><option value="all">All images</option><option value="assigned">Assigned to content</option><option value="unassigned">Unassigned</option></select></label></div>
      <div className={"admin-media-grid "+(view==="list"?"is-list":"")}>{visibleItems.map(item=><article className="admin-media-card" key={item.id}><div className="admin-media-preview"><RemoteImage src={item.url} alt={item.filename} sizes="(max-width: 650px) 42vw, 210px" fallbackLabel={item.filename} onLoad={(width,height)=>setDimensions(current=>current[item.id]?current:{...current,[item.id]:`${width} × ${height}px`})}/></div><div className="admin-media-meta"><strong title={item.filename}>{item.filename}</strong><span>{roleLabel(item.role)} · {item.content_type}</span><span>{(item.size_bytes/1024).toFixed(0)} KB{dimensions[item.id]?` · ${dimensions[item.id]}`:""}</span><time dateTime={item.created_at}>{mediaDate(item.created_at)}</time>{item.usages?.length?<div className="admin-media-usages">{item.usages.map((usage,index)=><span key={index}>{usage.title_name||usage.cast_name||usage.episode_name||"Content"} · {roleLabel(usage.role)}</span>)}</div>:<small>Not associated with content yet</small>}</div><div className="admin-media-actions"><button type="button" onClick={()=>copy(item.url)}>Copy URL</button><button type="button" onClick={()=>remove(item)}>Delete</button></div></article>)}{loaded&&!visibleItems.length&&<p className="admin-notice">{items.length?"No images match these filters.":configured?"Your uploaded images will appear here.":"Connect storage to enable persistent image uploads."}</p>}</div>
    </section>
  </>;
}
