"use client";

import { useEffect, useRef, useState } from "react";
import { BatchImageUploader, type UploadedMedia } from "./BatchImageUploader";
import { RemoteImage } from "./RemoteImage";

type HomeTitle={id:string;title:string;slug:string;published:number;backdrop_url?:string|null};
type HomeSlide={id:string;titleId:string;title:string;slug:string;backdropUrl:string};
type HomeAsset=Pick<UploadedMedia,"id"|"url"|"filename"|"role">;
const MAX_SLIDES=50;

function getBackdropPreview(value:string):string|null {
  const candidate=value.trim();
  if(/^\/drama-media\/[a-z0-9][a-z0-9._/-]*\.(?:jpe?g|png|webp|avif)$/i.test(candidate)&&!candidate.includes("..")&&!candidate.includes("\\")&&!candidate.includes("?")&&!candidate.includes("#"))return candidate;
  try {const url=new URL(candidate);return url.protocol==="https:"&&url.hostname?url.toString():null;}
  catch {return null;}
}

export function HomePhotoEditor({titles,assets,storageConfigured,onSaved,onAssetsChanged,onAddTitle}:{titles:HomeTitle[];assets:HomeAsset[];storageConfigured:boolean|null;onSaved:()=>Promise<void>;onAssetsChanged:()=>Promise<void>;onAddTitle:()=>void}) {
  const [slides,setSlides]=useState<HomeSlide[]>([]),[selectedTitle,setSelectedTitle]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[ready,setReady]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
  const savedSnapshot=useRef(""),dragging=useRef<number|null>(null);

  useEffect(()=>{
    let active=true;
    void (async()=>{
      const controller=new AbortController();
      const timeout=window.setTimeout(()=>controller.abort(),20000);
      try {
        const response=await fetch("/api/admin/home-slides",{signal:controller.signal});
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||"Homepage photos could not be loaded.");
        if(!active)return;
        const initial=(data.items||[]).map((item:{slide_id:string;id:string;title:string;slug:string;backdrop_url:string})=>({id:item.slide_id,titleId:item.id,title:item.title,slug:item.slug,backdropUrl:item.backdrop_url||""}));
        savedSnapshot.current=JSON.stringify(initial);setSlides(initial);setReady(true);
      } catch(reason) {
        if(active)setError(controller.signal.aborted?"Loading the slideshow took too long. Refresh this page and try again.":reason instanceof Error?reason.message:"Homepage photos could not be loaded.");
      } finally {window.clearTimeout(timeout);if(active)setLoading(false);}
    })();
    return()=>{active=false;};
  },[]);

  const dirty=ready&&JSON.stringify(slides)!==savedSnapshot.current;
  const publishedTitles=titles.filter(title=>Number(title.published)===1);

  function addSlide() {
    const title=titles.find(item=>item.id===selectedTitle&&Number(item.published)===1);
    if(!ready||!title||slides.length>=MAX_SLIDES)return;
    setSlides(current=>[...current,{id:crypto.randomUUID(),titleId:title.id,title:title.title,slug:title.slug,backdropUrl:title.backdrop_url||""}]);
    setSelectedTitle("");setError("");setMessage("");
  }
  function addAllSavedBackdrops() {
    if(!ready)return;
    const additions=publishedTitles
      .filter(title=>Boolean(getBackdropPreview(title.backdrop_url||""))&&!slides.some(slide=>slide.titleId===title.id))
      .slice(0,Math.max(0,MAX_SLIDES-slides.length))
      .map(title=>({id:crypto.randomUUID(),titleId:title.id,title:title.title,slug:title.slug,backdropUrl:title.backdrop_url||""}));
    if(!additions.length){setMessage("Every published drama backdrop is already in the slideshow, or no saved backdrops are available.");return;}
    setSlides(current=>[...current,...additions]);setError("");setMessage(`${additions.length} saved drama photo${additions.length===1?"":"s"} added. Save the slideshow to publish them.`);
  }
  function updateBackdrop(id:string,backdropUrl:string) {
    setSlides(current=>current.map(slide=>slide.id===id?{...slide,backdropUrl}:slide));setMessage("");setError("");
  }
  function moveSlide(from:number,to:number) {
    if(to<0||to>=slides.length||from===to)return;
    setSlides(current=>{const next=[...current],[slide]=next.splice(from,1);next.splice(to,0,slide);return next;});
    setMessage("");
  }
  async function saveSlides() {
    if(busy||!dirty)return;
    const missing=slides.findIndex(slide=>!getBackdropPreview(slide.backdropUrl));
    if(missing!==-1){setError(`Choose a valid photo for slide ${missing+1} before saving.`);return;}
    setBusy(true);setError("");setMessage("");
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),30000);
    let saved=false;
    try {
      const response=await fetch("/api/admin/home-slides",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({slides:slides.map(({id,titleId,backdropUrl})=>({id,titleId,backdropUrl}))}),signal:controller.signal});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Homepage photos could not be saved.");
      savedSnapshot.current=JSON.stringify(slides);
      setMessage("Homepage photos saved. The public hero will rotate through these images.");
      saved=true;
    } catch(reason) {setError(controller.signal.aborted?"Saving took too long. Check your connection, then try again.":reason instanceof Error?reason.message:"Homepage photos could not be saved. Please try again.");}
    finally {window.clearTimeout(timeout);setBusy(false);}
    if(saved)void onSaved().catch(()=>setMessage("Homepage photos saved. Reload the dashboard to refresh the title list."));
  }

  return <>
    <div className="admin-page-intro"><h2>Home photo editor</h2><p>Add multiple homepage photos, choose which published drama each photo opens, and set their display order.</p></div>
    <section className="admin-section home-editor-section">
      <div className="admin-section-title"><div><h3>Hero slideshow <span className="home-slide-count">{slides.length} / {MAX_SLIDES}</span></h3><small>Photos can repeat a title. Drag to reorder, or use the arrow buttons. Removing a photo does not delete its title or media file.</small></div><button type="button" className="button button-primary" disabled={busy||loading||!ready||!dirty} onClick={()=>void saveSlides()}>{loading?"Loading…":!ready?"Unavailable":busy?"Saving…":"Save slideshow"}</button></div>
      {!loading&&!ready&&<p className="admin-notice" role="status">The saved slideshow could not be loaded. Refresh this page before making changes.</p>}
      {ready&&!slides.length&&<p className="admin-notice" role="status">Upload your photos above, add at least one photo below, and choose its title and image. Then Save slideshow will become available.</p>}
      {ready&&!!slides.length&&!dirty&&!busy&&<p className="admin-notice" role="status">There are no unsaved changes. Add or edit a photo to enable Save slideshow.</p>}
      {message&&<p className="admin-message" role="status">{message}</p>}{error&&<p className="admin-message admin-error" role="alert">{error}</p>}

      <BatchImageUploader title="Upload home photos" description="Upload several wide hero images at once, then assign each photo to a slide below." roles={[{value:"backdrop",label:"Homepage photo"}]} storageConfigured={storageConfigured} onUploaded={(_item)=>{setMessage("Photo uploaded. Add a slide and choose it from the media list.");void onAssetsChanged().catch(()=>setError("Photo uploaded, but the media library could not be refreshed."));}}/>

      <div className="home-slide-add-row">
        <label>Add a photo for a published title<select value={selectedTitle} onChange={event=>setSelectedTitle(event.target.value)} disabled={!ready||!publishedTitles.length||slides.length>=MAX_SLIDES}><option value="">Choose a title for this photo…</option>{publishedTitles.map(title=><option key={title.id} value={title.id}>{title.title}</option>)}</select></label>
        <button type="button" className="button button-glass" onClick={addSlide} disabled={!ready||!selectedTitle||slides.length>=MAX_SLIDES}>＋ Add photo</button>
        <button type="button" className="button button-glass" onClick={addAllSavedBackdrops} disabled={!ready||loading||slides.length>=MAX_SLIDES||!publishedTitles.some(title=>getBackdropPreview(title.backdrop_url||"")&&!slides.some(slide=>slide.titleId===title.id))}>＋ Add all saved backdrops</button>
        {!publishedTitles.length&&<button type="button" className="text-link" onClick={onAddTitle}>Publish a title first →</button>}
      </div>

      {loading?<p className="admin-notice" role="status">Loading homepage photos…</p>:!ready?<p className="admin-notice" role="status">Refresh this page to retry loading the saved photos.</p>:slides.length?<ol className="home-slide-list" aria-label="Homepage hero photos">{slides.map((slide,index)=>{
        const preview=getBackdropPreview(slide.backdropUrl);
        return <li key={slide.id} className="home-slide-card" onDragOver={event=>{if(dragging.current!==null)event.preventDefault();}} onDrop={event=>{event.preventDefault();const from=dragging.current;dragging.current=null;if(from!==null)moveSlide(from,index);}}>
          <div className="home-slide-preview">{preview?<RemoteImage src={preview} alt={`${slide.title} homepage photo`} sizes="(max-width: 650px) 100vw, 420px" fallbackLabel="Photo unavailable"/>:<div className="home-slide-placeholder"><span aria-hidden="true">✦</span><small>Choose or upload a photo</small></div>}<span className="home-slide-number">{String(index+1).padStart(2,"0")}</span></div>
          <div className="home-slide-content"><div className="home-slide-title-row"><div><span className="eyebrow">HOMEPAGE PHOTO {String(index+1).padStart(2,"0")}</span><h4>{slide.title}</h4><a href={`/title/${encodeURIComponent(slide.slug)}`} target="_blank" rel="noreferrer">Preview title ↗</a></div><div className="home-slide-order"><button type="button" draggable aria-label={`Drag photo ${index+1} to reorder`} onDragStart={event=>{dragging.current=index;event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",String(index));}} onDragEnd={()=>{dragging.current=null;}}>⠿</button><button type="button" disabled={index===0||busy} onClick={()=>moveSlide(index,index-1)} aria-label={`Move photo ${index+1} earlier`}>↑</button><button type="button" disabled={index===slides.length-1||busy} onClick={()=>moveSlide(index,index+1)} aria-label={`Move photo ${index+1} later`}>↓</button><button type="button" className="row-remove" disabled={busy} onClick={()=>{setSlides(current=>current.filter(item=>item.id!==slide.id));setMessage("");}} aria-label={`Remove photo ${index+1} from homepage`}>×</button></div></div>
            <label>Photo URL<input type="text" list="home-media-urls" value={slide.backdropUrl} onChange={event=>updateBackdrop(slide.id,event.target.value)} placeholder="/drama-media/photo.jpg or https://…"/></label>
            <label>Drama opened by this photo<select aria-label={`Choose the drama for photo ${index+1}`} value={slide.titleId} onChange={event=>{const title=publishedTitles.find(item=>item.id===event.target.value);if(title)setSlides(current=>current.map(item=>item.id===slide.id?{...item,titleId:title.id,title:title.title,slug:title.slug}:item));}}>{publishedTitles.map(title=><option key={title.id} value={title.id}>{title.title}</option>)}</select></label>
            {!!assets.length&&<label>Choose an uploaded photo<select aria-label={`Choose an uploaded image for photo ${index+1}`} value={assets.some(asset=>asset.url===slide.backdropUrl)?slide.backdropUrl:""} onChange={event=>{if(event.target.value)updateBackdrop(slide.id,event.target.value);}}><option value="">Choose from media library…</option>{assets.map(asset=><option key={asset.id} value={asset.url}>{asset.filename} · {asset.role}</option>)}</select></label>}
          </div>
        </li>;
      })}</ol>:<div className="home-editor-empty"><span aria-hidden="true">✦</span><h4>Your slideshow is ready for its first photo.</h4><p>Add a published title, upload one or more photos, assign each photo to a title, then save. The homepage will rotate through them with the existing cinematic transition.</p></div>}
      <datalist id="home-media-urls">{assets.map(asset=><option key={asset.id} value={asset.url}>{asset.filename}</option>)}</datalist>
      {!!slides.length&&<div className="home-editor-footer"><span>{dirty?"You have unsaved slideshow changes.":"Your saved homepage slideshow is up to date."}</span><button type="button" className="button button-primary" disabled={busy||loading||!ready||!dirty} onClick={()=>void saveSlides()}>{loading?"Loading…":busy?"Saving…":"Save slideshow"}</button></div>}
    </section>
  </>;
}
