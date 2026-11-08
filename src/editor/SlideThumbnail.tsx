import { useEffect, useMemo, useRef, useState } from "react";
import type { SlideDocument } from "../domain/slide";
import { renderSlideHtml } from "../engine/render";

type Props = { document: SlideDocument; index: number };
export function SlideThumbnail({document, index}:Props) {
  const root=useRef<HTMLDivElement>(null);
  const [width,setWidth]=useState(125);
  useEffect(()=>{
    const el=root.current;if(!el)return;
    const measure=()=>setWidth(Math.max(50,el.clientWidth));
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(el);
    return ()=>observer.disconnect();
  },[]);
  const srcDoc=useMemo(()=>renderSlideHtml(document),[document]);
  const factor=width/document.canvas.width;
  return <div ref={root} className="slide-thumb" style={{aspectRatio:document.canvas.width+"/"+document.canvas.height}}>
    <iframe title={"Miniature diapositive "+index} srcDoc={srcDoc} tabIndex={-1} aria-hidden="true" sandbox="" referrerPolicy="no-referrer"
      style={{width:document.canvas.width,height:document.canvas.height,transformOrigin:"top left",transform:"scale("+factor+")"}}/>
  </div>;
}
