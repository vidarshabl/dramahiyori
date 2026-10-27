"use client";

import Image from "next/image";
import {useEffect,useState} from "react";

export function RemoteImage({src,alt,fallbackLabel,sizes,priority=false,fill=true,onLoad}:{src:string;alt:string;fallbackLabel:string;sizes:string;priority?:boolean;fill?:boolean;onLoad?:(width:number,height:number)=>void}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[src]);
  return <span className="remote-image-frame" role={failed?"img":undefined} aria-label={failed?fallbackLabel+" image unavailable":undefined}>
    {failed?<span className="remote-image-fallback" aria-hidden="true"><b>✦</b><strong>{fallbackLabel}</strong></span>:<Image fill={fill} src={src} alt={alt} sizes={sizes} priority={priority} onLoad={event=>onLoad?.(event.currentTarget.naturalWidth,event.currentTarget.naturalHeight)} onError={()=>setFailed(true)}/>}
  </span>;
}
