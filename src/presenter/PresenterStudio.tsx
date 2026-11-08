import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import type { PresentationDetail } from "../lib/api";
import { buildPlaybackPlan,gotoSlide,nextPosition,previousPosition,type PlaybackPosition } from "../animation/timeline";
import { ProjectionStage } from "./ProjectionStage";
import { SlideThumbnail } from "../editor/SlideThumbnail";

type Props={detail:PresentationDetail;initialSlideId?:string|null;onClose:()=>void};
type Message=
  |{type:"hello";sessionId:string}
  |{type:"init";sessionId:string;title:string;slides:{id:string;document:PresentationDetail["slides"][number]["document"]}[];position:PlaybackPosition}
  |{type:"state";sessionId:string;position:PlaybackPosition}
  |{type:"command";sessionId:string;command:"next"|"previous"}
  |{type:"close";sessionId:string};
function formatSeconds(value:number):string{
  const s=Math.max(0,value);
  return String(Math.floor(s/60)).padStart(2,"0")+":"+String(s%60).padStart(2,"0");
}
export function PresenterStudio({detail,initialSlideId,onClose}:Props){
  const [snapshot]=useState(()=>({
    title:detail.presentation.title,
    slides:detail.slides.map(s=>({id:s.id,document:structuredClone(s.document),notes:s.notes})),
  }));
  const docs=useMemo(()=>snapshot.slides.map(s=>s.document),[snapshot]);
  const initial=Math.max(0,snapshot.slides.findIndex(s=>s.id===initialSlideId));
  const [position,setPosition]=useState<PlaybackPosition>({slide:initial,reveal:0});
  const [busy,setBusy]=useState(false);
  const busyRef=useRef(false);
  busyRef.current=busy;
  const [seconds,setSeconds]=useState(0);
  const [popupOpen,setPopupOpen]=useState(false);
  const [error,setError]=useState("");
  const popup=useRef<Window|null>(null);
  const channel=useRef<BroadcastChannel|null>(null);
  const sid=useMemo(()=>crypto.randomUUID(),[]);
  const modal=useRef<HTMLDivElement>(null);
  const posRef=useRef(position);
  posRef.current=position;
  const next=useCallback(()=>{
    if(busyRef.current)return;
    setPosition(p=>nextPosition(docs,p));
  },[docs]);
  const previous=useCallback(()=>{
    if(busyRef.current)return;
    setPosition(p=>previousPosition(docs,p));
  },[docs]);
  const close=useCallback(()=>{
    channel.current?.postMessage({type:"close",sessionId:sid} satisfies Message);
    try{popup.current?.close();}catch{/* browser may restrict popup close */}
    if(document.fullscreenElement===modal.current)void document.exitFullscreen().catch(()=>{});
    onClose();
  },[sid,onClose]);
  useEffect(()=>{
    const ch=new BroadcastChannel("singe-projection:"+sid);
    channel.current=ch;
    ch.onmessage=(event:MessageEvent<Message>)=>{
      const data=event.data;
      if(!data||data.sessionId!==sid)return;
      if(data.type==="hello"){
        ch.postMessage({type:"init",sessionId:sid,title:snapshot.title,
          slides:snapshot.slides.map(s=>({id:s.id,document:s.document})),
          position:posRef.current} satisfies Message);
      }else if(data.type==="command"){
        if(data.command==="next")next();
        if(data.command==="previous")previous();
      }
    };
    return()=>{ch.close();channel.current=null;};
  },[sid,snapshot,next,previous]);
  useEffect(()=>{
    channel.current?.postMessage({type:"state",sessionId:sid,position} satisfies Message);
  },[position,sid]);
  useEffect(()=>{
    const clock=window.setInterval(()=>setSeconds(v=>v+1),1000);
    return()=>window.clearInterval(clock);
  },[]);
  useEffect(()=>{
    const handle=(event:KeyboardEvent)=>{
      const target=event.target;
      if(target instanceof HTMLElement&&target.closest("input,textarea,select,[contenteditable=true]"))return;
      if(["ArrowRight","PageDown"," ","Enter"].includes(event.key)){
        event.preventDefault();next();
      }else if(["ArrowLeft","PageUp","Backspace"].includes(event.key)){
        event.preventDefault();previous();
      }else if(event.key==="Home"){
        event.preventDefault();setPosition({slide:0,reveal:0});
      }else if(event.key==="End"){
        event.preventDefault();setPosition(p=>({slide:snapshot.slides.length-1,
          reveal:buildPlaybackPlan(docs[snapshot.slides.length-1]!.animations).clicks.length}));
      }else if(event.key.toLowerCase()==="f"&&!event.ctrlKey&&!event.metaKey){
        event.preventDefault();if(!document.fullscreenElement)void modal.current?.requestFullscreen().catch(()=>{});
      }else if(event.key==="Escape"&&!document.fullscreenElement){
        event.preventDefault();close();
      }
    };
    window.addEventListener("keydown",handle,true);
    return()=>window.removeEventListener("keydown",handle,true);
  },[docs,next,previous,snapshot.slides.length,close]);
  function openProjection(){
    const dest="/projection#"+encodeURIComponent(sid);
    const opened=window.open(dest,"diaporama-projection-"+sid,"popup=yes,width=1440,height=900");
    if(!opened){setError("Le navigateur a bloqué la fenêtre. Autorisez les pop-ups pour ce site.");return;}
    popup.current=opened;setPopupOpen(true);setError("");
    opened.focus();
  }
  const active=snapshot.slides[position.slide]!;
  const following=snapshot.slides[position.slide+1];
  const groupCount=buildPlaybackPlan(active.document.animations).clicks.length;
  return <div className="presenter-overlay" role="dialog" aria-modal="true" aria-label="Mode présentateur" ref={modal}>
    <header className="presenter-topbar">
      <div><strong>{snapshot.title}</strong>
        <span>Diapositive {position.slide+1} / {snapshot.slides.length} · apparition {position.reveal} / {groupCount}</span></div>
      <div className="presenter-top-actions">
        <span className="presenter-clock" aria-label="Durée de présentation">{formatSeconds(seconds)}</span>
        <button className="subtle-btn" onClick={openProjection}>{popupOpen?"Réouvrir l'écran public":"Ouvrir l'écran public"}</button>
        <button className="subtle-btn" onClick={()=>void modal.current?.requestFullscreen().catch(()=>{})}>Plein écran</button>
        <button className="subtle-btn" onClick={close} aria-label="Quitter la présentation">Quitter</button>
      </div>
    </header>
    <div className="presenter-content">
      <div className="presenter-main-stage">
        <ProjectionStage key={active.id} slide={active} reveal={position.reveal} onAdvance={next}
          onBusyChange={setBusy} title={"Diapositive "+(position.slide+1)}/>
        <div className="presenter-controls">
          <button aria-label="Étape précédente" onClick={previous} disabled={busy||(position.slide===0&&position.reveal===0)}>← Précédent</button>
          <span>{busy?"Animation en cours…":position.reveal<groupCount?"Cliquez pour révéler l'idée suivante":"Avancer vers la diapositive suivante"}</span>
          <button aria-label="Étape suivante" onClick={next} disabled={busy||(position.slide===snapshot.slides.length-1&&position.reveal===groupCount)}>Suivant →</button>
        </div>
      </div>
      <aside className="presenter-side">
        <section className="presenter-notes">
          <span className="presenter-overline">NOTES DU PRÉSENTATEUR</span>
          <div className="presenter-notes-text">{active.notes?.trim()||"Aucune note pour cette diapositive."}</div>
        </section>
        <section className="presenter-next">
          <span className="presenter-overline">DIAPOSITIVE SUIVANTE</span>
          {following?<div className="presenter-next-slide">
            <SlideThumbnail document={following.document} index={position.slide+2}/>
          </div>:<p>Fin du diaporama</p>}
        </section>
        <section className="presenter-shortcuts">
          <span className="presenter-overline">RACCOURCIS</span>
          <p>→ ou Espace : révéler / avancer<br/>← : revenir<br/>F : plein écran<br/>Échap : quitter</p>
          {popupOpen&&<p>La fenêtre publique affiche uniquement les diapositives. Les notes restent ici.</p>}
          {error&&<p role="alert" className="presenter-error">{error}</p>}
        </section>
      </aside>
    </div>
  </div>;
}
