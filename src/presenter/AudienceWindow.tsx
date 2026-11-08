import { useEffect,useMemo,useRef,useState } from "react";
import type { SlideDocument } from "../domain/slide";
import type { PlaybackPosition } from "../animation/timeline";
import { ProjectionStage } from "./ProjectionStage";

type Show={title:string;slides:{id:string;document:SlideDocument}[]};
type Message={
  sessionId:string;
  type:"hello"|"init"|"state"|"command"|"close";
  title?:string;
  slides?:Show["slides"];
  position?:PlaybackPosition;
  blackout?:boolean;
  command?:"next"|"previous"|"toggleBlackout";
};
/** Public display receives a transient slide snapshot from its same-origin presenter tab.
 * It never receives the editor key, personal notes, or direct Neon access.
 */
export function AudienceWindow(){
  const sessionId=useMemo(()=>decodeURIComponent(window.location.hash.slice(1)),[]);
  const [show,setShow]=useState<Show|null>(null);
  const [position,setPosition]=useState<PlaybackPosition>({slide:0,reveal:0});
  const [ended,setEnded]=useState(false);
  const channel=useRef<BroadcastChannel|null>(null);
  const loaded=useRef(false);
  const [busy,setBusy]=useState(false);
  const [blackout,setBlackout]=useState(false);
  const busyRef=useRef(busy);busyRef.current=busy;
  useEffect(()=>{
    if(!/^[a-f0-9-]{36}$/i.test(sessionId))return;
    const ch=new BroadcastChannel("singe-projection:"+sessionId);
    channel.current=ch;
    ch.onmessage=(ev:MessageEvent<Message>)=>{
      const message=ev.data;
      if(!message||message.sessionId!==sessionId)return;
      if(message.type==="init"&&Array.isArray(message.slides)&&message.slides.length){
        const content=message.slides.filter(s=>s&&typeof s.id==="string"&&s.document).slice(0,500);
        if(!content.length)return;
        loaded.current=true;
        setShow({title:message.title??"Présentation",slides:content});
        if(message.position)setPosition(message.position);
        setBlackout(Boolean(message.blackout));
        setEnded(false);
      }else if(message.type==="state"&&message.position){
        setPosition(message.position);
        setBlackout(Boolean(message.blackout));
      }else if(message.type==="close"){
        loaded.current=false;setShow(null);setEnded(true);
      }
    };
    const hello=()=>{
      if(!loaded.current)ch.postMessage({type:"hello",sessionId} satisfies Message);
    };
    hello();
    const timer=window.setInterval(hello,1200);
    return()=>{window.clearInterval(timer);ch.close();channel.current=null;};
  },[sessionId]);
  function command(action:"next"|"previous"|"toggleBlackout"){
    if(busyRef.current)return;
    channel.current?.postMessage({type:"command",sessionId,command:action} satisfies Message);
  }
  useEffect(()=>{
    const handler=(event:KeyboardEvent)=>{
      if(["ArrowRight","PageDown"," ","Enter"].includes(event.key)){
        event.preventDefault();command("next");
      }else if(["ArrowLeft","PageUp","Backspace"].includes(event.key)){
        event.preventDefault();command("previous");
      }else if(event.key.toLowerCase()==="b"&&!event.ctrlKey){
        event.preventDefault();command("toggleBlackout");
      }else if(event.key.toLowerCase()==="f"&&!event.ctrlKey){
        event.preventDefault();if(!document.fullscreenElement)void document.documentElement.requestFullscreen().catch(()=>{});
      }
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[sessionId]);
  const active=show?.slides[position.slide];
  return <main className="audience-root">
    {show&&active?<>
      <ProjectionStage slide={active} reveal={position.reveal}
        onAdvance={()=>command("next")} onBusyChange={setBusy}
        title={show.title+" · diapositive "+(position.slide+1)}/>
      {blackout&&<div role="status" aria-label="Écran noir" onClick={()=>command("toggleBlackout")}
        style={{position:"fixed",inset:0,background:"#000",zIndex:20,cursor:"pointer"}}/>}
      <div className="audience-bottom">
        <button onClick={()=>command("previous")} aria-label="Précédent">←</button>
        <span>{position.slide+1} / {show.slides.length}</span>
        <button onClick={()=>command("next")} aria-label="Suivant">→</button>
        <button onClick={()=>void document.documentElement.requestFullscreen().catch(()=>{})}>Plein écran</button>
      </div>
    </>:<div className="audience-waiting">
      <div className="audience-symbol">◆</div>
      <h1>Diaporama de singe</h1>
      <p>{ended?"La présentation est terminée.":"En attente de la connexion avec le présentateur…"}</p>
      {!sessionId&&<small>Ouvrez cet écran depuis le mode présentateur de l'éditeur.</small>}
    </div>}
  </main>;
}
