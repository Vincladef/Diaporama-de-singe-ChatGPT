import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import type { SlideDocument } from "../domain/slide";
import { renderSlideHtml } from "../engine/render";
import { SlideAnimationPlayer } from "../animation/runtime";

export type PlayableSlide={id:string;document:SlideDocument};
type Props={
  slide:PlayableSlide;
  reveal:number;
  onAdvance?:()=>void;
  onBusyChange?:(busy:boolean)=>void;
  title?:string;
  onReady?:()=>void;
};
export function ProjectionStage({slide,reveal,onAdvance,onBusyChange,title,onReady}:Props){
  const host=useRef<HTMLDivElement>(null);
  const frame=useRef<HTMLIFrameElement>(null);
  const player=useRef<SlideAnimationPlayer|null>(null);
  const last=useRef<{id:string;reveal:number}|null>(null);
  const busyCallback=useRef(onBusyChange);
  const readyCallback=useRef(onReady);
  busyCallback.current=onBusyChange;readyCallback.current=onReady;
  const [area,setArea]=useState({width:800,height:500});
  const [ready,setReady]=useState(false);
  const srcdoc=useMemo(()=>renderSlideHtml(slide.document),[slide.document]);
  const width=slide.document.canvas.width,height=slide.document.canvas.height;
  const scale=Math.max(.03,Math.min(area.width/width,area.height/height));
  const load=useCallback(()=>{
    const content=frame.current?.contentDocument;
    if(!content)return;
    player.current?.dispose();
    const engine=new SlideAnimationPlayer(content,slide.document);
    player.current=engine;
    last.current={id:slide.id,reveal};
    setReady(true);
    const element=frame.current;
    if(element)element.style.visibility="visible";
    void engine.seek(reveal,{animate:reveal===0,onBusy:busy=>busyCallback.current?.(busy)});
    readyCallback.current?.();
  },[slide.id,slide.document,reveal]);
  useEffect(()=>{
    const element=host.current;
    if(!element)return;
    const update=()=>setArea({width:element.clientWidth,height:element.clientHeight});
    update();
    const ob=new ResizeObserver(update);
    ob.observe(element);
    return()=>ob.disconnect();
  },[]);
  useEffect(()=>{
    if(!ready||!player.current)return;
    if(last.current?.id===slide.id&&last.current.reveal===reveal)return;
    const isNext=last.current?.id===slide.id&&reveal===last.current.reveal+1;
    last.current={id:slide.id,reveal};
    void player.current.seek(reveal,{animate:isNext,onBusy:busy=>busyCallback.current?.(busy)});
  },[ready,slide.id,reveal]);
  useEffect(()=>()=>{
    player.current?.dispose();player.current=null;
    busyCallback.current?.(false);
  },[]);
  return <div className="projection-stage" ref={host} data-testid="projection-stage"
    aria-label={title??"Diapositive projetée"} onClick={onAdvance}
    style={{cursor:onAdvance?"pointer":"default"}}>
    <div className="projection-artboard" style={{
      width:width*scale,height:height*scale,position:"absolute",
      left:"50%",top:"50%",transform:"translate(-50%,-50%)",
    }}>
      <iframe ref={frame} title={title??"Diapositive"} srcDoc={srcdoc}
        sandbox="allow-same-origin" referrerPolicy="no-referrer"
        onLoad={load}
        style={{display:"block",width,height,position:"absolute",inset:0,border:0,
          transform:"scale("+scale+")",transformOrigin:"top left",pointerEvents:"none",visibility:"hidden",background:"#fff"}}
      />
    </div>
    {!ready&&<div className="projection-loading">Préparation de la diapositive…</div>}
  </div>;
}
