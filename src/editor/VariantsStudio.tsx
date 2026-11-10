import { useCallback,useEffect,useState } from "react";
import type { SlideDocument } from "../domain/slide";
import { proposeGraphicVariants,type ProposedVariant } from "../variants/propose";
import { compareOneVariant } from "../variants/compare";
import { SlideThumbnail } from "./SlideThumbnail";
import { command } from "../lib/api";

type StoredVariant={id:string;name:string;document:SlideDocument;notes:string;created_at:string};
type Props={
  token:string;
  slideId:string;
  document:SlideDocument;
  notes:string;
  dirty:boolean;
  onClose:()=>void;
  onSelectStored:(variant:{id:string;name:string;document:SlideDocument;notes:string})=>Promise<boolean>;
};
export function VariantsStudio({token,slideId,document,notes,dirty,onClose,onSelectStored}:Props){
  const [alternatives,setAlternatives]=useState<StoredVariant[]>([]);
  const [proposals,setProposals]=useState<ProposedVariant[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [choosing,setChoosing]=useState<string|null>(null);

  const refresh=useCallback(async()=>{
    const data=await command<{variants:StoredVariant[]}>(token,{action:"listVariants",slideId});
    setAlternatives(data.variants);
  },[token,slideId]);
  useEffect(()=>{
    let cancelled=false;
    void refresh().catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:String(e));});
    const timer=window.setInterval(()=>void refresh().catch(()=>{}),16000);
    const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",escape);
    return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener("keydown",escape);};
  },[refresh,onClose]);
  function generate(){
    setProposals(proposeGraphicVariants(document,6));

  }
  async function persist(){
    if(!proposals.length)return;
    if(dirty){setError("Enregistre d'abord la diapositive pour conserver les variantes sur la même version.");return;}
    setLoading(true);setError("");
    try{
      await command(token,{action:"createVariants",slideId,
        variants:proposals.map(v=>({name:v.name,slide:{document:v.document,notes}}))});
      setProposals([]);await refresh();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  }
  const candidates=[
    ...proposals.map((v,i)=>({id:"proposal-"+i,name:v.name,document:v.document,notes,description:v.description,stored:false})),
    ...alternatives.map(v=>({id:v.id,name:v.name,document:v.document,notes:v.notes,description:"Variante enregistrée et accessible depuis le MCP",stored:true})),
  ];
  async function choose(candidate:(typeof candidates)[number]){
    if(loading||choosing)return;
    setChoosing(candidate.id);setError("");
    try{
      let target:{id:string;name:string;document:SlideDocument;notes:string}=candidate;
      if(!candidate.stored){
        const saved=await command<{variants:{id:string;name:string}[]}>(token,{
          action:"createVariants",slideId,
          variants:[{name:candidate.name,slide:{document:candidate.document,notes:candidate.notes}}],
        });
        if(!saved.variants?.[0]?.id)throw new Error("Enregistrement de la variante impossible.");
        target={...candidate,id:saved.variants[0].id};
      }
      if(await onSelectStored(target))onClose();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setChoosing(null);}
  }
  return (
    <div className="studio-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <section className="studio-dialog variants-studio" role="dialog" aria-modal="true" aria-label="Comparer les variantes graphiques">
        <header className="studio-header">
          <div><strong>Compositions</strong><span>Plusieurs directions pour le même contenu ; aucun modèle imposé</span></div>
          <button onClick={onClose} aria-label="Fermer les variantes" className="studio-close">×</button>
        </header>
        <div className="studio-variant-toolbar">
          <button className="primary" disabled={loading} onClick={generate}>Proposer six directions</button>
          {proposals.length>0&&<button disabled={loading||dirty} onClick={()=>void persist()}>
            {loading?"Enregistrement…":"Conserver les variantes dans Neon"}
          </button>}
          <span>Les variantes créées par ChatGPT via MCP apparaissent également ici.</span>
        </div>
        {error&&<div role="alert" className="error-line">{error}</div>}
        <div className="studio-variant-grid">
          <div className="variant-card current-variant">
            <div className="variant-preview"><SlideThumbnail document={document} index={0}/></div>
            <div className="variant-description"><strong>Version actuelle</strong><p>La composition ouverte dans l'éditeur.</p></div>
          </div>
          {candidates.map((candidate,i)=><button key={candidate.id} className={"variant-card selectable"+(choosing===candidate.id?" selected":"")}
            disabled={Boolean(choosing)||loading} onClick={()=>void choose(candidate)}>
              <div className="variant-preview"><SlideThumbnail document={candidate.document} index={i+1}/></div>
              <div className="variant-description"><strong>{candidate.name}</strong><p>{candidate.description}</p>
                <span>{candidate.stored?"Enregistrée":"Proposition locale"} · {compareOneVariant({name:"Actuelle",document,notes},candidate).indicators.imageCount} image(s) · {compareOneVariant({name:"Actuelle",document,notes},candidate).indicators.warnings} alerte(s)</span>
              </div>
            </button>)}
          {candidates.length===0&&<div className="studio-empty">Crée six directions graphiques pour cette diapositive, puis compare-les côte à côte. Les contenus restent modifiables.</div>}
        </div>
        <footer className="studio-variant-footer">
          <span>{choosing?"Enregistrement du choix…":candidates.length+" proposition"+(candidates.length>1?"s":"")+" disponibles"} · Un clic pour choisir</span>
          <button onClick={onClose} disabled={Boolean(choosing)}>Fermer</button>
        </footer>
      </section>
    </div>
  );
}
