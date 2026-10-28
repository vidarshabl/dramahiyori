"use client";

import Image from "next/image";
import { IMAGE_BLUR_DATA_URL } from "@/lib/image-placeholder";
import { useEffect, useRef, useState } from "react";
import type { GalleryImage } from "@/lib/db";

export function MediaGallery({images,label}:{images:GalleryImage[];label:string}) {
  const [active,setActive]=useState<number|null>(null);
  const [failedImages,setFailedImages]=useState<Set<string>>(()=>new Set());
  const closeRef=useRef<HTMLButtonElement>(null);
  const dialogRef=useRef<HTMLDivElement>(null);
  const touchX=useRef<number|null>(null);

  useEffect(()=>{
    if(active===null)return;
    const previous=document.activeElement as HTMLElement|null;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    closeRef.current?.focus();
    function onKeyDown(event:KeyboardEvent) {
      if(event.key==="Escape"){event.preventDefault();setActive(null);return;}
      if(event.key==="ArrowRight"){event.preventDefault();setActive(index=>(index===null?0:(index+1)%images.length));return;}
      if(event.key==="ArrowLeft"){event.preventDefault();setActive(index=>(index===null?0:(index-1+images.length)%images.length));return;}
      if(event.key==="Tab"&&dialogRef.current) {
        const controls=Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled)"));
        if(!controls.length)return;
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    }
    window.addEventListener("keydown",onKeyDown);
    return()=>{window.removeEventListener("keydown",onKeyDown);document.body.style.overflow=previousOverflow;previous?.focus();};
  },[active,images.length]);

  if(!images.length)return null;
  function markFailed(id:string){setFailedImages(current=>current.has(id)?current:new Set(current).add(id));}
  const current=active===null?null:images[active];
  return <>
    <div className="gallery-grid" role="group" aria-label={label}>
      {images.map((image,index)=>{const unavailable=failedImages.has(image.id);return <button className={"gallery-thumb"+(unavailable?" gallery-thumb-failed":"")} key={image.id} type="button" disabled={unavailable} onClick={()=>setActive(index)} aria-label={unavailable?`${label} image unavailable`:`View ${image.caption||label+" photo "+(index+1)}`}>
        {unavailable?<div className="gallery-image-fallback" aria-hidden="true"><b>✦</b><small>Image unavailable</small></div>:<Image fill src={image.image_url} alt={image.caption||`${label} photo ${index+1}`} sizes="(max-width: 650px) 42vw, (max-width: 1000px) 28vw, 220px" loading="lazy" placeholder="blur" blurDataURL={IMAGE_BLUR_DATA_URL} onError={()=>markFailed(image.id)}/>}
        <span aria-hidden="true">↗</span>
      </button>;})}
    </div>
    {current&&<div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label={label+" photo viewer"} onClick={()=>setActive(null)}>
      <div ref={dialogRef} className="gallery-dialog" tabIndex={-1} onClick={event=>event.stopPropagation()} onTouchStart={event=>{touchX.current=event.touches[0]?.clientX??null;}} onTouchEnd={event=>{if(touchX.current===null)return;const delta=event.changedTouches[0]?.clientX-touchX.current;touchX.current=null;if(delta&&Math.abs(delta)>48)setActive(index=>index===null?0:(index+(delta<0?1:-1)+images.length)%images.length);}}>
        <div className="gallery-dialog-bar"><span>{String(active!+1).padStart(2,"0")} <i>/</i> {String(images.length).padStart(2,"0")}</span><button ref={closeRef} type="button" onClick={()=>setActive(null)} aria-label="Close photo viewer">×</button></div>
        <div className="gallery-large-image">{failedImages.has(current.id)?<div className="gallery-image-fallback" aria-hidden="true"><b>✦</b><small>Image unavailable</small></div>:<Image fill src={current.image_url} alt={current.caption||label+" photo"} sizes="(max-width: 900px) 94vw, 78vw" priority placeholder="blur" blurDataURL={IMAGE_BLUR_DATA_URL} onError={()=>markFailed(current.id)}/>}</div>
        <div className="gallery-dialog-caption"><div>{current.caption&&<strong>{current.caption}</strong>}{current.attribution&&<span>{current.attribution}</span>}</div><div className="gallery-dialog-controls"><button type="button" onClick={()=>setActive(index=>(index! - 1 + images.length)%images.length)} aria-label="Previous photo">‹</button><button type="button" onClick={()=>setActive(index=>(index! + 1)%images.length)} aria-label="Next photo">›</button></div></div>
      </div>
    </div>}
  </>;
}
