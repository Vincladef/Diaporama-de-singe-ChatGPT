import {useRef,useState,type PointerEvent,type KeyboardEvent} from "react";

type Props={
  value:string;
  onChange:(next:string)=>void;
  readOnly?:boolean;
};
const MIN=24;
const INITIAL_OPEN=172;

/** An editor-bottom splitter, like the speaker notes divider in Google Slides. */
export function SpeakerNotesPane({value,onChange,readOnly=false}:Props){
  const [height,setHeight]=useState(MIN);
  const drag=useRef<{pointerId:number,startY:number,startHeight:number}|null>(null);
  const expanded=height>MIN+22;
  const maxHeight=(element:HTMLElement)=>{
    const available=element.closest<HTMLElement>(".editor-main")?.clientHeight??600;
    return Math.max(INITIAL_OPEN,Math.min(480,Math.round(available*.58)));
  };
  function clamp(next:number,target:HTMLElement){
    return Math.max(MIN,Math.min(maxHeight(target),Math.round(next)));
  }
  function pointerDown(event:PointerEvent<HTMLDivElement>){
    if(event.button!==0)return;
    drag.current={pointerId:event.pointerId,startY:event.clientY,startHeight:height};
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function pointerMove(event:PointerEvent<HTMLDivElement>){
    if(!drag.current||drag.current.pointerId!==event.pointerId)return;
    setHeight(clamp(drag.current.startHeight+drag.current.startY-event.clientY,event.currentTarget));
  }
  function pointerEnd(event:PointerEvent<HTMLDivElement>){
    if(!drag.current||drag.current.pointerId!==event.pointerId)return;
    drag.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function keyDown(event:KeyboardEvent<HTMLDivElement>){
    if(event.key==="ArrowUp"||event.key==="ArrowDown"){
      event.preventDefault();
      setHeight(v=>clamp(v+(event.key==="ArrowUp"?28:-28),event.currentTarget));
    }else if(event.key==="Enter"||event.key===" "){
      event.preventDefault();
      setHeight(v=>v>MIN+22?MIN:INITIAL_OPEN);
    }else if(event.key==="Home"){
      event.preventDefault();setHeight(MIN);
    }
  }
  return <section className={"speaker-notes-pane"+(expanded?" is-expanded":"")} style={{height}}>
    <div className="speaker-notes-handle" role="separator" aria-label="Redimensionner les notes du présentateur"
      aria-orientation="horizontal" aria-valuemin={MIN} aria-valuenow={height}
      aria-valuemax={480} tabIndex={0}
      title="Glisser vers le haut pour agrandir les notes ; double-clic pour ouvrir ou fermer"
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd} onDoubleClick={()=>setHeight(v=>v>MIN+22?MIN:INITIAL_OPEN)}
      onKeyDown={keyDown}>
      <span className="speaker-notes-grip" aria-hidden="true"/>
    </div>
    <div className="speaker-notes-heading">
      <strong>Notes du présentateur</strong>
      {!expanded&&<button type="button" title="Afficher les notes" onClick={()=>setHeight(INITIAL_OPEN)}>
        {value.trim()?"● Notes enregistrées":"Cliquer ou glisser pour agrandir"} ▴
      </button>}
      {expanded&&<button type="button" title="Réduire les notes" onClick={()=>setHeight(MIN)}>Réduire ▾</button>}
    </div>
    {expanded&&<textarea id="slide-notes" aria-label="Notes du présentateur" rows={5}
      value={value} readOnly={readOnly} onChange={event=>onChange(event.target.value)}
      placeholder="Cliquez pour ajouter des notes du présentateur…"/>}
  </section>;
}
