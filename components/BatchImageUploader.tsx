"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { RemoteImage } from "./RemoteImage";

export type UploadedMedia = { id:string;url:string;pathname:string;filename:string;content_type:string;size_bytes:number;role:string;created_at:string;usages?:Array<{role:string;title_name?:string;cast_name?:string;episode_name?:string}> };
export type UploadRole = { value:string; label:string };
type Status="selected"|"uploading"|"uploaded"|"failed"|"cancelled";
type UploadTask={id:string;file:File;preview:string;role:string;status:Status;progress:number;error:string;item?:UploadedMedia};
const IMAGE_TYPES=new Set(["image/jpeg","image/png","image/webp","image/gif","image/avif"]);
const IMAGE_EXTENSIONS=/\.(jpe?g|png|webp|gif|avif)$/i;
const DEFAULT_ROLES:UploadRole[]=[{value:"other",label:"General image"},{value:"poster",label:"Poster"},{value:"backdrop",label:"Backdrop"},{value:"gallery",label:"Gallery photo"},{value:"portrait",label:"Cast portrait"},{value:"episode_thumbnail",label:"Episode thumbnail"},{value:"trailer_thumbnail",label:"Trailer thumbnail"},{value:"promotional",label:"Promotional artwork"}];

export function BatchImageUploader({onUploaded,maxBytes=4*1024*1024,roles=DEFAULT_ROLES,title="Upload images",description="Drop multiple images here, or select files.",storageConfigured}:{onUploaded:(item:UploadedMedia,role:string)=>void;maxBytes?:number;roles?:UploadRole[];title?:string;description?:string;storageConfigured?:boolean|null}) {
  const input=useRef<HTMLInputElement>(null),requests=useRef(new Map<string,XMLHttpRequest>()),queueUrls=useRef(new Map<string,string>()),running=useRef(false);
  const [queue,setQueue]=useState<UploadTask[]>([]),[defaultRole,setDefaultRole]=useState(roles[0]?.value||"other"),[dragging,setDragging]=useState(false),[active,setActive]=useState(false),[error,setError]=useState("");
  useEffect(()=>()=>{for(const url of queueUrls.current.values())URL.revokeObjectURL(url);for(const request of requests.current.values())request.abort();},[]);

  function update(id:string,change:Partial<UploadTask>) {setQueue(current=>current.map(item=>item.id===id?{...item,...change}:item));}
  function addFiles(fileList:FileList|null) {
    if(!fileList?.length)return;
    setError("");
    const additions:UploadTask[]=[];
    const existing=new Set(queue.map(item=>`${item.file.name.toLowerCase()}|${item.file.size}|${item.file.lastModified}`));
    for(const file of Array.from(fileList)) {
      const typeAllowed=IMAGE_TYPES.has(file.type)||(file.type===""&&IMAGE_EXTENSIONS.test(file.name));
      if(!typeAllowed){setError(`${file.name}: choose a JPEG, PNG, WebP, GIF, or AVIF image.`);continue;}
      if(file.size<1||file.size>maxBytes){setError(`${file.name}: images must be smaller than ${(maxBytes/1024/1024).toFixed(0)} MB.`);continue;}
      const fingerprint=`${file.name.toLowerCase()}|${file.size}|${file.lastModified}`;
      if(existing.has(fingerprint))continue;
      existing.add(fingerprint);
      const id=crypto.randomUUID(),preview=URL.createObjectURL(file);queueUrls.current.set(id,preview);
      additions.push({id,file,preview,role:defaultRole,status:"selected",progress:0,error:""});
    }
    if(additions.length)setQueue(current=>[...current,...additions]);
    if(input.current)input.current.value="";
  }
  function onFiles(event:ChangeEvent<HTMLInputElement>){addFiles(event.target.files);}
  function onDrop(event:DragEvent<HTMLDivElement>){event.preventDefault();setDragging(false);addFiles(event.dataTransfer.files);}

  function uploadOne(item:UploadTask):Promise<void> {
    return new Promise(resolve=>{
      update(item.id,{status:"uploading",progress:0,error:""});
      const request=new XMLHttpRequest();requests.current.set(item.id,request);
      request.open("POST","/api/admin/media");request.responseType="text";
      let lastProgress=0;request.upload.onprogress=event=>{if(event.lengthComputable){const progress=Math.min(99,Math.round(event.loaded/event.total*100));if(progress-lastProgress>=4||progress===99){lastProgress=progress;update(item.id,{progress});}}};
      request.onload=()=>{
        requests.current.delete(item.id);
        let data:{item?:UploadedMedia;error?:string}={};try{data=JSON.parse(request.responseText);}catch{}
        if(request.status>=200&&request.status<300&&data.item){
          update(item.id,{status:"uploaded",progress:100,item:data.item});
          onUploaded(data.item,item.role);
        }else update(item.id,{status:"failed",error:data.error||`Upload failed (${request.status||"unknown"}).`});
        resolve();
      };
      request.onerror=()=>{requests.current.delete(item.id);update(item.id,{status:"failed",error:"Network error. Check the connection and retry this image."});resolve();};
      request.onabort=()=>{requests.current.delete(item.id);update(item.id,{status:"cancelled",error:"Transfer interrupted. If it had already completed, check the media library before retrying."});resolve();};
      const body=new FormData();body.set("file",item.file);body.set("role",item.role);body.set("uploadId",item.id);
      try{request.send(body);}catch{requests.current.delete(item.id);update(item.id,{status:"failed",error:"The upload could not be started. Retry this image."});resolve();}
    });
  }
  async function uploadPending() {
    if(running.current)return;
    const pending=queue.filter(item=>["selected","failed","cancelled"].includes(item.status));if(!pending.length)return;
    running.current=true;setActive(true);setError("");
    let cursor=0;
    const worker=async()=>{while(cursor<pending.length){const item=pending[cursor++];await uploadOne(item);}};
    await Promise.all(Array.from({length:Math.min(3,pending.length)},()=>worker()));
    running.current=false;setActive(false);
  }
  function remove(id:string) {
    const request=requests.current.get(id);if(request){request.abort();return;}
    const url=queueUrls.current.get(id);if(url)URL.revokeObjectURL(url);queueUrls.current.delete(id);
    setQueue(current=>current.filter(item=>item.id!==id));
  }
  if(storageConfigured===false)return <div className="batch-storage-unavailable" role="status"><strong>Photo uploads aren’t connected yet</strong><p>In Vercel, open this project’s <b>Storage</b> tab → <b>Create Database</b> → <b>Blob</b> → choose <b>Public</b> → create the store. Then redeploy; Vercel adds the connection to your project.</p><a href="https://vercel.com/docs/vercel-blob/public-storage" target="_blank" rel="noreferrer">See Vercel’s setup steps ↗</a><small>For now, paste a public HTTPS image link into the photo, poster, backdrop, or portrait URL field.</small></div>;
  if(storageConfigured===null)return <p className="admin-notice" role="status">Checking photo upload storage…</p>;
  const pendingCount=queue.filter(item=>["selected","failed","cancelled"].includes(item.status)).length;
  return <section className="batch-uploader wide" aria-label={title}>
    <div className="batch-uploader-heading"><div><h4>{title}</h4><p>{description} JPEG, PNG, WebP, GIF, or AVIF · up to {(maxBytes/1024/1024).toFixed(0)} MB each.</p></div>
      <label className="batch-role-label">Default image role<select value={defaultRole} onChange={event=>setDefaultRole(event.target.value)}>{roles.map(role=><option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
    </div>
    <input ref={input} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple onChange={onFiles} aria-label="Select multiple image files" tabIndex={-1}/>
    <div className={`batch-dropzone${dragging?" is-dragging":""}`} role="region" aria-label="Image drop zone" onDragEnter={event=>{event.preventDefault();setDragging(true);}} onDragOver={event=>{event.preventDefault();setDragging(true);}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setDragging(false);}} onDrop={onDrop}>
      <span aria-hidden="true">⇧</span><strong>Drop images here</strong><small>or choose several files from your device</small><button type="button" className="button button-glass" onClick={event=>{event.stopPropagation();input.current?.click();}}>Choose images</button>
    </div>
    {error&&<p className="admin-message admin-error" role="alert">{error}</p>}
    {!!queue.length&&<>
      <div className="batch-queue-heading"><span>{queue.length} selected · {queue.filter(item=>item.status==="uploaded").length} uploaded</span><div><button type="button" className="button button-small" disabled={active||!pendingCount} onClick={()=>void uploadPending()}>{active?"Uploading…":queue.some(item=>item.status==="failed"||item.status==="cancelled")?`Upload or retry ${pendingCount}`:`Upload ${pendingCount}`}</button><button type="button" className="batch-clear" disabled={active} onClick={()=>{for(const item of queue)remove(item.id);}}>Clear list</button></div></div>
      <ul className="batch-file-list">{queue.map((item,index)=><li key={item.id} className="batch-file-row">
        <div className="batch-file-preview">{item.item?<RemoteImage src={item.item.url} alt="" sizes="64px" fallbackLabel={item.file.name}/>:<img src={item.preview} alt=""/>}</div>
        <div className="batch-file-info"><strong title={item.file.name}>{item.file.name}</strong><span>{(item.file.size/1024).toFixed(0)} KB · {item.status==="uploaded"?"Saved to library":item.status==="uploading"?"Uploading…":item.status==="failed"?item.error:item.status==="cancelled"?"Cancelled":"Ready to upload"}</span><div className="batch-progress" role="progressbar" aria-label={`${item.file.name} upload progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.status==="uploaded"?100:item.status==="uploading"?item.progress:0}><span style={{width:`${item.status==="uploaded"?100:item.progress}%`}}/></div></div>
        <label className="batch-file-role"><span className="visually-hidden">Role for {item.file.name}</span><select aria-label={`Role for ${item.file.name}`} disabled={item.status==="uploading"||item.status==="uploaded"} value={item.role} onChange={event=>update(item.id,{role:event.target.value})}>{roles.map(role=><option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
        <span className={`batch-status batch-status-${item.status}`}>{item.status==="uploaded"?"Saved":item.status==="failed"?"Failed":item.status==="cancelled"?"Cancelled":item.status==="uploading"?"Uploading…":"Ready"}</span>
        <button type="button" className="batch-remove" disabled={active&&item.status!=="uploading"} onClick={()=>remove(item.id)} aria-label={item.status==="uploading"?`Cancel upload of ${item.file.name}`:`Remove ${item.file.name}`}>{item.status==="uploading"?"Cancel":"×"}</button>
      </li>)}</ul>
    </>}
  </section>;
}
