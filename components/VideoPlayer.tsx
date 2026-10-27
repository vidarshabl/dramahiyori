"use client";
import {useEffect,useRef,useState} from "react";

type Track={language:string;label:string;file_url:string;kind:string};
export function VideoPlayer({src,titleId,episodeId,subtitles=[]}:{src:string;titleId:string;episodeId:string|null;subtitles?:Track[]}) {
 const video=useRef<HTMLVideoElement>(null),lastSave=useRef(0),pendingResume=useRef<number|null>(null),[error,setError]=useState(""),[resumeNote,setResumeNote]=useState("");
 useEffect(()=>{
  if(!src)return;
  const el=video.current;if(!el)return;
  let cancelled=false,hls:{destroy:()=>void}|null=null;
  setError("");
  const load=async()=>{
   const isHls=src.toLowerCase().includes(".m3u8");
   if(isHls&&el.canPlayType("application/vnd.apple.mpegurl")){el.src=src;return;}
   if(isHls){try{const {default:Hls}=await import("hls.js");if(cancelled)return;if(!Hls.isSupported()){setError("This browser can’t play this stream format.");return;}const player=new Hls();hls=player;player.loadSource(src);player.attachMedia(el);player.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal)setError("This authorized stream could not be loaded. Please try again later.");});}catch{setError("HLS playback support is unavailable in this build.");}return;}
   el.src=src;
  };
  load();
  return()=>{cancelled=true;hls?.destroy();el.removeAttribute("src");el.load();};
 },[src]);
 useEffect(()=>{
  if(!src)return;
  let cancelled=false;
  fetch("/api/progress").then(r=>r.json()).then(data=>{
   if(cancelled)return;
   const match=(data.items||[]).find((item:any)=>item.title_id===titleId&&item.episode_id===(episodeId||null));
   if(match&&Number(match.position_seconds)>5){pendingResume.current=Number(match.position_seconds);setResumeNote("Saved progress found. Playback will resume when you press play.");if(video.current&&video.current.readyState>=1)applyResume();}
  }).catch(()=>{});
  return()=>{cancelled=true;};
 },[src,titleId,episodeId]);
 function applyResume(){const el=video.current,position=pendingResume.current;if(!el||position===null||!Number.isFinite(el.duration))return;el.currentTime=Math.min(position,Math.max(0,el.duration-3));pendingResume.current=null;setResumeNote("Resumed from your saved progress.");}
 function save(){const el=video.current;if(!el||!Number.isFinite(el.duration))return;const payload=JSON.stringify({titleId,episodeId,positionSeconds:el.currentTime,durationSeconds:el.duration});fetch("/api/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:payload,keepalive:true}).catch(()=>{});}
 useEffect(()=>{const onLeave=()=>save();const onVisibility=()=>{if(document.visibilityState==="hidden")save();};window.addEventListener("pagehide",onLeave);document.addEventListener("visibilitychange",onVisibility);return()=>{window.removeEventListener("pagehide",onLeave);document.removeEventListener("visibilitychange",onVisibility);};},[titleId,episodeId]);
 return <><div className="video-frame">{src?<><video ref={video} controls playsInline preload="metadata" onLoadedMetadata={applyResume} onTimeUpdate={()=>{const now=Date.now();if(now-lastSave.current>15000){lastSave.current=now;save();}}} onPause={save} onEnded={save} onError={()=>setError("The video could not be loaded. Check that the URL points directly to a supported media file and that the source permits playback.")}>{subtitles.map((track,i)=><track key={i} kind={track.kind==="captions"?"captions":"subtitles"} src={track.file_url} srcLang={track.language} label={track.label} default={i===0}/>)}</video>{error&&<p className="player-error" role="alert">{error}</p>}</>:<div className="video-unavailable"><span className="unavailable-moon">☾</span><span className="eyebrow">A QUIET PLACEHOLDER</span><h2>This episode isn’t streaming yet.</h2><p>No authorized video source has been configured. An administrator can add a licensed source in the dashboard.</p><span className="demo-warning">No playback was started.</span></div>}</div>
 {src&&<div className="player-tools"><label>Playback speed <select aria-label="Playback speed" defaultValue="1" onChange={e=>{if(video.current)video.current.playbackRate=Number(e.target.value);}}><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">Normal</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>{resumeNote&&<span role="status">{resumeNote}</span>}</div>}</>;
}
