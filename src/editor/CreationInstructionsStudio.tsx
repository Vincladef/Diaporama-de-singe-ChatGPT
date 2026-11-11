import {useEffect,useState,type ChangeEvent} from "react";
import {ReferenceGallery} from "./ReferenceGallery";
import {readCreationInstructions,writeCreationInstructions,uploadCreationReference,
 deleteCreationReference,downloadCreationReference,type CreationReference} from "../lib/api";
import {listPromptItems,savePromptItem,deletePromptItem,type PromptCategory,
 type PromptLibraryItem,type PromptItemDraft} from "../lib/promptLibrary";
import {listPromptFeedback,savePromptFeedback,type FeedbackEntry,type FeedbackCategory,
 type FeedbackKind,type FeedbackDraft} from "../lib/promptFeedback";
import {ExampleImage,PromptExampleGallery} from "./PromptExampleGallery";
import "./promptLibrary.css";

const sections:{id:PromptCategory;name:string;icon:string;description:string}[]=[
 {id:"socle",name:"Socle général",icon:"◈",description:"Les règles permanentes que l'agent doit respecter."},
 {id:"styles",name:"Styles graphiques",icon:"◉",description:"Des univers graphiques dans lesquels l'agent peut puiser : couleurs, typographie, matières et atmosphère."},
 {id:"compositions",name:"Compositions",icon:"▦",description:"Des manières d'organiser les éléments : emplacement, taille, rythme, hiérarchie et relations."},
 {id:"skills",name:"Skills et méthodes",icon:"⚙",description:"Les procédures que suit l'agent pour travailler ; distinctes de la mise en page."},
 {id:"references",name:"Références et évaluations",icon:"▧",description:"Images, captures d'écran et présentations utilisées comme exemples de forme."}
];
type Section=PromptCategory|"journal";
const feedbackTypes:{value:FeedbackCategory;label:string}[]=[
 {value:"style",label:"Styles graphiques"},
 {value:"composition",label:"Compositions"},
 {value:"typography",label:"Typographie"},
 {value:"images",label:"Images et références"},
 {value:"diagram",label:"Schémas et graphiques"},
 {value:"content",label:"Contenu et rédaction"},
 {value:"animation",label:"Animations"},
 {value:"ergonomics",label:"Ergonomie et lisibilité"},
 {value:"technical",label:"Technique et export"},
 {value:"other",label:"Autre"}
];
const feedbackKinds:{value:FeedbackKind;label:string}[]=[
 {value:"positive",label:"Point positif"},
 {value:"issue",label:"À améliorer"},
 {value:"idea",label:"Idée"},
 {value:"observation",label:"Observation"},
 {value:"choice",label:"Choix de variante"}
];
const typeLabel=(value:FeedbackCategory)=>feedbackTypes.find(c=>c.value===value)?.label??"Autre";
const kindLabel=(value:FeedbackKind)=>feedbackKinds.find(c=>c.value===value)?.label??"Observation";
function TrashIcon(){return <svg width="15" height="15" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round"
  strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/></svg>}
