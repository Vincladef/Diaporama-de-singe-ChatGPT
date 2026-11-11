import {useEffect,useState,type ChangeEvent} from "react";
import {ReferenceGallery} from "./ReferenceGallery";
import {readCreationInstructions,writeCreationInstructions,uploadCreationReference,
 deleteCreationReference,downloadCreationReference,type CreationReference} from "../lib/api";
import {listPromptItems,savePromptItem,type PromptCategory,type PromptLibraryItem,
 type PromptItemDraft,type PromptStatus} from "../lib/promptLibrary";
import "./promptLibrary.css";

const categories:{id:PromptCategory;name:string;icon:string;desc:string}[]=[
 {id:"socle",name:"Socle général",icon:"◈",desc:"Principes permanents, qualité et contraintes de création."},
 {id:"styles",name:"Styles graphiques",icon:"◉",desc:"Identités visuelles, palettes, typographies et univers."},
 {id:"compositions",name:"Compositions",icon:"▦",desc:"Grilles, mises en page, rythmes et structures."},
 {id:"skills",name:"Skills et méthodes",icon:"⚙",desc:"Procédures adaptées à chaque type de production."},
 {id:"references",name:"Références et évaluations",icon:"▧",desc:"Exemples, contre-exemples, préférences et tests."},
];
const statuses:Record<PromptStatus,string>={
 draft:"À valider",active:"Actif",rejected:"Refusé",disabled:"Désactivé"
};
type View=PromptCategory|"inbox";
function cardPreview(item:PromptLibraryItem,index:number){
 if(item.previewUrl)return <img src={item.previewUrl} alt={"Aperçu de "+item.title} loading="lazy"/>;
 return <div className={"prompt-illustrative swatch-"+(index%4)}>
  <div className="shape"/><div className="hero">{item.title.slice(0,20)}</div>
 </div>;
}
export function CreationInstructionsStudio({token,presentationId,presentationTitle,onClose}:{
 token:string;presentationId?:string;presentationTitle?:string;onClose:()=>void;
}){
 const [view,setView]=useState<View>("socle");
 const [global,setGlobal]=useState("");
 const [local,setLocal]=useState("");
 const [savedGlobal,setSavedGlobal]=useState("");
 const [savedLocal,setSavedLocal]=useState("");
 const [items,setItems]=useState<PromptLibraryItem[]>([]);
 const [editing,setEditing]=useState<PromptItemDraft|null>(null);
 const [references,setReferences]=useState<CreationReference[]>([]);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [uploading,setUploading]=useState(false);
 const [removing,setRemoving]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 useEffect(()=>{
  let active=true;
  setLoading(true);
  void Promise.all([readCreationInstructions(token,presentationId),listPromptItems(token)])
  .then(([data,library])=>{
   if(!active)return;
   setGlobal(data.global);setSavedGlobal(data.global);
   setLocal(data.presentation);setSavedLocal(data.presentation);
   setReferences(data.references??[]);setItems(library);
  }).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));})
  .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[token,presentationId]);
 const dirty=global!==savedGlobal||(!!presentationId&&local!==savedLocal);
 function leave(){
  if((dirty||editing)&&!window.confirm("Quitter sans enregistrer les modifications ?"))return;
  onClose();
 }
 async function saveInstructions(){
  if(saving)return;
  setSaving(true);setError("");setMessage("");
  try{
   if(global!==savedGlobal){await writeCreationInstructions(token,"global",global);setSavedGlobal(global);}
   if(presentationId&&local!==savedLocal){
    await writeCreationInstructions(token,"presentation",local,presentationId);
    setSavedLocal(local);
   }
   setMessage("Instructions enregistrées. ChatGPT retrouve ce socle par le MCP.");
  }catch(e){setError(String(e instanceof Error?e.message:e))}
  finally{setSaving(false)}
 }
 function openItem(item:PromptLibraryItem){if(editing&&!window.confirm("Abandonner cette édition ?"))return;
  setEditing({...item});setMessage("");setError("");
 }
 function addItem(category:PromptCategory){if(editing&&!window.confirm("Abandonner cette édition ?"))return;
  setEditing({category,title:"",description:"",prompt:"",previewUrl:"",status:"draft"});setError("");setMessage("");
 }
 async function persist(item:PromptItemDraft,close=true){
  setSaving(true);setError("");setMessage("");
  try{
   const saved=await savePromptItem(token,item);
   setItems(prev=>[saved,...prev.filter(existing=>existing.id!==saved.id)]);
   setMessage("Fiche enregistrée dans la bibliothèque.");
   if(close)setEditing(null);else setEditing({...saved});
  }catch(e){setError(String(e instanceof Error?e.message:e))}
  finally{setSaving(false)}
 }
 async function changeStatus(item:PromptLibraryItem,status:PromptStatus){
  await persist({...item,status},true);
 }
 async function uploadFiles(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value="";
  if(!files.length)return;
  if(files.length+references.length>8){setError("Huit fichiers au maximum.");return}
  setUploading(true);setError("");
  try{
   for(const file of files){
    if(file.size>4_000_000)throw Error("Limite de 4 Mo par fichier.");
    const ref=await uploadCreationReference(token,file);
    setReferences(list=>[ref,...list]);
   }
   setMessage("Références ajoutées à la bibliothèque.");
  }catch(e){setError(String(e instanceof Error?e.message:e))}
  finally{setUploading(false)}
 }
 async function removeRef(id:string){
  if(!window.confirm("Retirer cette référence ?"))return;
  setRemoving(id);setError("");
  try{await deleteCreationReference(token,id);setReferences(list=>list.filter(r=>r.id!==id))}
  catch(e){setError(String(e instanceof Error?e.message:e))}
  finally{setRemoving(null)}
 }
 const category=categories.find(c=>c.id===view);
 const chosen=view==="inbox"?items.filter(i=>i.status==="draft"):
  items.filter(i=>i.category===view);
 const inboxCount=items.filter(i=>i.status==="draft").length;
 function renderCard(item:PromptLibraryItem,index:number){
  return <article key={item.id} className="prompt-item-card">
   <div className="prompt-item-preview">{cardPreview(item,index)}</div>
   <div className="prompt-item-text"><h3>{item.title}</h3>
    <p>{item.description||"Aucune description."}</p>
   </div>
   <div className="prompt-item-foot">
    <span className={"prompt-status "+item.status}>{statuses[item.status]}</span>
    <button className="prompt-outline" onClick={()=>openItem(item)}>Modifier</button>
    {item.status==="draft"&&<>
     <button className="prompt-primary" disabled={saving} onClick={()=>void changeStatus(item,"active")}>Valider</button>
     <button className="prompt-outline" disabled={saving} onClick={()=>void changeStatus(item,"rejected")}>Refuser</button>
    </>}
    {item.status==="active"&&<button className="prompt-outline" disabled={saving}
      onClick={()=>void changeStatus(item,"disabled")}>Désactiver</button>}
    {(item.status==="rejected"||item.status==="disabled")&&
      <button className="prompt-outline" disabled={saving} onClick={()=>void changeStatus(item,"active")}>Activer</button>}
   </div>
  </article>;
 }
 return <div className="prompt-page">
  <header className="prompt-page-header">
   <div className="prompt-brand"><span className="prompt-brand-mark">◆</span>
    <div><strong>Bibliothèque de Prompt Engineering</strong>
     <small>Diaporama de singe · instructions de création</small></div>
   </div>
   <button className="prompt-back" onClick={leave}>← Retour à {presentationId?"la présentation":"mes présentations"}</button>
  </header>
  <div className="prompt-page-body">
   <aside className="prompt-sidebar" aria-label="Rubriques de la bibliothèque">
    <h2>Bibliothèque</h2>
    {categories.map(c=><button key={c.id} className={"prompt-nav "+(view===c.id?"active":"")}
      onClick={()=>{setView(c.id);setEditing(null);setMessage("");}}>
      <span className="prompt-nav-icon" aria-hidden="true">{c.icon}</span>{c.name}
      <span className="prompt-nav-count">{items.filter(i=>i.category===c.id).length}</span>
    </button>)}
    <hr/>
    <button className={"prompt-nav "+(view==="inbox"?"active":"")}
      onClick={()=>{setView("inbox");setEditing(null);}}>
      <span className="prompt-nav-icon">✉</span>Propositions à valider
      <span className="prompt-nav-count">{inboxCount}</span>
    </button>
   </aside>
   <main className="prompt-content">
    {loading?<div className="prompt-panel">Chargement de la bibliothèque…</div>:<>
     {editing?<div className="prompt-item-editor">
      <div className="prompt-content-head"><div>
       <h1>{editing.id?"Modifier une fiche":"Nouvelle fiche"}</h1>
       <p>Les éléments en attente ne sont pas appliqués tant que tu ne les valides pas.</p>
      </div></div>
      <div className="prompt-panel">
       <div className="prompt-form-field"><label htmlFor="prompt-title">Nom de la fiche</label>
        <input id="prompt-title" maxLength={120} value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/></div>
       <div className="prompt-form-field"><label htmlFor="prompt-category">Dossier</label>
        <select id="prompt-category" value={editing.category} onChange={e=>setEditing({...editing,category:e.target.value as PromptCategory})}>
         {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select></div>
       <div className="prompt-form-field"><label htmlFor="prompt-description">Description</label>
        <input id="prompt-description" maxLength={800} value={editing.description}
         onChange={e=>setEditing({...editing,description:e.target.value})}/></div>
       <div className="prompt-form-field"><label htmlFor="prompt-body">Prompt / Instructions (Markdown)</label>
        <textarea id="prompt-body" maxLength={12000} value={editing.prompt}
         onChange={e=>setEditing({...editing,prompt:e.target.value})}/></div>
       <div className="prompt-form-field"><label htmlFor="prompt-image">URL d'aperçu visuel (facultatif)</label>
        <input id="prompt-image" type="url" maxLength={1500} placeholder="https://…"
         value={editing.previewUrl} onChange={e=>setEditing({...editing,previewUrl:e.target.value})}/></div>
       <div className="prompt-form-field"><label htmlFor="prompt-status">Statut</label>
        <select id="prompt-status" value={editing.status}
         onChange={e=>setEditing({...editing,status:e.target.value as PromptStatus})}>
         {Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select></div>
       <div className="prompt-editor-actions"><button className="prompt-outline" onClick={()=>setEditing(null)}>Annuler</button>
        <button className="prompt-primary" disabled={saving||!editing.title.trim()} onClick={()=>void persist(editing)}>
         {saving?"Enregistrement…":"Enregistrer la fiche"}</button>
       </div>
      </div>
     </div>:<>
      <div className="prompt-content-head">
       <div><h1>{view==="inbox"?"Propositions à valider":category?.name}</h1>
        <p>{view==="inbox"?
         "Examine les nouvelles propositions. Elles restent inactives tant que tu ne les valides pas.":
         category?.desc}</p></div>
       <div className="prompt-toolbar">
        {view!=="inbox"&&<button className="prompt-primary" onClick={()=>addItem(view)}>+ Nouvelle fiche</button>}
       </div>
      </div>
      {view==="socle"&&<div className="prompt-panel">
       <h2>Instructions globales actives</h2>
       <p>Le socle actuel est conservé intégralement. Les autres dossiers accueillent des fiches indépendantes.</p>
       <textarea className="prompt-editor-large" aria-label="Instructions globales"
        value={global} onChange={e=>setGlobal(e.target.value)} spellCheck={false}/>
       <div className="prompt-editor-actions">
        <span className="prompt-note">{global.length.toLocaleString("fr-FR")} caractères</span>
        <button className="prompt-primary" disabled={saving||!dirty} onClick={()=>void saveInstructions()}>
         {saving?"Enregistrement…":"Enregistrer le socle"}</button>
       </div>
       {presentationId&&<div style={{marginTop:22}}>
        <h2>Instructions propres à cette présentation</h2>
        <p>{presentationTitle||"Présentation actuelle"} ; prioritaires en cas de contradiction.</p>
        <textarea className="prompt-editor-large" style={{minHeight:140}} value={local}
         onChange={e=>setLocal(e.target.value)} aria-label="Instructions locales"/>
        <div className="prompt-editor-actions"><button className="prompt-primary" disabled={saving||!dirty}
          onClick={()=>void saveInstructions()}>Enregistrer les instructions</button></div>
       </div>}
      </div>}
      {view==="references"&&<div className="prompt-panel">
       <h2>Documents et exemples visuels</h2>
       <p>Références déjà jointes aux instructions de création. Elles restent accessibles à ChatGPT.</p>
       <div className="creation-reference-list">
        {references.map(ref=><div className="creation-reference-entry" key={ref.id}>
         <div className="creation-reference-item">
          <button className="creation-reference-name" onClick={()=>void downloadCreationReference(token,ref)}>
           {ref.filename}<small>{(ref.sizeBytes/1e6).toFixed(2)} Mo</small></button>
          <button className="creation-reference-remove" aria-label={"Supprimer "+ref.filename}
           disabled={removing===ref.id} onClick={()=>void removeRef(ref.id)}>×</button>
         </div>
         <ReferenceGallery token={token} reference={ref}/>
        </div>)}
       </div>
       <label className="creation-reference-upload">{uploading?"Envoi…":"+ Joindre une référence"}
        <input type="file" multiple accept=".pptx,.pdf,.png,.jpg,.jpeg,.webp,.html,.htm,.json"
         disabled={uploading||references.length>=8} onChange={e=>void uploadFiles(e)}/>
       </label>
       <p className="prompt-note">8 fichiers maximum, 4 Mo par fichier.</p>
      </div>}
      {chosen.length?
       <div className="prompt-card-grid">{chosen.map(renderCard)}</div>:
       <div className="prompt-empty"><strong>{view==="inbox"?"Aucune proposition en attente":"Aucune fiche dans ce dossier"}</strong>
       {view==="inbox"?"Les propositions apparaîtront ici avant leur activation.":
        "Ajoute une fiche de prompt pour commencer à composer cette bibliothèque."}</div>}
      <p className="prompt-note" style={{marginTop:25}}>
       Les aperçus géométriques sans image jointe sont illustratifs ; ils ne sont pas des rendus générés par l'IA.
      </p>
     </>}
    </>}
    {error&&<p role="alert" className="prompt-message error">{error}</p>}
    {message&&<p role="status" className="prompt-message success">{message}</p>}
   </main>
  </div>
 </div>;
}
