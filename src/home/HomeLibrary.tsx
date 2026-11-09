import {useEffect,useMemo,useRef,useState} from "react";
import type {DeckSummary,FolderSummary} from "../lib/api";
import {readDeckCover} from "../lib/api";
import type {SlideDocument} from "../domain/slide";
import {SlideThumbnail} from "../editor/SlideThumbnail";

type Props={
  token:string;decks:DeckSummary[];folders:FolderSummary[];busy:boolean;
  onOpen:(id:string)=>void;onCreateDeck:(folderId:string|null)=>void;
  onCreateFolder:(name:string,parentId:string|null)=>Promise<boolean>;
  onRenameFolder:(id:string,name:string)=>Promise<boolean>;
  onDeleteFolder:(id:string)=>Promise<boolean>;
  onMoveDeck:(deckId:string,folderId:string|null)=>Promise<boolean>;
  onMoveFolder:(id:string,parentId:string|null)=>Promise<boolean>;
  onRenameDeck:(id:string,name:string)=>Promise<boolean>;
  onDeleteDeck:(id:string)=>Promise<boolean>;
};
const readableDate=(date:string)=>new Date(date).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"});
const cardCache=new Map<string,SlideDocument|null>();
function DeckCover({id,token}:{id:string;token:string}){
  const ref=useRef<HTMLDivElement>(null);
  const [cover,setCover]=useState<SlideDocument|null|undefined>(()=>cardCache.get(id));
  useEffect(()=>{
    if(cardCache.has(id)){setCover(cardCache.get(id));return;}
    const target=ref.current;if(!target)return;
    let cancelled=false;
    const load=()=>{void readDeckCover(token,id).then(doc=>{
      if(!cancelled){cardCache.set(id,doc);setCover(doc);}
    }).catch(()=>{if(!cancelled)setCover(null);});};
    if(typeof IntersectionObserver==="undefined"){load();return;}
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();load();}
    },{rootMargin:"250px"});
    observer.observe(target);
    return()=>{cancelled=true;observer.disconnect();};
  },[id,token]);
  return <div ref={ref} className="library-cover">
    {cover?<SlideThumbnail document={cover} index={1}/>:
      <div className="library-cover-placeholder"><span>▧</span><small>Aperçu de la présentation</small></div>}
  </div>;
}
type Editing={id:string;name:string}|null;
export function HomeLibrary({
  token,decks,folders,busy,onOpen,onCreateDeck,onCreateFolder,onRenameFolder,onDeleteFolder,
  onMoveDeck,onMoveFolder,onRenameDeck,onDeleteDeck,
}:Props){
  const [folder,setFolder]=useState<string>("all");
  const [query,setQuery]=useState("");
  const [sort,setSort]=useState<"recent"|"name">("recent");
  const [layout,setLayout]=useState<"grid"|"list">("grid");
  const [creatingFolder,setCreatingFolder]=useState(false);
  const [folderName,setFolderName]=useState("");
  const [editingFolder,setEditingFolder]=useState<Editing>(null);
  const [editingDeck,setEditingDeck]=useState<Editing>(null);
  const [confirmDelete,setConfirmDelete]=useState<string|null>(null);
  const [activeMenu,setActiveMenu]=useState<string|null>(null);
  const currentFolder=folders.find(x=>x.id===folder);
  const selectedFolderId=folder==="all"||folder==="root"?null:folder;
  const breadcrumbs=useMemo(()=>{
    const chain:FolderSummary[]=[];
    let cursor=currentFolder,depth=0;
    while(cursor&&depth++<20){
      chain.unshift(cursor);
      cursor=folders.find(x=>x.id===cursor!.parent_id);
    }
    return chain;
  },[currentFolder,folders]);
  const visibleFolders=useMemo(()=>{
    if(query.trim())return folders.filter(f=>f.name.toLocaleLowerCase("fr").includes(query.trim().toLocaleLowerCase("fr")));
    return folders.filter(f=>folder==="all"||folder==="root"?!f.parent_id:f.parent_id===folder);
  },[folders,query,folder]);
  const visibleDecks=useMemo(()=>{
    const text=query.trim().toLocaleLowerCase("fr");
    return decks.filter(deck=>{
      const inFolder=folder==="all"||(folder==="root"?!deck.folder_id:deck.folder_id===folder);
      return inFolder&&(!text||deck.title.toLocaleLowerCase("fr").includes(text));
    }).sort((a,b)=>sort==="name"?a.title.localeCompare(b.title,"fr"):
      new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime());
  },[decks,query,sort,folder]);
  const currentParent=selectedFolderId;
  async function submitFolder(e:React.FormEvent){
    e.preventDefault();
    if(!folderName.trim())return;
    if(await onCreateFolder(folderName.trim(),currentParent)){
      setFolderName("");setCreatingFolder(false);
    }
  }
  async function submitRenameFolder(e:React.FormEvent){
    e.preventDefault();
    if(editingFolder?.name.trim()&&await onRenameFolder(editingFolder.id,editingFolder.name.trim()))
      setEditingFolder(null);
  }
  async function submitRenameDeck(e:React.FormEvent){
    e.preventDefault();
    if(editingDeck?.name.trim()&&await onRenameDeck(editingDeck.id,editingDeck.name.trim()))
      setEditingDeck(null);
  }
  const onDropFolder=(e:React.DragEvent,folderId:string|null)=>{
    e.preventDefault();
    const deckId=e.dataTransfer.getData("application/x-diaporama-deck");
    if(deckId)void onMoveDeck(deckId,folderId);
    const folderIdDragged=e.dataTransfer.getData("application/x-diaporama-folder");
    if(folderIdDragged&&folderIdDragged!==folderId)void onMoveFolder(folderIdDragged,folderId);
  };
  return <section className="library-home">
    <div className="library-welcome">
      <div><span className="library-eyebrow">ESPACE DE CRÉATION</span>
        <h1>Vos présentations</h1>
        <p>Retrouvez vos projets, organisez-les en dossiers et reprenez votre travail.</p>
      </div>
      <div className="library-primary-actions">
        <button className="library-create-primary" disabled={busy}
          onClick={()=>onCreateDeck(currentParent)}>+ Nouvelle présentation</button>
        <button className="subtle-btn" onClick={()=>setCreatingFolder(v=>!v)}>▣ Nouveau dossier</button>
      </div>
    </div>
    {creatingFolder&&<form className="library-new-folder" onSubmit={e=>void submitFolder(e)}>
      <label htmlFor="library-folder-name">Nom du nouveau dossier</label>
      <input id="library-folder-name" autoFocus maxLength={120}
        value={folderName} onChange={e=>setFolderName(e.target.value)}
        placeholder="Ex. : Cours de psychologie"/>
      <button type="submit" className="primary" disabled={!folderName.trim()||busy}>Créer</button>
      <button type="button" className="subtle-btn" onClick={()=>setCreatingFolder(false)}>Annuler</button>
    </form>}
    <div className="library-navigation" aria-label="Emplacement">
      <button className={folder==="all"?"selected":""} onClick={()=>setFolder("all")}>Toutes</button>
      <button className={folder==="root"?"selected":""} onClick={()=>setFolder("root")}
        onDragOver={e=>e.preventDefault()} onDrop={e=>onDropFolder(e,null)}>Sans dossier</button>
      {breadcrumbs.map(f=><button className={folder===f.id?"selected":""} key={f.id}
        onClick={()=>setFolder(f.id)}>{f.name}</button>)}
    </div>
    <div className="library-controls">
      <label className="library-search"><span aria-hidden="true">⌕</span>
        <input type="search" aria-label="Rechercher des présentations et des dossiers"
          value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher une présentation…"/>
      </label>
      <label>Tri<select value={sort} onChange={e=>setSort(e.target.value as "recent"|"name")}>
        <option value="recent">Modifiées récemment</option><option value="name">Nom A-Z</option>
      </select></label>
      <div className="library-layout-switch" role="group" aria-label="Disposition">
        <button className={layout==="grid"?"selected":""} onClick={()=>setLayout("grid")} aria-label="Vue en grille" title="Grille">▦</button>
        <button className={layout==="list"?"selected":""} onClick={()=>setLayout("list")} aria-label="Vue en liste" title="Liste">☷</button>
      </div>
    </div>
    {visibleFolders.length>0&&<section className="library-section">
      <h2>Dossiers <span>{visibleFolders.length}</span></h2>
      <div className="library-folder-grid">
        {visibleFolders.map(f=><div key={f.id} className="library-folder-card" draggable
          onDragStart={e=>{e.dataTransfer.setData("application/x-diaporama-folder",f.id);}}
          onDragOver={e=>e.preventDefault()} onDrop={e=>onDropFolder(e,f.id)}>
          {editingFolder?.id===f.id?
            <form className="library-inline-edit" onSubmit={e=>void submitRenameFolder(e)}>
              <input autoFocus maxLength={120} aria-label="Renommer le dossier"
                value={editingFolder.name} onChange={e=>setEditingFolder({...editingFolder,name:e.target.value})}/>
              <button type="submit" aria-label="Valider">✓</button>
              <button type="button" onClick={()=>setEditingFolder(null)} aria-label="Annuler">×</button>
            </form>:
            <button className="library-folder-open" onClick={()=>{setFolder(f.id);setQuery("");}}>
              <span className="library-folder-icon" aria-hidden="true">▰</span>
              <span className="library-folder-text"><strong>{f.name}</strong>
                <small>{f.presentation_count} présentation{f.presentation_count!==1?"s":""}</small>
              </span>
            </button>}
          <div className="library-menu-holder">
            <button className="library-menu-button" title={"Actions sur "+f.name}
              aria-label={"Actions sur le dossier "+f.name}
              aria-expanded={activeMenu===f.id} onClick={()=>setActiveMenu(v=>v===f.id?null:f.id)}>⋮</button>
            {activeMenu===f.id&&<div className="library-menu" role="group" aria-label="Actions sur le dossier">
              <button onClick={()=>{setEditingFolder({id:f.id,name:f.name});setActiveMenu(null);}}>Renommer</button>
              {f.parent_id&&<button onClick={()=>{void onMoveFolder(f.id,null);setActiveMenu(null);}}>Placer à la racine</button>}
              <button onClick={()=>{setConfirmDelete(f.id);setActiveMenu(null);}}>Supprimer le dossier</button>
            </div>}
          </div>
          {confirmDelete===f.id&&<div className="library-inline-warning">
            <small>Les présentations seront conservées hors du dossier.</small>
            <button onClick={()=>{void onDeleteFolder(f.id);setConfirmDelete(null);if(folder===f.id)setFolder("all");}}>Confirmer</button>
            <button onClick={()=>setConfirmDelete(null)}>Annuler</button>
          </div>}
        </div>)}
      </div>
    </section>}
    <section className="library-section">
      <h2>Présentations <span>{visibleDecks.length}</span></h2>
      {visibleDecks.length===0?<div className="library-empty">
        <strong>{query?"Aucun résultat":"Aucune présentation ici"}</strong>
        <p>{query?"Essayez un autre mot-clé.":"Créez une présentation ou déplacez-en une dans ce dossier."}</p>
      </div>:
      <div className={"library-deck-grid"+(layout==="list"?" is-list":"")}>
        {visibleDecks.map(deck=><article key={deck.id} className="library-deck-card" draggable
          onDragStart={e=>{e.dataTransfer.setData("application/x-diaporama-deck",deck.id);e.dataTransfer.effectAllowed="move";}}>
          <button className="library-deck-open" onClick={()=>onOpen(deck.id)}>
            <DeckCover token={token} id={deck.id}/>
            <span className="library-deck-title">{deck.title}</span>
            <span className="library-deck-meta">{deck.slide_count} diapo{deck.slide_count!==1?"s":""} · {readableDate(deck.updated_at)}</span>
          </button>
          <div className="library-deck-actions">
            <label>Ranger dans
              <select aria-label={"Dossier de "+deck.title} value={deck.folder_id??""}
                onChange={e=>void onMoveDeck(deck.id,e.target.value||null)}>
                <option value="">Sans dossier</option>
                {folders.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </label>
            <div className="library-menu-holder">
              <button className="library-menu-button" aria-label={"Actions sur "+deck.title}
                aria-expanded={activeMenu===deck.id} onClick={()=>setActiveMenu(v=>v===deck.id?null:deck.id)}>⋮</button>
              {activeMenu===deck.id&&<div className="library-menu" role="group" aria-label="Actions sur la présentation">
                <button onClick={()=>{setEditingDeck({id:deck.id,name:deck.title});setActiveMenu(null);}}>Renommer</button>
                <button onClick={()=>{setConfirmDelete(deck.id);setActiveMenu(null);}}>Supprimer</button>
              </div>}
            </div>
          </div>
          {editingDeck?.id===deck.id&&<form className="library-inline-edit" onSubmit={e=>void submitRenameDeck(e)}>
            <input autoFocus maxLength={180} aria-label="Nouveau titre"
              value={editingDeck.name} onChange={e=>setEditingDeck({...editingDeck,name:e.target.value})}/>
            <button type="submit">Valider</button>
            <button type="button" onClick={()=>setEditingDeck(null)}>Annuler</button>
          </form>}
          {confirmDelete===deck.id&&<div className="library-inline-warning">
            <small>Supprimer définitivement cette présentation ?</small>
            <button onClick={()=>{void onDeleteDeck(deck.id);setConfirmDelete(null);}}>Confirmer</button>
            <button onClick={()=>setConfirmDelete(null)}>Annuler</button>
          </div>}
        </article>)}
      </div>}
    </section>
    <p className="library-hint">Astuce : glissez une présentation sur un dossier pour la ranger. Les modifications s'enregistrent automatiquement.</p>
  </section>;
}
