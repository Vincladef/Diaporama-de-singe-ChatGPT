import { useEffect,useMemo,useState } from "react";
import { SlideThumbnail } from "./SlideThumbnail";
import { visibleStructuredElements } from "../export/nativeSteps";
import { isNativePptxObject } from "../export/preflight";
import { AnimationStepSchema,type AnimationStep,type SlideDocument } from "../domain/slide";
import { buildPlaybackPlan,timelineTarget } from "../animation/timeline";

type Props={
  document:SlideDocument;
  selectedIds:string[];
  onChange:(document:SlideDocument,key?:string)=>void;
  onPreview:()=>void;
  onSelect?:(ids:string[])=>void;
};
const EFFECTS=[
  ["appear","Apparition immédiate"],["fade","Fondu"],["move","Glissement"],["scale","Zoom doux"],
  ["wipe","Dévoilement horizontal"],["highlight","Mettre en évidence"],["dim","Atténuer"],
  ["hide","Masquer"],["custom","Animation libre"],
] as const;
const effectLabel=(name:string)=>EFFECTS.find(e=>e[0]===name)?.[1]??name;
type TargetChoice={value:string;label:string;selector:boolean};
function freeformTargets(html:string):TargetChoice[]{
  if(!html.trim())return [];
  try{
    const doc=new DOMParser().parseFromString(html,"text/html");
    const choices:TargetChoice[]=[];
    for(const element of Array.from(doc.querySelectorAll("[id],[data-animate]")).slice(0,100)){
      const id=element.id;
      const named=element.getAttribute("data-animate");
      if(id&&/^[A-Za-z][\w:-]*$/.test(id))
        choices.push({value:"#"+id,label:"#"+id+" · "+element.tagName.toLowerCase(),selector:true});
      else if(named&&/^[A-Za-z][\w-]*$/.test(named))
        choices.push({value:'[data-animate="'+named+'"]',label:"Animation : "+named,selector:true});
    }
    return choices;
  }catch{return [];}
}
export function AnimationTimeline({document:doc,selectedIds,onChange,onPreview,onSelect}:Props){
  const [target,setTarget]=useState("");
  const [customSelector,setCustomSelector]=useState("");
  const [effect,setEffect]=useState<AnimationStep["effect"]>("fade");
  const [trigger,setTrigger]=useState<AnimationStep["trigger"]>("click");
  const [duration,setDuration]=useState(450);
  const [delay,setDelay]=useState(0);
  const [showAdvanced,setShowAdvanced]=useState(false);
  const [error,setError]=useState("");
  const [dragged,setDragged]=useState<string|null>(null);
  const [editingKeyframes,setEditingKeyframes]=useState<string|null>(null);
  const [jsonText,setJsonText]=useState("");
  const [previewClick,setPreviewClick]=useState(0);
  const ordered=useMemo(()=>[...doc.animations].sort((a,b)=>a.order-b.order),[doc.animations]);
  const plan=useMemo(()=>buildPlaybackPlan(doc.animations),[doc.animations]);
  const structured=doc.elements.map(el=>({
    value:"element:"+el.id,
    label:timelineTarget({targetElementId:el.id} as AnimationStep,doc),
    selector:false,
  }));
  const free=freeformTargets(doc.freeform?.html??"");
  const options=[...structured,...free];
  const previewDocument=useMemo(()=>({...doc,elements:visibleStructuredElements(doc,previewClick)}),[doc,previewClick]);
  useEffect(()=>{setPreviewClick(c=>Math.min(c,plan.clicks.length));},[plan.clicks.length]);
  useEffect(()=>{
    if(selectedIds.length===1)setTarget("element:"+selectedIds[0]);
  },[selectedIds.join("|")]);
  const currentTarget=target||((selectedIds.length===1?"element:"+selectedIds[0]:"")||options[0]?.value||"css");

  function apply(steps:AnimationStep[]){
    onChange({...doc,animations:steps.map((s,i)=>({...s,order:i}))},"animations");
    setError("");
  }
  function addMany(ids:string[],chain=false){
    const next=[...ordered];
    for(let i=0;i<ids.length;i++){
      const element=doc.elements.find(e=>e.id===ids[i]);
      if(!element)continue;
      next.push(AnimationStepSchema.parse({
        id:crypto.randomUUID(),targetElementId:element.id,order:next.length,
        effect,trigger:chain&&i>0?"after-previous":trigger,durationMs:duration,delayMs:delay,
      }));
    }
    if(next.length===ordered.length){setError("Sélectionnez un calque à animer.");return;}
    apply(next);
  }
  function add(){
    if(currentTarget.startsWith("element:")){
      addMany([currentTarget.slice(8)]);return;
    }
    const selector=currentTarget==="css"?customSelector.trim():currentTarget.trim();
    if(!selector){setError("Choisissez un élément ou indiquez un sélecteur CSS.");return;}
    try{document.querySelector(selector);}catch{setError("Sélecteur CSS invalide.");return;}
    try{
      const item=AnimationStepSchema.parse({id:crypto.randomUUID(),targetSelector:selector,
        order:ordered.length,trigger,effect,durationMs:duration,delayMs:delay});
      apply([...ordered,item]);
    }catch{setError("Les paramètres de cette animation ne sont pas valides.");}
  }
  function patch(id:string,updates:Partial<AnimationStep>){
    const next=ordered.map(s=>s.id===id?{...s,...updates}:s);
    try{
      next.forEach(s=>AnimationStepSchema.parse(s));
      apply(next);
    }catch{setError("Impossible d'enregistrer ce réglage.");}
  }
  function move(id:string,toIndex:number){
    const source=ordered.findIndex(s=>s.id===id);
    if(source<0||toIndex<0||toIndex>=ordered.length||source===toIndex)return;
    const array=[...ordered];const [cue]=array.splice(source,1);array.splice(toIndex,0,cue!);
    apply(array);
  }
  function saveKeyframes(id:string){
    try{
      const json:unknown=JSON.parse(jsonText);
      const steps=ordered.map(s=>s.id===id?AnimationStepSchema.parse({...s,effect:"custom",keyframes:json}):s);
      apply(steps);
      setEditingKeyframes(null);
    }catch{setError("Les keyframes doivent être un tableau JSON de 2 à 16 objets CSS.");}
  }
  return <section className="animation-timeline" aria-label="Chronologie des animations">
    <div className="animation-timeline-head">
      <div><strong>Animations</strong>
        <span>{plan.clicks.length} clic{plan.clicks.length>1?"s":""} ; {ordered.length} effet{ordered.length>1?"s":""}</span></div>
      <button className="subtle-btn" onClick={onPreview}>Projection plein écran</button>
    </div>
    <div className="timeline-visual-preview">
      <div className="timeline-preview-controls">
        <strong>Aperçu au clic · {previewClick}/{plan.clicks.length}</strong>
        <div>
          <button onClick={()=>setPreviewClick(c=>Math.max(0,c-1))}
            disabled={previewClick===0} aria-label="Clic précédent">←</button>
          <button onClick={()=>setPreviewClick(c=>Math.min(plan.clicks.length,c+1))}
            disabled={previewClick===plan.clicks.length} aria-label="Clic suivant">Clic suivant →</button>
        </div>
      </div>
      <div className="timeline-preview-slide">
        <SlideThumbnail document={previewDocument} index={0}/>
      </div>
      {doc.mode!=="structured"&&<small>Pour les animations HTML, utiliser « Projection plein écran » ; cet aperçu affiche les calques structurés.</small>}
      <div className="timeline-click-strip" aria-label="Étapes au clic">
        {Array.from({length:plan.clicks.length+1},(_,i)=>
          <button key={i} aria-current={previewClick===i?"step":undefined}
            className={previewClick===i?"current":""} onClick={()=>setPreviewClick(i)}>
            {i===0?"Départ":"Clic "+i}
          </button>)}
      </div>
    </div>
    <div className="timeline-quick-add">
      <label>Élément à animer
        <select aria-label="Cible de l'animation" value={currentTarget} onChange={e=>setTarget(e.target.value)}>
          {options.map(o=><option value={o.selector?o.value:o.value} key={o.value}>{o.label}</option>)}
          <option value="css">Sélecteur CSS libre…</option>
        </select>
      </label>
      {currentTarget==="css"&&<label>Sélecteur CSS du HTML libre
        <input aria-label="Sélecteur CSS" value={customSelector} onChange={e=>setCustomSelector(e.target.value)}
          placeholder="#etape-1, .illustration, [data-animate]"/>
      </label>}
      <div className="timeline-add-fields">
        <label>Effet<select aria-label="Effet à ajouter" value={effect} onChange={e=>setEffect(e.target.value as AnimationStep["effect"])}>
          {EFFECTS.map(([id,name])=><option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>Démarrage<select aria-label="Déclencheur à ajouter" value={trigger} onChange={e=>setTrigger(e.target.value as AnimationStep["trigger"])}>
          <option value="click">Au clic</option><option value="after-previous">Après le précédent</option>
        </select></label>
        <label>Durée (ms)<input aria-label="Durée à ajouter" type="number" min={0} max={60000} step={50} value={duration}
          onChange={e=>setDuration(Math.min(60000,Math.max(0,Number(e.target.value)||0)))}/></label>
        <button className="primary timeline-add-button" onClick={add}>Ajouter</button>
      </div>
      {selectedIds.length>1&&<button className="subtle-btn timeline-multi" onClick={()=>addMany(selectedIds,true)}>
        Ajouter {selectedIds.length} calques en un clic (en chaîne)
      </button>}
      <button className="timeline-advanced-toggle" onClick={()=>setShowAdvanced(v=>!v)}>
        {showAdvanced?"Masquer les options":"Options de délai et liberté Web"} {showAdvanced?"▴":"▾"}</button>
      {showAdvanced&&<div className="timeline-advanced">
        <label>Délai avant l'effet (ms)<input type="number" aria-label="Délai à ajouter" min={0} max={30000}
          value={delay} onChange={e=>setDelay(Math.max(0,Math.min(30000,Number(e.target.value)||0)))}/></label>
        <p>Les sélecteurs CSS peuvent animer un élément libre, sans le convertir en objet. L'effet « Animation libre » accepte des keyframes Web personnalisées dans chaque étape.</p>
      </div>}
    </div>
    {error&&<div className="timeline-error" role="alert">{error}</div>}
    <div className="timeline-cues" aria-label="Étapes de l'animation">
      {ordered.length===0&&<p className="timeline-empty">Aucune animation. Les calques sont tous visibles lorsque la diapositive apparaît. Ajoutez un fondu au clic pour dévoiler une idée progressivement.</p>}
      {ordered.map((step,i)=><div key={step.id} className="timeline-cue" draggable
        onDragStart={e=>{setDragged(step.id);e.dataTransfer.setData("text/x-singe-cue",step.id);e.dataTransfer.effectAllowed="move";}}
        onDragEnd={()=>setDragged(null)}
        onDragOver={e=>e.preventDefault()}
        onDrop={e=>{e.preventDefault();const origin=e.dataTransfer.getData("text/x-singe-cue")||dragged;if(origin)move(origin,i);setDragged(null);}}>
        <div className="timeline-cue-main">
          <button className="timeline-cue-order" title="Prévisualiser cette étape"
            onClick={()=>{const n=plan.clicks.findIndex(group=>group.some(c=>c.id===step.id));setPreviewClick(n<0?0:n+1);
              if(step.targetElementId)onSelect?.([step.targetElementId]);}}>
            {String(i+1).padStart(2,"0")}
          </button>
          <div className="timeline-cue-description"><strong>{timelineTarget(step,doc)}</strong>
            <small>{step.trigger==="click"?"● Clic pour avancer":"↳ Après le précédent"}</small>
            <small className="timeline-compatibility">{doc.mode!=="freeform" &&
              ["appear","fade","move","scale","wipe"].includes(step.effect) &&
              doc.elements.some(el=>el.id===step.targetElementId&&!el.hidden&&isNativePptxObject(el))
                ?"PowerPoint : effet natif possible":"Export : effet Web ou étape de secours"}</small></div>
          <span className="timeline-drag-handle" aria-hidden="true">⠿</span>
        </div>
        <div className="timeline-cue-controls">
          <select aria-label={"Effet étape "+(i+1)} value={step.effect} onChange={e=>patch(step.id,{effect:e.target.value as AnimationStep["effect"]})}>
            {EFFECTS.map(([id,name])=><option key={id} value={id}>{name}</option>)}
          </select>
          <select aria-label={"Déclenchement étape "+(i+1)} value={step.trigger}
            onChange={e=>patch(step.id,{trigger:e.target.value as AnimationStep["trigger"]})}>
            <option value="click">Au clic</option><option value="after-previous">Après le précédent</option>
          </select>
          <label>Durée<input aria-label={"Durée étape "+(i+1)} type="number" min={0} max={60000} step={50}
            value={step.durationMs} onChange={e=>patch(step.id,{durationMs:Math.max(0,Math.min(60000,Number(e.target.value)||0))})}/></label>
          <button aria-label={"Monter étape "+(i+1)} disabled={i===0} onClick={()=>move(step.id,i-1)}>↑</button>
          <button aria-label={"Descendre étape "+(i+1)} disabled={i===ordered.length-1} onClick={()=>move(step.id,i+1)}>↓</button>
          <button aria-label={"Supprimer étape "+(i+1)} onClick={()=>apply(ordered.filter(x=>x.id!==step.id))}>×</button>
        </div>
        <details className="timeline-cue-extra">
          <summary>Options de cette étape</summary>
          <div className="timeline-cue-extra-fields">
            <label>Délai (ms)<input type="number" min={0} max={30000} step={50}
              value={step.delayMs??0}
              onChange={e=>patch(step.id,{delayMs:Math.min(30000,Math.max(0,Number(e.target.value)||0))})}/></label>
            <label>Rythme<select value={step.easing??"ease-out"}
              onChange={e=>patch(step.id,{easing:e.target.value as NonNullable<AnimationStep["easing"]>})}>
              <option value="linear">Linéaire</option>
              <option value="ease-out">Ralentir à la fin</option>
              <option value="ease-in">Accélérer</option>
              <option value="ease-in-out">Doux au début et à la fin</option>
              <option value="ease">Standard</option>
            </select></label>
            {step.effect==="move"&&<>
              <label>Déplacement horizontal (px)<input type="number" min={-4096} max={4096}
                value={step.offsetX??0} onChange={e=>patch(step.id,{offsetX:Number(e.target.value)||0})}/></label>
              <label>Déplacement vertical (px)<input type="number" min={-4096} max={4096}
                value={step.offsetY??72} onChange={e=>patch(step.id,{offsetY:Number(e.target.value)||0})}/></label>
            </>}
          </div>
        </details>
        {step.effect==="custom"&&<div className="timeline-keyframes">
          <button className="timeline-advanced-toggle" onClick={()=>{
            setEditingKeyframes(editingKeyframes===step.id?null:step.id);
            setJsonText(JSON.stringify(step.keyframes??[{opacity:0,transform:"translateY(50px)"},{opacity:1,transform:"translateY(0px)"}],null,2));
          }}>Personnaliser les images clés (Web Animations)</button>
          {editingKeyframes===step.id&&<>
            <textarea aria-label={"Images clés étape "+(i+1)} spellCheck={false} rows={6} value={jsonText}
              onChange={e=>setJsonText(e.target.value)}/>
            <button className="subtle-btn" onClick={()=>saveKeyframes(step.id)}>Valider les images clés</button>
          </>}
        </div>}
      </div>)}
    </div>
    <div className="timeline-footer">
      <small>Faites glisser les étapes pour changer leur ordre. Les effets « Après le précédent » s'enchaînent automatiquement.</small>
    </div>
  </section>;
}
