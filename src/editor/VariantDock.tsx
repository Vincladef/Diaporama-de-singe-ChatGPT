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
type Props={
  token:string;
  slideId:string;
  currentDocument:SlideDocument;
  dirty:boolean;
  refreshKey:number;
  onPreview:(variant:VariantChoice|null)=>void;
  onApply:(document:SlideDocument,notes:string)=>void;
  onManage:()=>void;
};
const letters="ABCDEFGHI";
const shortName=(name:string)=>name.replace(/^[A-I]\s*[·:–-]\s*/,"").trim();

export function VariantDock({token,slideId,currentDocument,dirty,refreshKey,onPreview,onApply,onManage}:Props){
  const [items,setItems]=useState<VariantChoice[]>([]);
  const [picked,setPicked]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    let mounted=true,requesting=false;
    setPicked(null);
    setItems([]);
    setLoading(true);
    const reload=async()=>{
      if(requesting)return;
      requesting=true;
      try{
        const data=await command<{variants:VariantChoice[]}>(token,{action:"listVariants",slideId});
        if(mounted){setItems(data.variants);setError("");}
      }catch(e){
        if(mounted)setError(e instanceof Error?e.message:String(e));
      }finally{
        requesting=false;
        if(mounted)setLoading(false);
      }
    };
    void reload();
    const interval=window.setInterval(()=>void reload(),16000);
    return()=>{mounted=false;window.clearInterval(interval);};
  },[token,slideId,refreshKey]);

  const active=items.find(x=>x.id===picked)||null;
  const select=(item:VariantChoice|null)=>{
    setPicked(item?.id??null);
    onPreview(item?{...item,document:structuredClone(item.document)}:null);
  };
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.repeat)return;
      const key=event.key.toUpperCase();
      if(!["A","B","C"].includes(key))return;
      const el=window.document.activeElement;
      if(el instanceof HTMLElement && (el.closest("input,textarea,select,[contenteditable='true'],[role='dialog']")||el.isContentEditable))return;
      if(key==="A"){event.preventDefault();select(null);return;}
      const item=items[letters.indexOf(key)-1];
      if(item){event.preventDefault();select(item);}
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[items,onPreview]);

  const slots=items.length?items.slice(0,8):[null,null];
  return <section className="variant-dock" aria-label="Choix permanents des compositions">
    <div className="variant-dock-heading">
      <strong>Compositions</strong>
      <span>{loading?"Chargement…":(1+items.length)+" versions"}</span>
      <button type="button" className="variant-dock-manage" onClick={onManage}>Comparer toutes les versions</button>
    </div>
    <div className="variant-dock-options" role="group" aria-label="Choisir A, B ou C">
      <button type="button" aria-pressed={!picked} className={"variant-dock-option"+(!picked?" chosen":"")} onClick={()=>select(null)} title="Afficher la composition actuelle">
        <span className="variant-dock-letter">A</span>
        <span className="variant-dock-thumb"><SlideThumbnail document={currentDocument} index={1}/></span>
        <span className="variant-dock-name"><strong>Actuelle</strong><small>{dirty?"Brouillon local":"Version du diaporama"}</small></span>
      </button>
      {slots.map((item,index)=>{
        const letter=letters[index+1];
        return <button type="button" key={item?.id??"empty-"+index} disabled={!item} aria-pressed={Boolean(item&&picked===item.id)}
          className={"variant-dock-option"+(item&&picked===item.id?" chosen":"")} onClick={()=>item&&select(item)}
          title={item?"Afficher "+shortName(item.name):"Aucune composition enregistrée"}>
          <span className="variant-dock-letter">{letter}</span>
          {item&&<span className="variant-dock-thumb"><SlideThumbnail document={item.document} index={index+2}/></span>}
          <span className="variant-dock-name"><strong>{item?shortName(item.name):"À créer"}</strong><small>{item?"Version alternative":"Aucune variante"}</small></span>
        </button>;
      })}
    </div>
    {active&&<div className="variant-dock-preview" role="status">
      <span>Vous visualisez la composition <strong>{letters[items.indexOf(active)+1]}</strong>. La version actuelle reste inchangée.</span>
      <button type="button" className="variant-dock-apply" onClick={()=>{onApply(structuredClone(active.document),active.notes);select(null);}}>
        Utiliser cette composition
      </button>
      <button type="button" className="variant-dock-reset" onClick={()=>select(null)}>Retour à A</button>
    </div>}
    {error&&<small className="variant-dock-error">Variantes indisponibles : {error}</small>}
  </section>;
}