const labelByCategory:Record<PromptCategory,string>={
 socle:"Instruction",styles:"Style",compositions:"Composition",skills:"Méthode",references:"Référence"
};
function ImageThumb({token,reference}:{token:string;reference:CreationReference}){
 const [url,setUrl]=useState("");
 const [failed,setFailed]=useState(false);
 useEffect(()=>{
  let alive=true,objectUrl="";
  setUrl("");setFailed(false);
  const run=async()=>{
   try{
    const requestUrl=new URL("/.netlify/functions/workspace",window.location.origin);
    requestUrl.searchParams.set("op","creationReferenceFile");
    requestUrl.searchParams.set("id",reference.id);
    const response=await fetch(requestUrl,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    if(!response.ok)throw Error("image_unavailable");
    const bytes=await response.arrayBuffer();
    if(!alive)return;
    objectUrl=URL.createObjectURL(new Blob([bytes],{type:reference.mimeType}));
    setUrl(objectUrl);
   }catch{if(alive)setFailed(true);}
  };
  void run();
  return()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[reference.id,reference.mimeType,token]);
 if(failed)return <div className="prompt-image-pending">Aperçu indisponible</div>;
 return url?<img className="prompt-reference-image" src={url} alt={"Image de référence : "+reference.filename}/>:
  <div className="prompt-image-pending">Chargement de l'image…</div>;
}
export function CreationInstructionsStudio({token,presentationId,presentationTitle,onClose}:{
 token:string;presentationId?:string;presentationTitle?:string;onClose:()=>void;
}){
 const [view,setView]=useState<Section>("socle");
 const [global,setGlobal]=useState("");
 const [local,setLocal]=useState("");
 const [savedGlobal,setSavedGlobal]=useState("");
 const [savedLocal,setSavedLocal]=useState("");
 const [items,setItems]=useState<PromptLibraryItem[]>([]);
 const [editing,setEditing]=useState<PromptItemDraft|null>(null);
 const [viewer,setViewer]=useState<{title:string;urls:string[];index:number}|null>(null);
 const [methodDrafts,setMethodDrafts]=useState<Record<string,string>>({});
 const [references,setReferences]=useState<CreationReference[]>([]);
 const [feedback,setFeedback]=useState<FeedbackEntry[]>([]);
 const [feedbackLoading,setFeedbackLoading]=useState(false);
 const [feedbackError,setFeedbackError]=useState("");
 const [feedbackFormOpen,setFeedbackFormOpen]=useState(false);
 const [feedbackDraft,setFeedbackDraft]=useState<FeedbackDraft>({
   category:"composition",kind:"observation",content:""
 });
 const [feedbackTypeFilter,setFeedbackTypeFilter]=useState<FeedbackCategory|"all">("all");
 const [feedbackKindFilter,setFeedbackKindFilter]=useState<FeedbackKind|"all">("all");
 const [feedbackOrder,setFeedbackOrder]=useState<"newest"|"oldest">("newest");
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [uploading,setUploading]=useState(false);
 const [removing,setRemoving]=useState<string|null>(null);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 useEffect(()=>{
  let alive=true;
  setLoading(true);setError("");
  void Promise.all([readCreationInstructions(token,presentationId),listPromptItems(token)])
   .then(([data,library])=>{
    if(!alive)return;
    setGlobal(data.global);setSavedGlobal(data.global);
    setLocal(data.presentation);setSavedLocal(data.presentation);
    setReferences(data.references??[]);
    setItems(library.filter(i=>i.status==="active"||i.status==="draft"));
   }).catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e));})
   .finally(()=>{if(alive)setLoading(false)});
  return()=>{alive=false};
 },[token,presentationId]);
 useEffect(()=>{
  if(!viewer)return;
  const handler=(event:KeyboardEvent)=>{
   if(event.key==="Escape")setViewer(null);
   if(event.key==="ArrowRight")setViewer(prev=>prev?{...prev,index:(prev.index+1)%prev.urls.length}:prev);
   if(event.key==="ArrowLeft")setViewer(prev=>prev?{...prev,index:(prev.index+prev.urls.length-1)%prev.urls.length}:prev);
  };
  window.addEventListener("keydown",handler);
  return()=>window.removeEventListener("keydown",handler);
 },[viewer]);
 useEffect(()=>{
  if(view!=="journal")return;
  let active=true;setFeedbackLoading(true);setFeedbackError("");
  void listPromptFeedback(token).then(entries=>{if(active)setFeedback(entries)})
   .catch(e=>{if(active)setFeedbackError(e instanceof Error?e.message:String(e))})
   .finally(()=>{if(active)setFeedbackLoading(false)});
  return()=>{active=false};
 },[view,token]);
 const dirty=global!==savedGlobal||(!!presentationId&&local!==savedLocal);
 const methods=items.filter(i=>i.category==="skills");
 function leave(){
  const editedMethod=methods.some(i=>methodDrafts[i.id]!==undefined&&methodDrafts[i.id]!==i.prompt);
  if((dirty||editing||editedMethod)&&!window.confirm("Quitter sans enregistrer les modifications ?"))return;
  onClose();
 }
 async function saveInstructions(){
  if(saving)return;
  setSaving(true);setError("");setMessage("");
  try{
   if(global!==savedGlobal){await writeCreationInstructions(token,"global",global);setSavedGlobal(global);}
   if(presentationId&&local!==savedLocal){await writeCreationInstructions(token,"presentation",local,presentationId);setSavedLocal(local);}
   setMessage("Instructions enregistrées.");
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setSaving(false)}
 }
 function addItem(category:PromptCategory){
  setEditing({category,title:"",description:"",prompt:"",previewUrl:"",exampleImages:[],status:"active"});
  setMessage("");setError("");
 }
 function openItem(item:PromptLibraryItem){
  setEditing({...item,status:"active"});setMessage("");setError("");
 }
 async function persist(item:PromptItemDraft){
  setSaving(true);setError("");setMessage("");
  try{
   const images=(item.exampleImages??[]).map(url=>url.trim()).filter(Boolean);
   const saved=await savePromptItem(token,{...item,exampleImages:images,previewUrl:images[0]??"",status:"active"});
   setItems(list=>[saved,...list.filter(i=>i.id!==saved.id)]);
   setEditing(null);setMessage(labelByCategory[saved.category]+" enregistré(e).");
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setSaving(false)}
 }
 async function persistMethod(item:PromptLibraryItem){
  const text=methodDrafts[item.id]??item.prompt;
  setSaving(true);setError("");setMessage("");
  try{
   const saved=await savePromptItem(token,{...item,prompt:text,status:"active"});
   setItems(list=>list.map(i=>i.id===saved.id?saved:i));
   setMethodDrafts(map=>{const next={...map};delete next[item.id];return next;});
   setMessage("Méthode enregistrée.");
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setSaving(false)}
 }
 async function removeItem(item:PromptItemDraft){
  if(!item.id||!item.version||!window.confirm("Supprimer définitivement « "+item.title+" » de la bibliothèque ?"))return;
  setSaving(true);setError("");
  try{
   await deletePromptItem(token,item.id,item.version);
   setItems(list=>list.filter(i=>i.id!==item.id));setEditing(null);
   setMethodDrafts(d=>{const next={...d};delete next[item.id!];return next;});
   setMessage("Fiche supprimée.");
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setSaving(false)}
 }
 async function submitFeedback(){
  if(saving||!feedbackDraft.content.trim())return;
  setSaving(true);setFeedbackError("");setMessage("");
  try{
   const item=await savePromptFeedback(token,{...feedbackDraft,content:feedbackDraft.content.trim()});
   setFeedback(items=>[item,...items]);
   setFeedbackDraft({category:"composition",kind:"observation",content:""});
   setFeedbackFormOpen(false);setMessage("Feedback ajouté au journal.");
  }catch(e){setFeedbackError(e instanceof Error?e.message:String(e))}
  finally{setSaving(false)}
 }
 async function uploadFiles(event:ChangeEvent<HTMLInputElement>){
  const files=Array.from(event.currentTarget.files??[]);event.currentTarget.value="";
  if(!files.length)return;
  if(files.length+references.length>24){setError("Limite de 24 références ; supprime une ancienne pièce jointe avant d'en ajouter.");return;}
  setUploading(true);setError("");setMessage("");
  try{
   for(const file of files){
    if(file.size>4_000_000)throw Error("Le fichier "+file.name+" dépasse 4 Mo.");
    const ref=await uploadCreationReference(token,file);
    setReferences(list=>[ref,...list]);
   }
   setMessage("Images ou documents enregistrés dans les références.");
  }catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setUploading(false)}
 }
 async function removeRef(id:string){
  if(!window.confirm("Supprimer cette référence ?"))return;
  setRemoving(id);setError("");
  try{await deleteCreationReference(token,id);setReferences(list=>list.filter(r=>r.id!==id));}
  catch(e){setError(e instanceof Error?e.message:String(e))}
  finally{setRemoving(null)}
 }
 const info=sections.find(s=>s.id===view);
 const filteredFeedback=feedback.filter(entry=>
  (feedbackTypeFilter==="all"||entry.category===feedbackTypeFilter)&&
  (feedbackKindFilter==="all"||entry.kind===feedbackKindFilter))
  .sort((a,b)=>(feedbackOrder==="newest"?-1:1)*
    (new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime()));
 const feedbackGroups:{day:string;items:FeedbackEntry[]}[]=[];
 for(const entry of filteredFeedback){
  const day=new Date(entry.createdAt).toLocaleDateString("fr-FR",{
   weekday:"long",day:"numeric",month:"long",year:"numeric"
  });
  const previous=feedbackGroups[feedbackGroups.length-1];
  if(previous?.day===day)previous.items.push(entry);
  else feedbackGroups.push({day,items:[entry]});
 }
 const selected=items.filter(i=>i.category===view);
 const renderMethods=()=> <section className="prompt-panel prompt-method-panel" aria-label="Skills et méthodes">
  <div className="prompt-subhead">
   <div><h2>Skills et méthodes</h2>
    <p>Comment l'agent doit procéder, par exemple pour produire un schéma ou vérifier un rendu. À la différence des compositions, il s'agit d'étapes de travail.</p>
   </div>
   <button className="prompt-outline" onClick={()=>addItem("skills")}>+ Ajouter une méthode</button>
  </div>
  {methods.length?methods.map(item=><div key={item.id} className="prompt-method-entry">
   <div className="prompt-method-head"><div><h3>{item.title}</h3>
    <p>{item.description}</p></div>
    <div className="prompt-method-controls">
     <button className="prompt-text-action" onClick={()=>openItem(item)}>Détails</button>
     <button type="button" className="prompt-trash" disabled={saving}
      title={"Supprimer : "+item.title} aria-label={"Supprimer la méthode "+item.title}
      onClick={()=>void removeItem(item)}><TrashIcon/></button>
    </div></div>
   <textarea aria-label={"Instructions de la méthode "+item.title} value={methodDrafts[item.id]??item.prompt}
    onChange={e=>setMethodDrafts(d=>({...d,[item.id]:e.target.value}))}
    spellCheck={false} rows={6}/>
   <div className="prompt-editor-actions">
    <button className="prompt-outline" disabled={saving||(methodDrafts[item.id]??item.prompt)===item.prompt}
     onClick={()=>void persistMethod(item)}>Enregistrer</button>
   </div>
  </div>):<div className="prompt-empty"><strong>Aucune méthode</strong>
   <p>Les procédures de travail peuvent être ajoutées ici sous forme de texte.</p>
   <button className="prompt-primary" onClick={()=>addItem("skills")}>+ Ajouter une méthode</button>
  </div>}
 </section>;
 function renderCard(item:PromptLibraryItem){
  const images=item.exampleImages?.length?item.exampleImages:(item.previewUrl?[item.previewUrl]:[]);
  return <article className="prompt-item-card" key={item.id}>
   <button type="button" className="prompt-trash prompt-card-trash" disabled={saving}
    title={"Supprimer : "+item.title}
    aria-label={"Supprimer "+(item.category==="styles"?"le style ":"la composition ")+item.title}
    onClick={()=>void removeItem(item)}><TrashIcon/></button>
   <PromptExampleGallery title={item.title} urls={images}
    onOpen={(urls,index)=>setViewer({title:item.title,urls,index})}/>
   <div className="prompt-item-text">
    <div className="prompt-card-eyebrow">{labelByCategory[item.category]}</div>
    <h3>{item.title}</h3>
    <p>{item.description}</p>
   </div>
   <div className="prompt-item-foot">
    <button className="prompt-outline" onClick={()=>openItem(item)}>Voir et modifier</button>
   </div>
  </article>;
 }
 return <div className="prompt-page">
  <header className="prompt-page-header">
   <button className="prompt-brand prompt-brand-button" title="Retour à Diaporama de singe" onClick={leave}>
    <span className="prompt-brand-mark">◆</span><strong>Diaporama de singe</strong></button>
   <span className="prompt-header-location">Instructions de création</span>
   <button className="prompt-close" aria-label="Fermer les instructions" onClick={leave}>✕</button>
  </header>
  <div className="prompt-page-body">
   <aside className="prompt-sidebar" aria-label="Sections des instructions">
    <h2>Instructions de création</h2>
    {sections.map(s=><button key={s.id}
     className={"prompt-nav "+(view===s.id?"active":"")}
     onClick={()=>{if(editing&&!window.confirm("Abandonner la fiche en cours ?"))return;
      setEditing(null);setView(s.id);setMessage("");}}>
     <span className="prompt-nav-icon">{s.icon}</span>{s.name}
    </button>)}
    <hr/>
    <button className={"prompt-nav "+(view==="journal"?"active":"")}
     onClick={()=>{if(editing&&!window.confirm("Abandonner la fiche en cours ?"))return;
      setEditing(null);setView("journal");setMessage("");}}>
     <span className="prompt-nav-icon">◷</span>Journal des feedbacks
    </button>
   </aside>
   <main className="prompt-content">
    {loading?<div className="prompt-panel">Chargement des instructions…</div>:editing?
     <div className="prompt-item-editor">
      <div className="prompt-content-head"><div><h1>{editing.id?"Modifier "+labelByCategory[editing.category].toLowerCase():"Ajouter "+(editing.category==="styles"?"un style":editing.category==="compositions"?"une composition":"une méthode")}</h1>
       <p>Cette fiche fera partie des ressources disponibles pour les futures créations.</p></div></div>
      <div className="prompt-panel">
       <div className="prompt-form-field"><label htmlFor="prompt-title">Nom</label>
        <input id="prompt-title" maxLength={120} value={editing.title}
         onChange={e=>setEditing({...editing,title:e.target.value})}/></div>
       <div className="prompt-form-field"><label htmlFor="prompt-category">Rubrique</label>
        <select id="prompt-category" value={editing.category}
         onChange={e=>setEditing({...editing,category:e.target.value as PromptCategory})}>
         {sections.filter(s=>s.id!=="socle").map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select></div>
       <div className="prompt-form-field"><label htmlFor="prompt-description">Description pour la bibliothèque</label>
        <textarea id="prompt-description" maxLength={800} rows={4} value={editing.description}
         onChange={e=>setEditing({...editing,description:e.target.value})}/></div>
       <div className="prompt-form-field"><label htmlFor="prompt-body">Instructions complètes (Markdown)</label>
        <textarea id="prompt-body" maxLength={12000} rows={10} value={editing.prompt}
         onChange={e=>setEditing({...editing,prompt:e.target.value})} spellCheck={false}/></div>
       {(editing.category==="styles"||editing.category==="compositions"||editing.category==="references")&&
        <div className="prompt-form-field prompt-image-fields">
         <label>Galerie d’exemples visuels</label>
         <p>Colle plusieurs URL d’images, dans l’ordre souhaité. La première servira d’illustration principale. Tu peux aussi utiliser les exemples SVG de l’application.</p>
         {(editing.exampleImages??[]).map((url,i)=><div className="prompt-image-url-row" key={i}>
          <label htmlFor={"prompt-example-"+i}>Image {i+1}</label>
          <input id={"prompt-example-"+i} type="text" maxLength={1500}
           placeholder="https://exemple.fr/image.jpg"
           value={url}
           onChange={e=>{
            const next=[...(editing.exampleImages??[])];next[i]=e.target.value;
            setEditing({...editing,exampleImages:next});
           }}/>
          <button className="prompt-outline" title={"Retirer l'image "+(i+1)}
           aria-label={"Retirer l’image "+(i+1)}
           onClick={()=>{
            const next=(editing.exampleImages??[]).filter((_,index)=>index!==i);
            setEditing({...editing,exampleImages:next});
           }}>✕</button>
         </div>)}
         <button className="prompt-outline prompt-add-image"
          disabled={(editing.exampleImages??[]).length>=12}
          onClick={()=>setEditing({...editing,exampleImages:[...(editing.exampleImages??[]),""]})}>
          + Ajouter une URL d’image</button>
         <small>Jusqu’à 12 images par fiche ; URL HTTPS ou image SVG de la bibliothèque.</small>
         {(editing.exampleImages??[]).some(url=>url.trim())&&
          <div className="prompt-editor-image-gallery">
           <PromptExampleGallery title={editing.title||"Nouvelle fiche"}
            urls={(editing.exampleImages??[]).filter(url=>url.trim())}
            onOpen={(urls,index)=>setViewer({title:editing.title||"Aperçu",urls,index})}/>
          </div>}
        </div>}
       <div className="prompt-editor-actions prompt-editor-justify">
        {editing.id&&<button className="prompt-text-action prompt-danger" disabled={saving}
         onClick={()=>void removeItem(editing)}>Supprimer la fiche</button>}
        <div className="prompt-toolbar">
         <button className="prompt-outline" onClick={()=>setEditing(null)}>Annuler</button>
         <button className="prompt-primary" disabled={saving||!editing.title.trim()}
          onClick={()=>void persist(editing)}>{saving?"Enregistrement…":"Enregistrer"}</button>
        </div>
       </div>
      </div>
     </div>:<>
      <div className="prompt-content-head">
       <div><h1>{view==="socle"?"Instructions générales":view==="journal"?"Journal des feedbacks":info?.name}</h1>
        <p>{view==="journal"?"Retours organisés par thème, puis classés par date. Les choix de variantes déjà enregistrés figurent aussi dans cet historique.":info?.description}</p></div>
       {(view==="styles"||view==="compositions")&&
        <button className="prompt-primary" onClick={()=>addItem(view)}>+ Ajouter {view==="styles"?"un style":"une composition"}</button>}
      </div>
      {view==="socle"&&<>
       <section className="prompt-panel">
        <h2>Socle général</h2>
        <p>Les règles permanentes de création. Le contenu enregistré reste modifiable ici.</p>
        <textarea className="prompt-editor-large" aria-label="Instructions globales"
         value={global} onChange={e=>setGlobal(e.target.value)} spellCheck={false}/>
        <div className="prompt-editor-actions">
         <span className="prompt-note">{global.length.toLocaleString("fr-FR")} caractères</span>
         <button className="prompt-primary" disabled={saving||!dirty} onClick={()=>void saveInstructions()}>
          {saving?"Enregistrement…":"Enregistrer"}</button>
        </div>
       </section>
       {presentationId&&<section className="prompt-panel">
        <h2>Cette présentation</h2>
        <p>{presentationTitle||"Présentation actuelle"} ; consignes prioritaires propres à ce diaporama.</p>
        <textarea className="prompt-editor-large" style={{minHeight:135}} aria-label="Instructions locales"
         value={local} onChange={e=>setLocal(e.target.value)}/>
        <div className="prompt-editor-actions"><button className="prompt-primary" disabled={saving||!dirty}
         onClick={()=>void saveInstructions()}>Enregistrer</button></div>
       </section>}
       {renderMethods()}
      </>}
      {view==="skills"&&renderMethods()}
      {(view==="styles"||view==="compositions")&&
       (selected.length?<div className="prompt-card-grid">{selected.map(renderCard)}</div>:
        <div className="prompt-empty"><strong>Aucune fiche pour le moment</strong>
         <p>Ajoute toi-même une description et les instructions correspondantes.</p>
         <button className="prompt-primary" onClick={()=>addItem(view)}>+ Ajouter {view==="styles"?"un style":"une composition"}</button>
        </div>)}
      {view==="journal"&&<section className="prompt-feedback-section">
       <div className="prompt-feedback-toolbar">
        <div className="prompt-feedback-filter">
         <label htmlFor="feedback-type-filter">Typologie</label>
         <select id="feedback-type-filter" value={feedbackTypeFilter}
          onChange={e=>setFeedbackTypeFilter(e.target.value as FeedbackCategory|"all")}>
          <option value="all">Tous les thèmes</option>
          {feedbackTypes.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}
         </select>
        </div>
        <div className="prompt-feedback-filter">
         <label htmlFor="feedback-kind-filter">Nature</label>
         <select id="feedback-kind-filter" value={feedbackKindFilter}
          onChange={e=>setFeedbackKindFilter(e.target.value as FeedbackKind|"all")}>
          <option value="all">Tous les retours</option>
          {feedbackKinds.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}
         </select>
        </div>
        <div className="prompt-feedback-filter">
         <label htmlFor="feedback-sort">Date</label>
         <select id="feedback-sort" value={feedbackOrder}
          onChange={e=>setFeedbackOrder(e.target.value as "newest"|"oldest")}>
          <option value="newest">Plus récents d’abord</option>
          <option value="oldest">Plus anciens d’abord</option>
         </select>
        </div>
        <button className="prompt-primary prompt-feedback-add"
         onClick={()=>setFeedbackFormOpen(open=>!open)}>
         {feedbackFormOpen?"Fermer":"+ Ajouter un feedback"}
        </button>
       </div>
       {feedbackFormOpen&&<form className="prompt-panel prompt-feedback-composer"
        onSubmit={e=>{e.preventDefault();void submitFeedback();}}>
        <h2>Ajouter un retour</h2>
        <div className="prompt-feedback-composer-fields">
         <div className="prompt-form-field"><label htmlFor="new-feedback-type">Thème</label>
          <select id="new-feedback-type" value={feedbackDraft.category}
           onChange={e=>setFeedbackDraft(d=>({...d,category:e.target.value as FeedbackCategory}))}>
           {feedbackTypes.map(type=><option key={type.value} value={type.value}>{type.label}</option>)}
          </select></div>
         <div className="prompt-form-field"><label htmlFor="new-feedback-kind">Nature</label>
          <select id="new-feedback-kind" value={feedbackDraft.kind}
           onChange={e=>setFeedbackDraft(d=>({...d,kind:e.target.value as FeedbackDraft["kind"]}))}>
           {feedbackKinds.filter(x=>x.value!=="choice").map(type=>
            <option key={type.value} value={type.value}>{type.label}</option>)}
          </select></div>
        </div>
        <div className="prompt-form-field">
         <label htmlFor="new-feedback-text">Feedback</label>
         <textarea id="new-feedback-text" rows={4} maxLength={2400}
          placeholder="Décris ce qui fonctionne, ce qui devrait changer ou une idée à retenir."
          value={feedbackDraft.content}
          onChange={e=>setFeedbackDraft(d=>({...d,content:e.target.value}))}/>
        </div>
        <div className="prompt-editor-actions"><button type="submit" className="prompt-primary"
         disabled={saving||!feedbackDraft.content.trim()}>
         {saving?"Enregistrement…":"Enregistrer le feedback"}</button></div>
       </form>}
       {feedbackError&&<div className="prompt-message error" role="alert">{feedbackError}</div>}
       {feedbackLoading?<p className="prompt-feedback-empty">Chargement du journal…</p>:
        <div className="prompt-feedback-timeline">
         <p className="prompt-feedback-count">{filteredFeedback.length} retour(s) affiché(s)</p>
         {feedbackGroups.length===0?<div className="prompt-empty">
          <strong>Aucun retour pour ces critères</strong>
          <p>Ajoute un feedback pour commencer à documenter tes préférences.</p>
         </div>:feedbackGroups.map(group=><section key={group.day} className="prompt-feedback-day">
          <h2>{group.day}</h2>
          {group.items.map(entry=><article key={entry.id} className="prompt-feedback-entry">
           <div className="prompt-feedback-entry-header">
            <span className="prompt-feedback-category">{typeLabel(entry.category)}</span>
            <span className={"prompt-feedback-kind feedback-"+entry.kind}>{kindLabel(entry.kind)}</span>
            <time dateTime={entry.createdAt}>
             {new Date(entry.createdAt).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}
            </time>
           </div>
           <p>{entry.content}</p>
           {entry.source==="variant"&&<small className="prompt-feedback-source">
            Variante enregistrée{entry.presentationTitle?" · "+entry.presentationTitle:""}
           </small>}
           {entry.source==="note"&&<small className="prompt-feedback-source">Feedback ajouté au journal</small>}
          </article>)}
         </section>)}
        </div>}
       <p className="prompt-note">
        Les préférences issues de clics sur les variantes sont des choix enregistrés, pas des critiques explicites. Les commentaires des conversations ChatGPT ne sont pas importés automatiquement.
       </p>
      </section>}
      {view==="references"&&<section className="prompt-panel">
       <h2>Exemples visuels</h2>
       <p>Ajoute des captures d'écran, des images PNG/JPG/WebP, des PDF ou des PowerPoint. Les images sont présentées directement en miniature ; elles peuvent être plus simples à interpréter que des fichiers de présentation.</p>
       <div className="creation-reference-list">
        {references.map(ref=><div key={ref.id} className="creation-reference-entry">
         {ref.mimeType.startsWith("image/")&&<ImageThumb token={token} reference={ref}/>}
         <div className="creation-reference-item">
          <button className="creation-reference-name" onClick={()=>void downloadCreationReference(token,ref)}>
           {ref.filename}<small>{(ref.sizeBytes/1e6).toFixed(2)} Mo</small></button>
          <button className="creation-reference-remove" disabled={removing===ref.id}
           aria-label={"Supprimer "+ref.filename} onClick={()=>void removeRef(ref.id)}>×</button>
         </div>
         {!ref.mimeType.startsWith("image/")&&<ReferenceGallery token={token} reference={ref}/>}
        </div>)}
       </div>
       <label className="creation-reference-upload">
        {uploading?"Ajout en cours…":"+ Ajouter des images ou documents"}
        <input type="file" multiple accept=".png,.jpg,.jpeg,.webp,.pptx,.pdf,.html,.htm,.json"
         disabled={uploading||references.length>=24} onChange={e=>void uploadFiles(e)}/>
       </label>
       <p className="prompt-note">{references.length} / 24 fichiers ; 4 Mo maximum chacun.</p>
      </section>}
     </>}
    {error&&<p role="alert" className="prompt-message error">{error}</p>}
    {message&&<p role="status" className="prompt-message success">{message}</p>}
   </main>
  </div>
  {viewer&&<div className="prompt-lightbox" role="dialog" aria-modal="true"
   aria-label={"Galerie agrandie : "+viewer.title} onClick={()=>setViewer(null)}>
   <div className="prompt-lightbox-panel" onClick={e=>e.stopPropagation()}>
    <div className="prompt-lightbox-head">
     <strong>{viewer.title}</strong>
     <button className="prompt-lightbox-close" aria-label="Fermer l’image" onClick={()=>setViewer(null)}>✕</button>
    </div>
    <div className="prompt-lightbox-visual">
     {viewer.urls.length>1&&<button className="prompt-lightbox-arrow" aria-label="Image précédente"
      onClick={()=>setViewer(v=>v?{...v,index:(v.index+v.urls.length-1)%v.urls.length}:v)}>‹</button>}
     <ExampleImage src={viewer.urls[viewer.index]!} alt={"Aperçu agrandi : "+viewer.title}/>
     {viewer.urls.length>1&&<button className="prompt-lightbox-arrow" aria-label="Image suivante"
      onClick={()=>setViewer(v=>v?{...v,index:(v.index+1)%v.urls.length}:v)}>›</button>}
    </div>
    <div className="prompt-lightbox-foot">
     <span>Exemple {viewer.index+1} sur {viewer.urls.length}</span>
     <a href={viewer.urls[viewer.index]} target="_blank" rel="noopener noreferrer">Ouvrir l’image d’origine</a>
    </div>
   </div>
  </div>}
 </div>;
}
