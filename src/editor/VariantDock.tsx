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
  const original=items.find(item=>item.name==="A · Original (automatique)")??null;
  const alternatives=items.filter(item=>item.id!==original?.id).sort((a,b)=>{
    const letter=(item:VariantChoice)=>item.name.match(/^([B-I])\\s*[·:\\-]/)?.[1]??"Z";
    return letter(a).localeCompare(letter(b));
  });
  return {items:alternatives,original,loading,error};
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
  original:VariantChoice|null;
  disabled?:boolean;
};

export function VariantSwitcher({items,original,loading,selectedId,onSelect,onCompare,disabled}:ControlsProps){
  return <div className="variant-switcher" aria-label="Changer de composition">
    <div className="variant-switcher-title"><strong>Variantes</strong><small>{loading?"Chargement…":(items.length+1)+" compositions"}</small></div>
    <div className="variant-switcher-options" role="group" aria-label="Variantes A, B, C">
      {[original,...items.slice(0,2),...Array.from({length:Math.max(0,2-items.length)},()=>undefined)].map((item,index)=>{
        const chosen=index===0?(!selectedId||selectedId===original?.id):!!item&&item.id===selectedId;
        const enabled=index===0||!!item;
        const label=index===0?"Originale":item?shortName(item.name):"À créer";
        return <button key={item?.id??"slot-"+index} type="button" aria-pressed={chosen}
          className={"variant-switch-button"+(chosen?" is-current":"")+(enabled?"":" is-empty")}
          disabled={disabled}
          onClick={()=>item===undefined?index===0?onSelect(null):onCompare():onSelect(item)}
          title={enabled?"Afficher "+label:"Créer une variante"}>
          <span className="variant-switch-letter">{letters[index]}</span>
          <span className="variant-switch-name">{label}</span>
        </button>;
      })}
    </div>
    <button className="variant-compare-button" type="button" disabled={disabled} onClick={onCompare}>▦ Comparer les variantes</button>
    {items.length>2&&<button className="variant-more-button" type="button" onClick={onCompare}>+{items.length-2}</button>}
  </div>;
}

type GalleryProps=ControlsProps&{currentDocument:SlideDocument;error:string;dirty:boolean;};
export function VariantGallery({items,original,loading,selectedId,onSelect,currentDocument,error,dirty,disabled}:GalleryProps){
  const source=original??{id:"original",name:"A · Originale",document:currentDocument,notes:""};
  const visible=[source,...items];
  return <aside className="variant-gallery" aria-label="Galerie des compositions">
    <header className="variant-gallery-header">
      <strong>Compositions</strong>
      <span>{items.length+1} version{items.length>0?"s":""}</span>
    </header>
    <p className="variant-gallery-lead">Un clic choisit la version utilisée et enregistrée pour cette diapositive.</p>
    <div className="variant-gallery-list">
      {visible.map((item,index)=>{
        const chosen=index===0?(!selectedId||selectedId===original?.id):selectedId===item.id;
        const view=chosen?currentDocument:item.document;
        return <button className={"variant-gallery-card"+(chosen?" is-current":"")} type="button"
          disabled={disabled} key={item.id} aria-pressed={chosen} onClick={()=>onSelect(index===0?original:item)}>
          <span className="variant-gallery-image"><SlideThumbnail document={view} index={index+1}/></span>
          <span className="variant-gallery-label"><b>{letters[index]} · {index===0?"Originale":shortName(item.name)}</b>{chosen&&<span>✓</span>}</span>
          {chosen&&dirty&&<small>Enregistrement automatique en cours</small>}
        </button>;
      })}
      {loading&&<p className="variant-gallery-hint">Chargement des variantes…</p>}
      {!loading&&items.length===0&&<p className="variant-gallery-hint">Les nouvelles variantes créées via ChatGPT apparaîtront ici.</p>}
    </div>
    <footer className="variant-gallery-actions">
      {error&&<small role="status">Chargement impossible : {error}</small>}
    </footer>
  </aside>;
}
