import { useEffect,useMemo,useState } from "react";
import { importFile,type ImportedDeck } from "./parse";
import { createImportMediaBudget,optimizeImportedImage } from "./media";
import { submitImport } from "./submit";
import { SlideThumbnail } from "../editor/SlideThumbnail";

type Props={token:string;onClose:()=>void;onCreated:(id:string)=>Promise<void>|void};
export function ImportStudio({token,onClose,onCreated}:Props){
  const [source,setSource]=useState<File|null>(null);
  const [htmlMode,setHtmlMode]=useState<"web"|"convert">("web");
  const [deck,setDeck]=useState<ImportedDeck|null>(null);
  const [title,setTitle]=useState("");
  const [selected,setSelected]=useState<number[]>([]);
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState(""),[error,setError]=useState("");
  const [done,setDone]=useState<{id:string;created:number}|null>(null);
  const [instructions,setInstructions]=useState("Conserver toutes les idées, images et notes. Améliorer la clarté visuelle et la hiérarchie, sans modèles répétitifs.");
  const prompt=useMemo(()=>done?[
    "Améliore la présentation "+done.id+" dans le projet Diaporama de singe ChatGPT.",
    "Utilise uniquement son serveur MCP. Commence par get_presentation en mode outline et lis ensuite les diapositives nécessaires.",
    "Consignes : "+instructions.trim(),
    "Conserve le sens, les chiffres, les citations et les notes. Ne change pas le contenu intellectuel.",
    "Propose plusieurs compositions réellement différentes et améliore la forme avec le HTML/CSS libre.",
    "Ne touche pas à la version Codex. Utilise edit_slides avec le contrôle des révisions.",
  ].join("\n"):"",[done,instructions]);
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!busy)onClose();};
    window.addEventListener("keydown",key);
    return()=>window.removeEventListener("keydown",key);
  },[busy,onClose]);
  async function choose(file:File,mode: "web"|"convert" = htmlMode){
    if(!/\.(pptx|json|html?|zip)$/i.test(file.name)){setError("Choisissez un fichier PPTX, JSON, HTML ou ZIP.");return;}
    if(file.size>45_000_000){setError("Fichier trop volumineux (limite : 45 Mo).");return;}
    setSource(file);setDeck(null);setDone(null);setBusy(true);setError("");setProgress("Analyse du document…");
    try{
      const budget=createImportMediaBudget();
      const result=await importFile(file,(data,mime,path)=>optimizeImportedImage(data,mime,path,budget),{htmlMode:mode});
      setDeck(result);setTitle(result.title.slice(0,180));setSelected(result.slides.map((_,i)=>i));
    }catch(e){setError(e instanceof Error?e.message:"Import impossible.");}
    finally{setBusy(false);setProgress("");}
  }
  async function create(){
    if(!deck)return;
    setBusy(true);setError("");setProgress("Enregistrement…");
    try{
      const result=await submitImport(token,deck,selected,title,(count,total)=>setProgress(count+" / "+total+" diapositives enregistrées"));
      setDone(result);setProgress("");await onCreated(result.id);
    }catch(e){setError(e instanceof Error?e.message:"Enregistrement impossible.");}
    finally{setBusy(false);}
  }
  function toggle(i:number){setSelected(a=>a.includes(i)?a.filter(x=>x!==i):[...a,i].sort((x,y)=>x-y));}
  return <div className="studio-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <section className="studio-dialog import-dialog" role="dialog" aria-modal="true" aria-label="Importer une présentation">
      <header className="studio-header"><div><strong>Importer et améliorer</strong>
        <span>PowerPoint · JSON · HTML/CSS interactif · archive ZIP avec images et scripts</span></div>
        <button className="studio-close" disabled={busy} onClick={onClose} aria-label="Fermer l'import">×</button></header>
      {!done?<><div className="import-intro">
        <label className="import-file-drop" onDragOver={e=>e.preventDefault()}
          onDrop={e=>{e.preventDefault();const file=e.dataTransfer.files[0];if(file)void choose(file);}}>
          <span className="import-file-icon">⇧</span><strong>{source?.name||"Déposer un diaporama ou choisir un fichier"}</strong>
          <small>Aucun document n'est envoyé à Neon avant votre validation.</small>
          <input type="file" accept=".pptx,.json,.html,.htm,.zip" disabled={busy}
            onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void choose(file);}}/>
        </label>
        {source && /\.(html?|zip)$/i.test(source.name) && <div className="import-google-note">
          <strong>Import HTML/CSS</strong>
          <label htmlFor="import-html-mode">Mode d'importation</label>
          <select id="import-html-mode" value={htmlMode} disabled={busy}
            onChange={e=>{
              const mode=e.target.value as "web"|"convert";
              setHtmlMode(mode);void choose(source,mode);
            }}>
            <option value="web">Présenter tel quel : mise en page et JavaScript conservés</option>
            <option value="convert">Convertir les sections HTML en diapositives modifiables</option>
          </select>
          <small>{htmlMode==="web"
            ?"Projection du site interactif dans une iframe isolée ; l'aperçu de l'éditeur reste statique."
            :"Les sections data-slide deviennent des diapositives ; scripts supprimés."}</small>
        </div>}
        {(!source || !/\.(html?|zip)$/i.test(source.name)) && <div className="import-google-note"><strong>Depuis Google Slides</strong>
          <span>Fichier → Télécharger → Microsoft PowerPoint (.pptx), puis importer le fichier ici.</span>
          <a href="https://slides.google.com/" target="_blank" rel="noopener noreferrer">Ouvrir Google Slides ↗</a>
        </div>}
      </div>
      {progress&&<div className="import-status" role="status">{progress}</div>}
      {error&&<div className="error-line" role="alert">{error}</div>}
      {deck&&<div className="import-preview">
        <div className="import-preview-head">
          <label>Titre de la nouvelle présentation<input aria-label="Titre de la présentation importée" value={title}
            maxLength={180} onChange={e=>setTitle(e.target.value)} disabled={busy}/></label>
          <div><strong>{selected.length} / {deck.slides.length} diapositives</strong>
            <small>Une copie indépendante sera créée. L'original reste intact.</small></div>
        </div>
        {deck.warnings.length>0&&<details className="import-warnings" open>
          <summary>Informations de compatibilité ({deck.warnings.length})</summary>
          <ul>{deck.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>
        </details>}
        <div className="import-choice-toolbar">
          <button disabled={busy} onClick={()=>setSelected(deck.slides.map((_,i)=>i))}>Tout sélectionner</button>
          <button disabled={busy} onClick={()=>setSelected([])}>Tout désélectionner</button>
          <span>Choisissez les diapositives à conserver.</span>
        </div>
        <div className="import-slide-grid">{deck.slides.map((slide,i)=>
          <label key={i} className={"import-slide-card"+(selected.includes(i)?" active":"")}>
            <div className="import-slide-thumb"><SlideThumbnail document={slide.document} index={i+1}/></div>
            <span className="import-slide-label"><input type="checkbox" checked={selected.includes(i)}
              onChange={()=>toggle(i)} disabled={busy}/>{i+1}. {slide.sourceTitle||"Diapositive "+(i+1)}</span>
            <small>{slide.document.elements.length} objets · {slide.notes?"Notes préservées":"Sans notes"}</small>
          </label>)}</div>
      </div>}
      <footer className="import-footer">
        <span>{deck?"Une copie indépendante sera enregistrée dans Neon ChatGPT.":"HTML seul ou ZIP avec index.html et ressources locales ; aucune archive n'est publiée avant validation."}</span>
        <button className="subtle-btn" onClick={onClose} disabled={busy}>Annuler</button>
        <button className="primary" onClick={()=>void create()} disabled={busy||!deck||!selected.length||!title.trim()}>
          {busy?"Importation…":"Importer "+selected.length+" diapositive"+(selected.length>1?"s":"")}</button>
      </footer></>:<div className="import-done">
        <div className="import-complete-symbol">✓</div><h2>{done.created} diapositives importées</h2>
        <p>La copie est dans Neon et accessible dans l'éditeur ainsi que dans le MCP.</p>
        <label>Consignes pour ChatGPT<textarea rows={3} value={instructions} onChange={e=>setInstructions(e.target.value)}/></label>
        <p>Tu peux maintenant demander à ChatGPT d'améliorer la forme ; il doit être connecté au MCP de cette version.</p>
        <div className="import-finish-actions">
          <button className="primary" onClick={()=>void navigator.clipboard.writeText(prompt).catch(()=>setError("Impossible de copier automatiquement."))}>Copier la consigne ChatGPT</button>
          <button className="subtle-btn" onClick={onClose}>Retour à l'éditeur</button>
        </div>{error&&<div role="alert" className="error-line">{error}</div>}
      </div>}
    </section>
  </div>;
}
