import {useEffect,useState} from "react";
import type {SlideDocument} from "../domain/slide";
import {command} from "../lib/api";
import {SlideThumbnail} from "./SlideThumbnail";

export type VariantChoice={
  id:string;
  name:string;
  document:SlideDocument;
  notes:string;
};
const letters="ABCDEFGHI";
const shortName=(name:string)=>name.replace(/^[A-I]\\s*[·:–-]\\s*/,"").trim();

export function useSlideVariants(token:string,slideId:string|null,refreshKey:number){
  const [items,setItems]=useState<VariantChoice[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    if(!slideId){setItems([]);setLoading(false);return;}
    let mounted=true;
    let requesting=false;
    setItems([]);setError("");setLoading(true);
    const reload=async()=>{
      if(requesting)return;
      requesting=true;
      try{
        const data=await command<{variants:VariantChoice[]}>(token,{action:"listVariants",slideId});
        if(mounted){setItems(data.variants??[]);setError("");}
      }catch(e){
        if(mounted)setError(e instanceof Error?e.message:String(e));
      }finally{
        requesting=false;
        if(mounted)setLoading(false);
      }
    };
    void reload();
    const timer=window.setInterval(()=>void reload(),16000);
    return()=>{mounted=false;window.clearInterval(timer);};
  },[token,slideId,refreshKey]);
  return {items,loading,error};
}

export function useVariantKeyboard(items:VariantChoice[],onSelect:(item:VariantChoice|null)=>void){
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.repeat)return;
      const key=event.key.toUpperCase();
      if(!["A","B","C"].includes(key))return;
      if(window.document.querySelector(".presenter-overlay, .studio-backdrop"))return;
      const element=window.document.activeElement;
      if(element instanceof HTMLElement&&(element.closest("input,textarea,select,[contenteditable='true'],[role='dialog']")||element.isContentEditable))return;
      if(key==="A"){event.preventDefault();onSelect(null);return;}
      const item=items[letters.indexOf(key)-1];
      if(item){event.preventDefault();onSelect(item);}
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[items,onSelect]);
}

type ControlsProps={
  items:VariantChoice[];
  loading:boolean;
  selectedId:string|null;
  onSelect:(item:VariantChoice|null)=>void;
  onCompare:()=>void;
  onApply:()=>void;
};

export function VariantSwitcher({items,loading,selectedId,onSelect,onCompare,onApply}:ControlsProps){
  return <div className="variant-switcher" aria-label="Changer de composition">
    <div className="variant-switcher-title"><strong>Variantes</strong><small>{loading?"Chargement…":(items.length+1)+" compositions"}</small></div>
    <div className="variant-switcher-options" role="group" aria-label="Variantes A, B, C">
      {[null,...items.slice(0,2),...Array.from({length:Math.max(0,2-items.length)},()=>undefined)].map((item,index)=>{
        const chosen=index===0?!selectedId:!!item&&item.id===selectedId;
        const enabled=index===0||!!item;
        const label=index===0?"Actuelle":item?shortName(item.name):"À créer";
        return <button key={item?.id??"slot-"+index} type="button" aria-pressed={chosen}
          className={"variant-switch-button"+(chosen?" is-current":"")+(enabled?"":" is-empty")}
          onClick={()=>item===undefined?onCompare():onSelect(item)}
          title={enabled?"Afficher "+label:"Créer une variante"}>
          <span className="variant-switch-letter">{letters[index]}</span>
          <span className="variant-switch-name">{label}</span>
        </button>;
      })}
    </div>
    <button className="variant-compare-button" type="button" onClick={onCompare}>▦ Comparer les 3</button>
    {items.length>2&&<button className="variant-more-button" type="button" onClick={onCompare}>+{items.length-2}</button>}
    {selectedId&&<button className="variant-use-button" type="button" onClick={onApply}>✓ Utiliser cette variante</button>}
  </div>;
}

type GalleryProps=ControlsProps&{currentDocument:SlideDocument;error:string;dirty:boolean;};
export function VariantGallery({items,loading,selectedId,onSelect,onCompare,onApply,currentDocument,error,dirty}:GalleryProps){
  const visible=[{id:"original",name:"Composition actuelle",document:currentDocument,notes:""} as VariantChoice,...items];
  return <aside className="variant-gallery" aria-label="Galerie des compositions">
    <header className="variant-gallery-header">
      <strong>Compositions</strong>
      <span>{items.length+1} version{items.length>0?"s":""}</span>
    </header>
    <p className="variant-gallery-lead">Choisissez une composition ; comparez les propositions sans modifier votre diapositive.</p>
    <div className="variant-gallery-list">
      {visible.map((item,index)=>{
        const chosen=index===0?!selectedId:selectedId===item.id;
        return <button className={"variant-gallery-card"+(chosen?" is-current":"")} type="button"
          key={item.id} aria-pressed={chosen} onClick={()=>onSelect(index===0?null:item)}>
          <span className="variant-gallery-image"><SlideThumbnail document={item.document} index={index+1}/></span>
          <span className="variant-gallery-label"><b>{letters[index]} · {index===0?"Version actuelle":shortName(item.name)}</b>{chosen&&<span>✓</span>}</span>
          {index===0&&dirty&&<small>Modifications non enregistrées</small>}
        </button>;
      })}
      {loading&&<p className="variant-gallery-hint">Chargement des variantes…</p>}
      {!loading&&items.length===0&&<p className="variant-gallery-hint">Les nouvelles variantes créées via ChatGPT apparaîtront ici.</p>}
    </div>
    <footer className="variant-gallery-actions">
      {selectedId&&<button className="variant-use-button" type="button" onClick={onApply}>✓ Utiliser cette variante</button>}
      <button type="button" className="variant-compare-button" onClick={onCompare}>▦ Comparer / créer</button>
      {error&&<small role="status">Chargement impossible : {error}</small>}
    </footer>
  </aside>;
}
