"use client";

import Image from "next/image";
import {useEffect,useState} from "react";
import { IMAGE_BLUR_DATA_URL } from "@/lib/image-placeholder";

export function RemoteImage({src,alt,fallbackLabel,sizes,priority=false,fill=true,onLoad}:{src:string;alt:string;fallbackLabel:string;sizes:string;priority?:boolean;fill?:boolean;onLoad?:(width:number,height:number)=>void}) {
  const [failed,setFailed]=useState(false),[loading,setLoading]=useState(Boolean(src));
  useEffect(()=>{setFailed(false);setLoading(Boolean(src));},[src]);
  return <span className={`remote-image-frame${loading&&!failed?" is-loading":""}`} role={failed?"img":undefined} aria-label={failed?fallbackLabel+" image unavailable":undefined}>
    {failed?<span className="remote-image-fallback" aria-hidden="true"><b>✦</b><strong>{fallbackLabel}</strong></span>:<Image fill={fill} src={src} alt={alt} sizes={sizes} priority={priority} loading={priority?undefined:"lazy"} placeholder="blur" blurDataURL={IMAGE_BLUR_DATA_URL} onLoad={event=>{setLoading(false);onLoad?.(event.currentTarget.naturalWidth,event.currentTarget.naturalHeight);}} onError={()=>{setLoading(false);setFailed(true);}}/>}
  </span>;
}
