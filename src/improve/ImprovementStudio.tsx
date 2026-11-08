import { useMemo,useState } from "react";
import type { PresentationDetail } from "../lib/api";
import { proposeGraphicVariants } from "../variants/propose";
import { SlideThumbnail } from "../editor/SlideThumbnail";
import { submitImport } from "../import/submit";
import type { ImportedDeck } from "../import/parse";

type Props={token:string;detail:PresentationDetail;onClose:()=>void;onCreated:(id:string)=>Promise<void>|void};
const labels=["Immersion photographique","Éditorial","Typographie manifeste"];
export function ImprovementStudio({token,detail,onClose,onCreated}:Props){
  const [source]=useState(()=>structuredClone(detail));
  const [choice,setChoice]=useState(1);
  const [selectedSlide,setSelectedSlide]=useState(0);
  const [brief,setBrief]=useState("Améliore la mise en page, la hiérarchie typographique et l'usage des photographies. Préserve intégralement le sens, les citations, les données et les notes. Propose des styles distincts, sans modèle graphique répétitif.");
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[progress,setProgress]=useState("");
  const [done,setDone]=useState<string|null>(null);
  const selected=source.slides[selectedSlide];
  const proposals=useMemo(()=>source.slides.map(s=>proposeGraphicVariants(s.document)),[source.slides]);
  const candidate=proposals[selectedSlide]?.[choice];
  const prompt=useMemo(()=>[
    "Travaille UNIQUEMENT sur Diaporama de singe ChatGPT, présentation "+source.presentation.id+".",
    "Commence avec get_presentation en mode outline ; récupère les diapositives utiles via get_slide.",
    "Objectif : "+brief,
    "Respecte tous les contenus intellectuels et citations, ainsi que les notes. Ne modifie pas la version Codex.",
    "La liberté HTML/CSS est essentielle. Favorise de grandes images, des titres marquants, peu de texte visible, de la variété entre les diapositives.",
    "Crée au moins trois variantes originales sur des diapositives représentatives via create_variants ; fais ensuite les améliorations validées avec edit_slides.",
    "Pour les animations pédagogiques, utilise add_reveal_sequence et vérifie le plan avec get_animation_plan.",
    "Ne fais jamais une opération destructive sans expliciter les modifications et respecter les révisions.",
  ].join("\n"),[brief,source.presentation.id]);
  async function copy(){
    try{await navigator.clipboard.writeText(prompt);setError("");}
    catch{setError("Copie impossible. Utilisez la sélection manuelle de la consigne.");}
  }
  async function generate(){
    if(busy)return;
    setBusy(true);setError("");
    const title=(source.presentation.title+" · Variante "+labels[choice]).slice(0,180);
    try{
      const deck:ImportedDeck={kind:"json",sourceFileName:"copie de "+source.presentation.title,title,
        warnings:[],slides:source.slides.map((s,i)=>({
          document:proposals[i]![choice]!.document,notes:s.notes,
        }))};
      const result=await submitImport(token,deck,deck.slides.map((_,i)=>i),title,
        (n,total)=>setProgress(n+" / "+total+" diapositives"));
      setDone(result.id);setProgress("");
      await onCreated(result.id);
    }catch(e){setError(e instanceof Error?e.message:"Création impossible.");}
    finally{setBusy(false);}
  }
  return <div className="studio-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <section className="studio-dialog improve-dialog" role="dialog" aria-modal="true" aria-label="Améliorer une présentation">
      <header className="studio-header"><div><strong>Améliorer la présentation</strong>
        <span>{source.presentation.title} · Comparer des compositions sans perdre le contenu</span></div>
        <button className="studio-close" disabled={busy} onClick={onClose} aria-label="Fermer l'amélioration">×</button></header>
      <div className="improve-workspace">
        <section className="improve-directions"><h3>Direction graphique</h3>
          <p>Les trois aperçus sont produits automatiquement, sans service IA payant.</p>
          <div className="improve-direction-buttons">{labels.map((v,i)=>
            <button key={i} className={choice===i?"selected":""} onClick={()=>setChoice(i)}>{v}</button>)}</div>
          <label>Diapositive à comparer
            <select value={selectedSlide} onChange={e=>setSelectedSlide(Number(e.target.value))}>
              {source.slides.map((s,i)=><option key={s.id} value={i}>
                {i+1}. {(s.document.elements.find(e=>e.type==="text")?.text??"Diapositive").slice(0,45)}
              </option>)}
            </select>
          </label>
          <div className="improve-compare-grid">
            {selected&&<div><strong>Original</strong><SlideThumbnail document={selected.document} index={selectedSlide+1}/></div>}
            {candidate&&<div><strong>Nouvelle direction</strong><SlideThumbnail document={candidate.document} index={selectedSlide+1}/></div>}
          </div>
          <p className="improve-preservation">Le moteur conserve les textes, les images, le HTML et les notes. Une nouvelle présentation est créée ; l'original reste intact.</p>
          <button className="primary" onClick={()=>void generate()} disabled={busy||!!done}>
            {busy?progress||"Création…":done?"Nouvelle version enregistrée":"Créer une copie avec cette direction"}</button>
          {done&&<p className="improve-done">La nouvelle version est disponible dans l'éditeur et via MCP.</p>}
        </section>
        <section className="improve-ai"><h3>Amélioration créative par ChatGPT</h3>
          <p>Cette voie permet une intervention plus libre : photographies, mises en page originales, diagrammes et variantes sur plusieurs diapositives.</p>
          <label>Brief graphique
            <textarea rows={7} value={brief} onChange={e=>setBrief(e.target.value)}/>
          </label>
          <button className="subtle-btn" onClick={()=>void copy()}>Copier la consigne MCP pour ChatGPT</button>
          <details><summary>Afficher la consigne</summary>
            <pre className="improve-prompt">{prompt}</pre></details>
          <small>Pour piloter directement l'application, ChatGPT doit disposer d'une connexion autorisée à son serveur MCP. Aucun changement n'est envoyé à ChatGPT automatiquement depuis cette fenêtre.</small>
        </section>
      </div>
      {error&&<div role="alert" className="error-line">{error}</div>}
      <footer className="import-footer"><span>Édition non destructive · Version ChatGPT uniquement</span>
        <button className="subtle-btn" onClick={onClose} disabled={busy}>Fermer</button></footer>
    </section>
  </div>;
}
