import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { SlideDocument } from "../domain/slide";
import { renderSlideHtml } from "../engine/render";

type Props = { document: SlideDocument; index: number };
export const SlideThumbnail=memo(function SlideThumbnail({document, index}:Props) {
  const root=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(125);
  const [visible,setVisible]=useState(typeof IntersectionObserver==="undefined");
  useEffect(()=>{
    const el=root.current;if(!el)return;
    const measure=()=>setWidth(Math.max(50,el.clientWidth));
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(el);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const el=root.current;
    if(!el||typeof IntersectionObserver==="undefined"){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}
    },{rootMargin:"250px"});
    observer.observe(el);
    return()=>observer.disconnect();
  },[]);
  const srcDoc=useMemo(()=>visible?renderSlideHtml(document):undefined,[visible,document]);
  const factor=width/document.canvas.width;
  return <div ref={root} className="slide-thumb" style={{aspectRatio:document.canvas.width+"/"+document.canvas.height}}>
    {visible&&<iframe loading="lazy" title={"Miniature diapositive "+index} srcDoc={srcDoc} tabIndex={-1} aria-hidden="true" sandbox="" referrerPolicy="no-referrer"
      style={{width:document.canvas.width,height:document.canvas.height,transformOrigin:"top left",transform:"scale("+factor+")"}}/>}
  </div>;
});
