import { useCallback,useEffect,useState } from "react";
import type { SlideDocument } from "../domain/slide";
import { proposeGraphicVariants,type ProposedVariant } from "../variants/propose";
import { compareOneVariant } from "../variants/compare";
import { SlideThumbnail } from "./SlideThumbnail";
import { command } from "../lib/api";
import {VariantFeedbackActions,useVisualFeedback} from "./VariantFeedback";

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
  const [copied,setCopied]=useState(false);
  const feedback=useVisualFeedback(token,slideId);

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
  async function copyAiRequest(){
    const prompt=[
      "# Diaporama de singe : trois variantes IA indépendantes",
      "",
      "Pour la diapositive "+slideId+" :",
      "1. Appelle prepare_independent_variants avec slideId = "+slideId+".",
      "2. Lis toutes les consignes, le contenu, les notes et regarde les images des références renvoyées.",
      "3. Invente trois directions artistiques réellement distinctes, adaptées au contenu de cette page.",
      "4. Crée trois documents HTML/CSS/SVG complets et originaux. Ne transforme pas une seule base par recoloration.",
      "5. Appelle create_independent_variants avec les trois documents, leurs intentions et la révision exacte.",
      "6. Vérifie leur enregistrement via list_variants ; conserve les notes et sources ; ne prétends pas avoir examiné une capture sans l'avoir vue.",
      "",
      "N'utilise pas generate_variants ni proposeGraphicVariants pour cette demande.",
    ].join("\n");
    try{await navigator.clipboard.writeText(prompt);setCopied(true);setError("");}
    catch{setError("Copie impossible ; ouvre ChatGPT et demande trois variantes IA indépendantes pour la diapositive "+slideId+".");}
  }
  function generateQuick(){
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
          <div><strong>Compositions</strong><span>Trois compositions IA originales ; outils rapides facultatifs</span></div>
          <button onClick={onClose} aria-label="Fermer les variantes" className="studio-close">×</button>
        </header>
        <div className="studio-variant-toolbar ai-variant-workflow">
          <div className="ai-variant-explain">
            <strong>Trois variantes originales avec ChatGPT</strong>
            <span>ChatGPT examine tes références, imagine trois compositions HTML/CSS différentes, puis les enregistre ici. Cette interface ne dispose pas d'un moteur IA autonome configuré.</span>
          </div>
          <button className="primary" type="button" onClick={()=>void copyAiRequest()}>
            {copied?"Commande copiée ✓":"Copier la commande pour ChatGPT"}
          </button>
          <details className="quick-variant-tools">
            <summary>Variations rapides sans IA</summary>
            <div className="quick-variant-content">
              <p>Transformations déterministes de la composition actuelle, utiles pour un essai rapide, mais différentes de trois créations originales.</p>
              <button type="button" disabled={loading} onClick={generateQuick}>Proposer six transformations</button>
              {proposals.length>0&&<button type="button" disabled={loading||dirty} onClick={()=>void persist()}>
                {loading?"Enregistrement…":"Conserver ces transformations"}
              </button>}
            </div>
          </details>
        </div>
        {error&&<div role="alert" className="error-line">{error}</div>}
        <div className="studio-variant-grid">
          <div className="variant-card current-variant">
            <div className="variant-preview"><SlideThumbnail document={document} index={0}/></div>
            <div className="variant-description"><strong>Version actuelle</strong><p>La composition ouverte dans l'éditeur.</p></div>
          </div>
          {candidates.map((candidate,i)=><div key={candidate.id} className="variant-comparison-entry">
            <button className={"variant-card selectable"+(choosing===candidate.id?" selected":"")}
            disabled={Boolean(choosing)||loading} onClick={()=>void choose(candidate)}>
              <div className="variant-preview"><SlideThumbnail document={candidate.document} index={i+1}/></div>
              <div className="variant-description"><strong>{candidate.name}</strong><p>{candidate.description}</p>
                <span>{candidate.stored?"Enregistrée":"Proposition locale"} · {compareOneVariant({name:"Actuelle",document,notes},candidate).indicators.imageCount} image(s) · {compareOneVariant({name:"Actuelle",document,notes},candidate).indicators.warnings} alerte(s)</span>
              </div>
            </button>
            {candidate.stored&&<VariantFeedbackActions token={token} slideId={slideId}
              variantId={candidate.id} selected={document.variantSelection?.activeId===candidate.id}
              preferences={feedback.preferences} onUpdated={feedback.reload} disabled={Boolean(choosing)||loading}/>}
          </div>)}
          {candidates.length===0&&<div className="studio-empty">Les propositions créées par ChatGPT apparaîtront ici. Pour lancer une génération originale, copie la commande ci-dessus dans ta conversation ChatGPT.</div>}
        </div>
        <footer className="studio-variant-footer">
          <span>{choosing?"Enregistrement du choix…":candidates.length+" proposition"+(candidates.length>1?"s":"")+" disponibles"} · Un clic pour choisir</span>
          <button onClick={onClose} disabled={Boolean(choosing)}>Fermer</button>
        </footer>
      </section>
    </div>
  );
}
