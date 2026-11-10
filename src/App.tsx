import { useEffect, useRef, useState } from "react";
import { SlideDocumentSchema, type SlideDocument, type SlideElement } from "./domain/slide";
import { VisualCanvas } from "./editor/VisualCanvas";
import { AnimationTimeline } from "./editor/AnimationTimeline";
import { PresenterStudio } from "./presenter/PresenterStudio";
import { PropertiesPanel, type InspectorTab } from "./editor/PropertiesPanel";
import { SlideThumbnail } from "./editor/SlideThumbnail";
import { ImageStudio } from "./editor/ImageStudio";
import { DiagramStudio } from "./editor/DiagramStudio";
import { VariantsStudio } from "./editor/VariantsStudio";
import { VariantGallery, useSlideVariants, useVariantKeyboard, type VariantChoice } from "./editor/VariantDock";
import { SpeakerNotesPane } from "./editor/SpeakerNotesPane";
import { HistoryStudio } from "./editor/HistoryStudio";
import { ImportStudio } from "./import/ImportStudio";
import { ImprovementStudio } from "./improve/ImprovementStudio";
import { HomeLibrary } from "./home/HomeLibrary";
import { CreationInstructionsStudio } from "./editor/CreationInstructionsStudio";
import type { ImageCandidate } from "./images/search";
import { alignElements, distributeElements, duplicateElements, transformBox, withElementBoxes, worldBox, type Box } from "./editor/geometry";
import { buildPowerPoint, exportPowerPoint, type ExportReport } from "./export/pptx";
import { buildHtmlArchive } from "./export/html";
import {makeSmartConnector,refreshSmartConnectors} from "./graphics/connectors";
import {
  getGoogleClientId, isValidGoogleClientId, requestGoogleDriveAccess,
  uploadPowerPointToGoogleSlides, type GoogleSlidesResult,
} from "./export/googleSlides";
import { ApiError, command, listPresentations, listFolders, readPresentation, readDeckRevisions, type FolderSummary, type DeckSummary, type PresentationDetail, type SlideRecord } from "./lib/api";

const SESSION_KEY = "diaporama-chatgpt-owner-token";
const DECK_KEY = "diaporama-chatgpt-current-deck";
function ErrorMessage({ text, clear }: { text: string; clear: () => void }) {
  if (!text) return null;
  return <div role="alert" className="error-line">{text} <button className="text-btn" onClick={clear}>Fermer</button></div>;
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(SESSION_KEY) ?? "");
  const [entry, setEntry] = useState("");
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [folders,setFolders]=useState<FolderSummary[]>([]);
  const [current, setCurrent] = useState<PresentationDetail | null>(null);
  const [slideId, setSlideId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SlideDocument | null>(null);
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<InspectorTab>("design");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [imageStudioOpen,setImageStudioOpen]=useState(false);
  const [diagramStudioOpen,setDiagramStudioOpen]=useState(false);
  const [variantsStudioOpen,setVariantsStudioOpen]=useState(false);
  const [previewVariant,setPreviewVariant]=useState<VariantChoice|null>(null);
  const [variantRefreshKey,setVariantRefreshKey]=useState(0);
  const [variantSwitching,setVariantSwitching]=useState(false);
  const switchingRef=useRef(false);
  const [historyStudioOpen,setHistoryStudioOpen]=useState(false);
  const [presenting,setPresenting]=useState(false);
  const [importOpen,setImportOpen]=useState(false);
  const [improveOpen,setImproveOpen]=useState(false);
  const [creationSettingsOpen,setCreationSettingsOpen]=useState(false);
  const [animationPanelOpen,setAnimationPanelOpen]=useState(false);
  const [showSlideRail,setShowSlideRail]=useState(true);
  const [showInspector,setShowInspector]=useState(()=>window.innerWidth>760);
  const [rightPane,setRightPane]=useState<"variants"|"tools">("variants");
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(10);
  const [externalChanges, setExternalChanges] = useState(false);
  const draftRef = useRef<SlideDocument | null>(null);
  const currentRef = useRef<PresentationDetail | null>(null);
  const dirtyRef = useRef(false);
  const notesRef = useRef("");
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const versionRef = useRef(0);
  const historyRef = useRef<{undo:SlideDocument[];redo:SlideDocument[];key:string;time:number}>({undo:[],redo:[],key:"",time:0});
  const [, setHistoryTick] = useState(0);
  currentRef.current = current;
  dirtyRef.current = dirty;
  notesRef.current = notes;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [exportReport, setExportReport] = useState<ExportReport | null>(null);
  const [exportTarget, setExportTarget] = useState<"pptx" | "google" | "html" | null>(null);
  const [htmlExportReport,setHtmlExportReport]=useState<{fileName:string;downloadUrl:string}|null>(null);
  const [editingDeckTitle,setEditingDeckTitle]=useState(false);
  const [newDeckTitle,setNewDeckTitle]=useState("");
  const [googleReport, setGoogleReport] = useState<GoogleSlidesResult | null>(null);
  const [googleExportSlideCount, setGoogleExportSlideCount] = useState<number | null>(null);
  const variants=useSlideVariants(token,slideId,variantRefreshKey);
  useVariantKeyboard(variants.items,selectVariant);
  useEffect(()=>{if(selectedIds.length)setRightPane("tools");},[selectedIds]);

  useEffect(()=>{
    if(!token)return;
    let cancelled=false;
    Promise.all([listPresentations(token),listFolders(token)]).then(([items,directory])=>{
      if(cancelled)return;
      setDecks(items);setFolders(directory);
      // The library is the default landing page; only an explicit deep link
      // opens an editor directly.
      const requested=new URLSearchParams(window.location.search).get("deck");
      if(requested&&items.some(deck=>deck.id===requested)){
        void readPresentation(token,requested).then(data=>{
          if(cancelled)return;
          setCurrent(data);pickSlide(data.slides[0]);
        }).catch(e=>{if(!cancelled)setError(String(e.message??e));});
      }
    }).catch(e=>{
      if(cancelled)return;
      setError(e instanceof Error?e.message:"Accès impossible.");
      if(e instanceof ApiError&&e.status===401){
        sessionStorage.removeItem(SESSION_KEY);setToken("");
      }
    });
    return()=>{cancelled=true;};
  },[token]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    const key = entry.trim();
    if (!key) return;
    setLoginBusy(true); setError("");
    try {
      const [items,foldersLoaded] = await Promise.all([listPresentations(key),listFolders(key)]);
      sessionStorage.setItem(SESSION_KEY, key);
      setDecks(items);setFolders(foldersLoaded);
      setEntry(""); setToken(key);
    } catch (e) { setError(e instanceof Error ? e.message : "Connexion impossible."); }
    finally { setLoginBusy(false); }
  }

  async function logout() {
    if (!await flushPending()) return;
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(DECK_KEY);
    const url=new URL(window.location.href);
    url.searchParams.delete("deck");url.searchParams.delete("export");
    window.history.replaceState({},"",url.pathname+url.search+url.hash);
    setToken(""); setDecks([]);setFolders([]); setCurrent(null); setSlideId(null); setDraft(null); draftRef.current=null; setNotes(""); setDirty(false); setSelectedIds([]);
  }

  function pickSlide(slide?: SlideRecord) {
    setPreviewVariant(null);setRightPane("variants");setZoom(1);
    setSlideId(slide?.id ?? null);
    const next=slide ? structuredClone(slide.document):null;
    draftRef.current=next;
    setDraft(next);
    notesRef.current=slide?.notes??"";
    setNotes(notesRef.current);
    setSelectedIds([]);dirtyRef.current=false;setDirty(false);setTab("design");setExternalChanges(false);
    historyRef.current={undo:[],redo:[],key:"",time:0};
    setHistoryTick(v=>v+1);
  }
  async function flushPending():Promise<boolean>{
    // The save pipeline is serialized so a later navigation cannot drop edits.
    for(let attempt=0;attempt<5;attempt++){
      if(!dirtyRef.current && !saveInFlightRef.current)return true;
      if(!await save())return false;
      if(!dirtyRef.current)return true;
    }
    setError("D'autres changements sont encore en cours. Réessayez après leur sauvegarde.");
    return false;
  }
  async function navigateToSlide(slide:SlideRecord){
    if(slideId===slide.id)return;
    if(!await flushPending())return;
    const updated=currentRef.current?.slides.find(s=>s.id===slide.id);
    if(updated)pickSlide(updated);
  }
  function backupDraft(){
    if(!draft||!slideId||!current)return;
    // The backup is deliberately a native importable presentation, not an opaque dump.
    const data=JSON.stringify({presentation:{title:current.presentation.title+" · brouillon local"},
      slides:[{document:draft,notes}],
      backup:{sourceSlideId:slideId,sourceDeckId:current.presentation.id,
        sourceRevision:active?.revision??0}},null,2);
    const url=URL.createObjectURL(new Blob([data],{type:"application/json;charset=utf-8"}));
    const link=window.document.createElement("a");
    link.href=url;link.download="brouillon-diapositive-"+slideId.slice(0,8)+".json";
    window.document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  async function refreshList() {setDecks(await listPresentations(token));}
  async function refreshFolders(){setFolders(await listFolders(token));}
  async function goHome(){
    if(!await flushPending())return;
    setCurrent(null);pickSlide(undefined);
    sessionStorage.removeItem(DECK_KEY);
    const url=new URL(window.location.href);
    url.searchParams.delete("deck");url.searchParams.delete("export");
    window.history.replaceState({},"",url.pathname+url.search+url.hash);
    setError("");setEditingDeckTitle(false);
    void Promise.all([refreshList(),refreshFolders()]).catch(()=>{});
  }
  async function createFolder(name:string,parentId:string|null):Promise<boolean>{
    try{
      await command(token,{action:"createFolder",name,parentId});await refreshFolders();return true;
    }catch(e){setError(e instanceof Error?e.message:String(e));return false;}
  }
  async function renameFolder(id:string,name:string):Promise<boolean>{
    try{await command(token,{action:"renameFolder",id,name});await refreshFolders();return true;}
    catch(e){setError(e instanceof Error?e.message:String(e));return false;}
  }
  async function deleteFolder(id:string):Promise<boolean>{
    try{
      await command(token,{action:"deleteFolder",id});
      await Promise.all([refreshFolders(),refreshList()]);return true;
    }catch(e){setError(e instanceof Error?e.message:String(e));return false;}
  }
  async function moveDeck(id:string,folderId:string|null):Promise<boolean>{
    try{
      await command(token,{action:"movePresentation",id,folderId});
      await refreshList();return true;
    }catch(e){setError(e instanceof Error?e.message:String(e));return false;}
  }
  async function moveFolder(id:string,parentId:string|null):Promise<boolean>{
    try{
      await command(token,{action:"moveFolder",id,parentId});
      await refreshFolders();return true;
    }catch(e){setError(e instanceof Error?e.message:String(e));return false;}
  }
  async function loadDeck(id: string, preferred?: string) {
    const detail = await readPresentation(token, id);
    setCurrent(detail);
    sessionStorage.setItem(DECK_KEY,id);
    const url=new URL(window.location.href);
    url.searchParams.set("deck",id);url.searchParams.delete("export");
    window.history.replaceState({},"",url.pathname+url.search+url.hash);
    pickSlide(detail.slides.find(s => s.id === preferred) ?? detail.slides[0]);
  }
  async function openDeck(id: string) {
    if (!await flushPending()) return;
    setBusy(true); setError("");
    try { await loadDeck(id); } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  }
  async function createDeck(folderId:string|null=null) {
    if(!await flushPending())return;
    const title="Sans titre";
    setBusy(true); setError("");
    try {
      const response = await command<{ presentation: { id: string } }>(token, { action: "createPresentation", title,folderId });
      await refreshList(); await loadDeck(response.presentation.id);
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  }
  async function renameDeck(id:string,name:string):Promise<boolean>{
    const title=name.trim();
    if(!title)return false;
    try{
      await command(token,{action:"renamePresentation",id,title});
      if(currentRef.current?.presentation.id===id){
        setCurrent(previous=>previous?{...previous,presentation:{...previous.presentation,title}}:previous);
      }
      await refreshList();return true;
    }catch(e){setError(e instanceof Error?e.message:String(e));return false;}
  }
  async function deleteDeck(id:string):Promise<boolean>{
    if(!await flushPending())return false;
    try{
      await command(token,{action:"deletePresentation",id});
      if(currentRef.current?.presentation.id===id){
        setCurrent(null);pickSlide(undefined);
        sessionStorage.removeItem(DECK_KEY);
        const url=new URL(window.location.href);url.searchParams.delete("deck");
        window.history.replaceState({},"",url.pathname+url.search+url.hash);
      }
      await refreshList();return true;
    }catch(e){setError(e instanceof Error?e.message:String(e));return false;}
  }
  async function slideAction(action: "addSlide" | "duplicateSlide" | "deleteSlide") {
    if (!current || !await flushPending()) return;
    const currentId = current.presentation.id;
    if (action === "deleteSlide" && !window.confirm("Supprimer cette diapositive ?")) return;
    if (action !== "addSlide" && !slideId) return;
    setBusy(true); setError("");
    try {
      const output = await command<{ slide?: { id: string } }>(token, {
        action, ...(action === "addSlide" ? { presentationId: currentId } : { id: slideId }),
      });
      await loadDeck(currentId, action === "deleteSlide" ? undefined : output.slide?.id);
      await refreshList();
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  }
  async function createDiagramSlide(document:SlideDocument,sourceNotes:string){
    if(!current||!await flushPending())return;
    const presentationId=current.presentation.id;
    setBusy(true);setError("");
    try{
      const created=await command<{slide:{id:string}}>(token,{action:"addSlide",presentationId});
      if(!created.slide?.id)throw Error("La nouvelle diapositive n'a pas été créée.");
      await command(token,{action:"saveSlide",id:created.slide.id,revision:1,document,
        notes:sourceNotes.slice(0,30000)});
      await loadDeck(presentationId,created.slide.id);
      await refreshList();setDiagramStudioOpen(false);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  function editDocument(next:SlideDocument,key="change"){
    const previous=draftRef.current;
    if(previous===next)return;
    const time=Date.now(), h=historyRef.current;
    const grouped=/^(text|style-|code-|object)/.test(key)&&key===h.key&&time-h.time<850;
    if(previous&&!grouped){h.undo=[...h.undo.slice(-49),structuredClone(previous)];h.redo=[];}
    const prepared=refreshSmartConnectors(next);
    h.key=key;h.time=time;draftRef.current=prepared;versionRef.current++;
    setDraft(prepared);dirtyRef.current=true;setDirty(true);setHistoryTick(v=>v+1);
  }
  function undo(){
    const h=historyRef.current,prior=h.undo.pop(),now=draftRef.current;
    if(!prior||!now)return;
    h.redo.push(structuredClone(now));h.key="";
    draftRef.current=prior;versionRef.current++;setDraft(prior);dirtyRef.current=true;setDirty(true);setHistoryTick(v=>v+1);
  }
  function redo(){
    const h=historyRef.current,next=h.redo.pop(),now=draftRef.current;
    if(!next||!now)return;
    h.undo.push(structuredClone(now));h.key="";
    draftRef.current=next;versionRef.current++;setDraft(next);dirtyRef.current=true;setDirty(true);setHistoryTick(v=>v+1);
  }
  function updateFreeform(part: "html" | "css", value: string) {
    if (!draft) return;
    const freeform = { html: draft.freeform?.html ?? "", css: draft.freeform?.css ?? "", [part]: value };
    editDocument({ ...draft, freeform, mode: draft.elements.length ? "hybrid" : "freeform" });
  }
  function addObject(type: "text" | "image" | "shape") {
    if (!draft) return;
    const src = type === "image" ? window.prompt("Adresse HTTPS de l'image") : null;
    if (type === "image" && !src) return;
    const id = crypto.randomUUID();
    const element: SlideElement = {
      id, type,
      ...(type === "text" ? { text: "Nouveau texte" } : {}),
      ...(type === "image" ? { src: src ?? "" } : {}),
      styles: type === "text"
        ? { top: "120px", left: "130px", fontSize: "84px", fontFamily: "Georgia, serif", color: "#192a21", width: "1450px" }
        : type === "image"
        ? { top: "220px", left: "130px", width: "840px", height: "500px", objectFit: "cover" }
        : { top: "260px", left: "200px", width: "520px", height: "260px", backgroundColor: "#a4bdac", borderRadius: "8px" },
    };
    editDocument({ ...draft, mode: draft.mode === "freeform" ? "hybrid" : draft.mode, elements: [...draft.elements, element] });
    setTab("design");setSelectedIds([id]);
  }
  function chooseImage(photo:ImageCandidate) {
    const doc=draftRef.current;
    if(!doc||!current)return;
    try{
      if(new URL(photo.imageUrl).protocol!=="https:")throw Error("L'image doit utiliser une adresse HTTPS.");
      const single=selectedIds.length===1?doc.elements.find(e=>e.id===selectedIds[0]&&e.type==="image"):undefined;
      const id=single?.id??crypto.randomUUID();
      const focalPosition=photo.focalX!==undefined&&photo.focalY!==undefined
        ?Math.round(photo.focalX)+"% "+Math.round(photo.focalY)+"%":undefined;
      const next:SlideDocument=single?
        {...doc,elements:doc.elements.map(e=>e.id===id?{...e,src:photo.imageUrl,
          styles:{...e.styles,...(focalPosition?{objectPosition:focalPosition}:{})}}:e)}:
        {...doc,mode:doc.mode==="freeform"?"hybrid":doc.mode,
          elements:[...doc.elements,{id,type:"image",src:photo.imageUrl,
            styles:{left:"120px",top:"210px",width:"1000px",height:"600px",objectFit:"cover",objectPosition:focalPosition??"50% 50%"}}]};
      editDocument(next,"photo");
      setSelectedIds([id]);setTab("design");setImageStudioOpen(false);
      if(photo.provider==="unsplash"&&photo.downloadLocation){
        void fetch("/.netlify/functions/image-search",{method:"POST",cache:"no-store",
          headers:{authorization:"Bearer "+token,"Content-Type":"application/json"},
          body:JSON.stringify({action:"trackUnsplash",downloadLocation:photo.downloadLocation})
        }).catch(()=>{});
      }
      void command(token,{action:"saveAssets",presentationId:current.presentation.id,assets:[{
        url:photo.imageUrl,label:photo.title,source:photo.pageUrl,
        rights:photo.attribution+" ; "+photo.license,
      }]}).catch(()=>setError("Image insérée, mais sa référence n'a pas pu être ajoutée au catalogue."));
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  async function selectVariant(variant:VariantChoice|null):Promise<boolean>{
    if(switchingRef.current||!slideId)return false;
    const currentId=slideId;
    const choiceId=variant?.id??variants.original?.id??null;
    const chosen=draftRef.current?.variantSelection?.activeId??null;
    if(choiceId===chosen||(!choiceId&&!chosen)){setRightPane("variants");return true;}
    if(!choiceId)return false;
    switchingRef.current=true;setVariantSwitching(true);
    setPreviewVariant(variant?{...variant,document:structuredClone(variant.document)}:null);
    setRightPane("variants");
    try{
      if(!await flushPending())throw new Error("Sauvegarde incomplète : le changement de variante a été interrompu.");
      const source=currentRef.current?.slides.find(item=>item.id===currentId);
      if(!source)throw new Error("Diapositive introuvable.");
      const output=await command<{unchanged?:boolean;slide:{
        revision:number;updated_at:string|null;document:SlideDocument;notes:string;
      }}>(token,{action:"switchVariant",slideId:currentId,variantId:choiceId,revision:source.revision});
      if(!output.unchanged){
        const changed={...source,revision:output.slide.revision,
          updated_at:output.slide.updated_at??source.updated_at,
          document:output.slide.document,notes:output.slide.notes};
        const detail=currentRef.current;
        if(detail){
          const updated={...detail,slides:detail.slides.map(item=>item.id===currentId?changed:item)};
          currentRef.current=updated;setCurrent(updated);
        }
        pickSlide(changed);
      }else setPreviewVariant(null);
      setVariantRefreshKey(k=>k+1);
      return true;
    }catch(error){
      setPreviewVariant(null);
      if(error instanceof ApiError&&error.status===409)setExternalChanges(true);
      setError(error instanceof Error?error.message:String(error));
      return false;
    }finally{switchingRef.current=false;setVariantSwitching(false);}
  }
  function updateObject(id: string, patch: Partial<SlideElement>) {
    if (!draft) return;
    editDocument({ ...draft, elements: draft.elements.map(item => item.id === id ? { ...item, ...patch } : item) });
  }
  function deleteObject(id: string) {
    if (!draft) return;
    editDocument({ ...draft, elements: draft.elements.filter(item => item.id !== id && item.parentId !== id) });
    setSelectedIds([]);
  }
  function groupSelection(mode:"group"|"ungroup"){
    const doc=draftRef.current;
    if(!doc||!selectedIds.length)return;
    const ids=new Set(selectedIds);
    if(mode==="group"){
      if(ids.size<2)return;
      const groupId=crypto.randomUUID();
      const groupName="Groupe "+(new Set(doc.elements.map(e=>e.groupId).filter(Boolean)).size+1);
      editDocument({...doc,elements:doc.elements.map(e=>
        ids.has(e.id)&&!e.locked?{...e,groupId,groupName}:e)},"layers");
    }else{
      const groups=new Set(doc.elements.filter(e=>ids.has(e.id)&&e.groupId).map(e=>e.groupId));
      editDocument({...doc,elements:doc.elements.map(e=>
        ids.has(e.id)||(e.groupId&&groups.has(e.groupId))
        ?{...e,groupId:undefined,groupName:undefined}:e)},"layers");
    }
  }
  function connectSelection(){
    const doc=draftRef.current;
    if(!doc||selectedIds.length!==2)return;
    const connector=makeSmartConnector(doc,selectedIds[0]!,selectedIds[1]!,crypto.randomUUID());
    editDocument({...doc,elements:[connector,...doc.elements]},"connector");
    setSelectedIds([connector.id]);
  }
  function animateSelection(){
    const doc=draftRef.current;
    if(!doc||!selectedIds.length)return;
    const ids=selectedIds.filter(id=>doc.elements.some(e=>e.id===id&&!e.hidden));
    if(!ids.length)return;
    const additions=ids.map((id,i)=>({
      id:crypto.randomUUID(),targetElementId:id,order:doc.animations.length+i,
      trigger:"click" as const,effect:"fade" as const,durationMs:400,
    }));
    editDocument({...doc,animations:[...doc.animations,...additions]},"animations");
    setAnimationPanelOpen(true);
  }
  function removeSelection() {
    const doc=draftRef.current;
    if(!doc||!selectedIds.length)return;
    const removed=new Set(selectedIds.filter(id=>!doc.elements.find(e=>e.id===id)?.locked));
    for(const element of doc.elements){
      if((element.linkFrom&&removed.has(element.linkFrom))||
        (element.linkTo&&removed.has(element.linkTo)))removed.add(element.id);
    }
    let changed=true;
    while(changed){
      changed=false;
      for(const e of doc.elements)if(e.parentId&&removed.has(e.parentId)&&!removed.has(e.id)){removed.add(e.id);changed=true;}
    }
    editDocument({...doc,elements:doc.elements.filter(e=>!removed.has(e.id)),animations:doc.animations.filter(a=>!a.targetElementId||!removed.has(a.targetElementId))},"delete");
    setSelectedIds([]);
  }
  function copySelection() {
    const doc=draftRef.current;if(!doc||!selectedIds.length)return;
    const {document:next,created}=duplicateElements(doc,selectedIds.filter(id=>!doc.elements.find(e=>e.id===id)?.locked),()=>crypto.randomUUID());
    editDocument(next,"duplicate");setSelectedIds(created);
  }
  function arrangeSelection(direction:"front"|"back"|"forward"|"backward") {
    const doc=draftRef.current;if(!doc||!selectedIds.length)return;
    const list=[...doc.elements],members=new Set(selectedIds.filter(id=>!doc.elements.find(e=>e.id===id)?.locked));
    let elements:typeof list;
    if(direction==="front"||direction==="back"){
      const selected=list.filter(e=>members.has(e.id)),remaining=list.filter(e=>!members.has(e.id));
      elements=direction==="front"?[...remaining,...selected]:[...selected,...remaining];
    }else{
      elements=[...list];
      const order=direction==="forward"?[...Array(elements.length).keys()].reverse():[...Array(elements.length).keys()];
      for(const i of order){
        const next=i+(direction==="forward"?1:-1);
        if(next<0||next>=elements.length)continue;
        if(members.has(elements[i]!.id)&&!members.has(elements[next]!.id)){
          const temp=elements[i]!;elements[i]=elements[next]!;elements[next]=temp;
        }
      }
    }
    editDocument({...doc,elements},"layers");
  }
  function alignSelection(kind:"left"|"right"|"center"|"top"|"middle"|"bottom") {
    const doc=draftRef.current;
    if(doc)editDocument(alignElements(doc,selectedIds.filter(id=>!doc.elements.find(e=>e.id===id)?.locked),kind),"align");
  }
  function distributeSelection(axis:"horizontal"|"vertical"){
    const doc=draftRef.current;
    if(doc)editDocument(distributeElements(doc,selectedIds,axis),"distribute");
  }
  function nudgeSelection(dx:number,dy:number){
    const doc=draftRef.current;if(!doc||!selectedIds.length)return;
    const changes:Record<string,Box>={};
    for(const id of selectedIds){
      const element=doc.elements.find(e=>e.id===id);
      if(element&&!element.locked&&!element.hidden){const box=worldBox(element,doc);changes[id]=transformBox(box,dx,dy,"move",0);}
    }
    if(Object.keys(changes).length)editDocument(withElementBoxes(doc,changes),"nudge");
  }
  async function reorderSlide(fromId:string,toId:string) {
    if (!current||fromId===toId||!await flushPending())return;
    const ids=current.slides.map(s=>s.id),from=ids.indexOf(fromId),to=ids.indexOf(toId);
    if(from<0||to<0)return;
    const [moved]=ids.splice(from,1);ids.splice(to,0,moved!);
    setBusy(true);setError("");
    try {
      await command(token,{action:"reorderSlides",presentationId:current.presentation.id,orderedIds:ids});
      await loadDeck(current.presentation.id,slideId??undefined);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  async function save():Promise<boolean>{
    if(saveInFlightRef.current)return saveInFlightRef.current;
    if(!dirtyRef.current)return true;
    const operation=async():Promise<boolean>=>{
      const pending=draftRef.current,deck=currentRef.current,pendingId=slideId;
      const pendingNotes=notesRef.current;
      if(!pending||!deck||!pendingId)return false;
      if(externalChanges){setError("Conflit : sauvegardez le brouillon local avant de recharger.");return false;}
      const parsed=SlideDocumentSchema.safeParse(pending);
      if(!parsed.success){setError("Document invalide : "+parsed.error.issues[0]?.message);return false;}
      const old=deck.slides.find(s=>s.id===pendingId);
      if(!old)return false;
      const started=versionRef.current;
      setBusy(true);setError("");
      try{
        const result=await command<{slide:{revision:number;updated_at:string}}>(token,{
          action:"saveSlide",id:pendingId,revision:old.revision,document:parsed.data,notes:pendingNotes,
        });
        const latest=currentRef.current;
        if(latest){
          const updated={...latest,slides:latest.slides.map(item=>item.id===pendingId?{
            ...item,document:parsed.data,notes:pendingNotes,revision:result.slide.revision,
            updated_at:result.slide.updated_at,
          }:item)};
          currentRef.current=updated;setCurrent(updated);
        }
        if(versionRef.current===started){dirtyRef.current=false;setDirty(false);}
        setExternalChanges(false);
        return true;
      }catch(e){
        if(e instanceof ApiError&&e.status===409)setExternalChanges(true);
        setError(e instanceof Error?e.message:String(e));return false;
      }finally{setBusy(false);}
    };
    const pending=operation().finally(()=>{if(saveInFlightRef.current===pending)saveInFlightRef.current=null;});
    saveInFlightRef.current=pending;
    return pending;
  }

  async function verifyExportRevision(deck: PresentationDetail) {
    const fresh = await readDeckRevisions(token, deck.presentation.id);
    const changed = fresh.title !== deck.presentation.title ||
      fresh.slides.length !== deck.slides.length ||
      fresh.slides.some((remote, i) => remote.id !== deck.slides[i]?.id ||
        remote.revision !== deck.slides[i]?.revision || remote.position !== deck.slides[i]?.position);
    if (changed) {
      setExternalChanges(true);
      throw new Error("La présentation a changé depuis ChatGPT ou un autre onglet. Actualisez-la avant l'export pour obtenir la bonne version.");
    }
  }

  async function downloadPowerPoint() {
    if (!current || exportBusy) return;
    if(!await flushPending())return;
    const fresh=currentRef.current;
    if(!fresh)return;
    setExportBusy(true); setExportTarget("pptx"); setExportReport(null);
    setExportProgress("Préparation…"); setError("");
    try {
      await verifyExportRevision(fresh);
      const report = await exportPowerPoint(fresh, "editable", ({completed,total})=>
        setExportProgress("Diapositive "+completed+"/"+total), "native");
      setExportReport(report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'exportation n'a pas abouti.");
    } finally { setExportBusy(false); setExportTarget(null); setExportProgress(""); }
  }

  function startGoogleExport() {
    const clientId = getGoogleClientId();
    if (!isValidGoogleClientId(clientId)) {
      setError("La connexion Google n'est pas disponible. Contactez l'administrateur de l'application.");
      return;
    }
    void exportToGoogleSlides(clientId);
  }

  async function exportToGoogleSlides(clientId: string) {
    if (!current || exportBusy) return;
    const deck = current;
    setExportBusy(true); setExportTarget("google");
    setGoogleReport(null); setGoogleExportSlideCount(null); setExportReport(null);
    setExportProgress("Connexion Google…"); setError("");
    try {
      // OAuth must start on the original user click, before the first await.
      const accessToken = await requestGoogleDriveAccess(clientId);
      if(!await flushPending())return;
      const fresh=currentRef.current??deck;
      setExportProgress("Vérification des diapositives…");
      await verifyExportRevision(fresh);
      // Both destinations receive the same PPTX: native animations on compatible
      // editable slides, progressive frames only when native conversion is impossible.
      // Google Drive may still drop some OOXML timing effects during conversion.
      const artifact = await buildPowerPoint(fresh, "editable", ({completed,total})=>
        setExportProgress("Diapositive "+completed+"/"+total), "native");
      setExportProgress("Conversion dans Google Drive…");
      const result = await uploadPowerPointToGoogleSlides(accessToken, artifact.blob, fresh.presentation.title);
      setGoogleExportSlideCount(artifact.slideCount);
      setGoogleReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "La conversion dans Google Slides a échoué.");
    } finally { setExportBusy(false); setExportTarget(null); setExportProgress(""); }
  }

  async function downloadHtml(){
    if(!current||exportBusy)return;
    if(!await flushPending())return;
    const fresh=currentRef.current;
    if(!fresh)return;
    setExportBusy(true);setExportTarget("html");setHtmlExportReport(null);
    setExportProgress("Préparation du HTML/CSS…");setError("");
    try{
      await verifyExportRevision(fresh);
      const archive=await buildHtmlArchive(fresh);
      const downloadUrl=URL.createObjectURL(archive.blob);
      const anchor=document.createElement("a");
      anchor.href=downloadUrl;anchor.download=archive.fileName;
      document.body.appendChild(anchor);anchor.click();anchor.remove();
      setHtmlExportReport({fileName:archive.fileName,downloadUrl});
    }catch(e){setError(e instanceof Error?e.message:"L'export HTML/CSS a échoué.");}
    finally{setExportBusy(false);setExportTarget(null);setExportProgress("");}
  }

  const active = current?.slides.find(s=>s.id===slideId);
  const statusText = externalChanges ? "Nouvelle version distante" : dirty ? "Modifications non enregistrées" : "Enregistré";

  useEffect(()=>{
    if(!token||!current?.presentation.id)return;
    let cancelled=false;
    const deckId=current.presentation.id;
    const check=async()=>{
      if(document.visibilityState!=="visible"||busy||exportBusy)return;
      try{
        const revision=await readDeckRevisions(token,deckId);
        if(cancelled||currentRef.current?.presentation.id!==deckId)return;
        const local=currentRef.current!;
        const changed=revision.title!==local.presentation.title||
          revision.slides.length!==local.slides.length||
          revision.slides.some((s,i)=>s.id!==local.slides[i]?.id||s.revision!==local.slides[i]?.revision||s.position!==local.slides[i]?.position);
        if(!changed)return;
        if(dirtyRef.current){setExternalChanges(true);return;}
        const updated=await readPresentation(token,deckId);
        if(cancelled||dirtyRef.current)return;
        setCurrent(updated);
        const wanted=updated.slides.find(s=>s.id===slideId)??updated.slides[0];
        pickSlide(wanted);
        void refreshList().catch(()=>{});
      }catch{/* Transient network issues do not discard local work. */}
    };
    const timer=window.setInterval(()=>void check(),9000);
    const onFocus=()=>void check();
    window.addEventListener("focus",onFocus);
    const onVisibility=()=>{if(document.visibilityState==="visible")void check();};
    document.addEventListener("visibilitychange",onVisibility);
    return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener("focus",onFocus);
      document.removeEventListener("visibilitychange",onVisibility);};
  },[token,current?.presentation.id,slideId,busy,exportBusy]);

  useEffect(()=>{
    if(!dirty||busy||exportBusy||externalChanges||!current||!draft)return;
    const timer=window.setTimeout(()=>void save(),1900);
    return()=>window.clearTimeout(timer);
  },[dirty,busy,exportBusy,externalChanges,current?.presentation.id,slideId,draft,notes]);

  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if(!draftRef.current||!currentRef.current)return;
      const target=e.target instanceof HTMLElement?e.target:null;
      const writing=!!target?.closest("input, textarea, select, [contenteditable='true']");
      const mod=e.ctrlKey||e.metaKey;
      if(mod&&e.key.toLowerCase()==="s"){e.preventDefault();void save();return;}
      if(writing||target?.closest(".slide-list"))return;
      if(mod&&e.key.toLowerCase()==="z"){e.preventDefault();e.shiftKey?redo():undo();return;}
      if(mod&&e.key.toLowerCase()==="y"){e.preventDefault();redo();return;}
      if(mod&&e.key.toLowerCase()==="d"){e.preventDefault();copySelection();return;}
      if(e.key==="Delete"||e.key==="Backspace"){if(selectedIds.length){e.preventDefault();removeSelection();}return;}
      if(e.key.startsWith("Arrow")&&selectedIds.length){
        e.preventDefault();const step=e.shiftKey?10:1;
        nudgeSelection(e.key==="ArrowRight"?step:e.key==="ArrowLeft"?-step:0,e.key==="ArrowDown"?step:e.key==="ArrowUp"?-step:0);
      }
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[selectedIds,dirty,current?.presentation.id,notes,busy,externalChanges]);

  if (!token) return (
    <main className="login-screen">
      <form className="login-card" onSubmit={login}>
        <div className="brand-chip">◆</div>
        <h1>Diaporama de singe</h1>
        <p>Espace personnel · édition ChatGPT</p>
        <label htmlFor="access-code">Code d'accès privé</label>
        <input id="access-code" type="password" autoComplete="off" value={entry} onChange={e => setEntry(e.target.value)} placeholder="Code d'accès" autoFocus />
        <button type="submit" className="primary" disabled={loginBusy || !entry.trim()}>{loginBusy ? "Vérification…" : "Ouvrir l'atelier"}</button>
        <ErrorMessage text={error} clear={() => setError("")} />
        <small>Ce code reste dans votre session de navigateur. Les présentations sont conservées dans Neon.</small>
      </form>
    </main>
  );

  return (
    <div className={"app app-slides-style "+(current?"is-editing":"is-library")}>
      <main className="workspace">
        <header className="topbar slides-header">
          <button className="app-brand" title="Retour à l'accueil"
            aria-label="Diaporama de singe : accueil" onClick={()=>void goHome()}>
            <span className="identity-mark">◆</span>
            <span>Diaporama de singe</span>
          </button>
          <div className="slides-header-current">
            {current ? <>
              {editingDeckTitle?
                <input autoFocus className="inline-deck-title" aria-label="Titre de la présentation"
                  value={newDeckTitle} maxLength={180}
                  onChange={e=>setNewDeckTitle(e.target.value)}
                  onBlur={()=>{if(newDeckTitle.trim()&&newDeckTitle.trim()!==current.presentation.title)
                    void renameDeck(current.presentation.id,newDeckTitle);setEditingDeckTitle(false);}}
                  onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();
                    if(e.key==="Escape"){setNewDeckTitle(current.presentation.title);setEditingDeckTitle(false);}}}/>:
                <button className="presentation-title" title="Cliquer pour renommer"
                  onClick={()=>{setNewDeckTitle(current.presentation.title);setEditingDeckTitle(true);}}>
                  {current.presentation.title} <span>✎</span>
                </button>}
              <small className={dirty||externalChanges?"dirty-indicator":"saved-indicator"}
                aria-live="polite">{externalChanges?"Conflit de version":dirty?"Enregistrement automatique…":"✓ Enregistré"}</small>
            </> : <span className="library-header-label">Mes présentations</span>}
          </div>
          <div className="slides-header-actions">
            {!current && <button className="subtle-btn" onClick={()=>setImportOpen(true)}
              disabled={busy}>⇧ Importer</button>}
            {current&&<>
              <button className="subtle-btn present-action" onClick={()=>setPresenting(true)}
                disabled={!current.slides.length}>▶ Présenter</button>
              <details className="slides-export-menu">
                <summary>↓ Exporter</summary>
                <div className="slides-export-options">
                  <button onClick={e=>{e.currentTarget.closest("details")?.removeAttribute("open");void downloadPowerPoint();}}
                    disabled={exportBusy||busy||!current.slides.length}>PowerPoint (.pptx)</button>
                  <button onClick={e=>{e.currentTarget.closest("details")?.removeAttribute("open");startGoogleExport();}}
                    disabled={exportBusy||busy||!current.slides.length}>Google Slides</button>
                  <button onClick={e=>{e.currentTarget.closest("details")?.removeAttribute("open");void downloadHtml();}}
                    disabled={exportBusy||busy||!current.slides.length}>HTML / CSS</button>
                </div>
              </details>
              <details className="slides-extra-actions">
                <summary title="Autres actions">⋯</summary>
                <div>
                  <button onClick={()=>{setImproveOpen(true);}}>Améliorer la présentation</button>
                  <button onClick={()=>{setImportOpen(true);}}>Importer</button>
                  <button onClick={()=>{setNewDeckTitle(current.presentation.title);setEditingDeckTitle(true);}}>Renommer</button>
                </div>
              </details>
            </>}
            <button className="subtle-btn creation-settings-open" title="Instructions de création des diapositives"
              onClick={()=>setCreationSettingsOpen(true)}>⚙ Paramètres</button>
            <button className="text-btn slides-logout" onClick={()=>void logout()}>Quitter</button>
          </div>
        </header>
        <ErrorMessage text={error} clear={()=>setError("")}/>
        {!current ? (
          <HomeLibrary token={token} decks={decks} folders={folders} busy={busy}
            onOpen={id=>void openDeck(id)}
            onCreateDeck={id=>void createDeck(id)}
            onCreateFolder={createFolder} onRenameFolder={renameFolder}
            onDeleteFolder={deleteFolder} onMoveDeck={moveDeck} onMoveFolder={moveFolder}
            onRenameDeck={renameDeck} onDeleteDeck={deleteDeck}/>
        ) : (
          <div className="editing-area">
            {externalChanges && <div className="external-banner" role="alert"><strong>Modifications détectées depuis le MCP ou un autre onglet.</strong>
              <span>Conservez votre brouillon local avant de charger la version distante.</span>
              {dirty&&<button className="subtle-btn" onClick={backupDraft}>Exporter le brouillon JSON</button>}
              <button className="subtle-btn" onClick={()=>{if(window.confirm("Recharger la version distante ? Les modifications locales non enregistrées seront perdues.")){setExternalChanges(false);void loadDeck(current.presentation.id,slideId??undefined);}}}>Charger la version distante</button>
            </div>}
            {exportReport && <div className="export-report" role="status">
              <div><strong>PowerPoint prêt</strong><button type="button" aria-label="Fermer" onClick={()=>setExportReport(null)}>×</button></div>
              <a className="export-download-link" href={exportReport.downloadUrl} download={exportReport.fileName}>↓ Télécharger · {exportReport.slideCount} diapositive{exportReport.slideCount>1?"s":""}</a>
              {!!exportReport.warnings.length&&<details><summary>{exportReport.warnings.length} précisions de compatibilité</summary>
                <ul>{exportReport.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>
              </details>}
            </div>}
            {googleReport&&<div className="export-report" role="status">
              <div><strong>Google Slides prêt</strong><button aria-label="Fermer" onClick={()=>setGoogleReport(null)}>×</button></div>
              <a href={googleReport.url} target="_blank" rel="noopener noreferrer">Ouvrir dans Google Slides</a>
            </div>}
            {htmlExportReport&&<div className="export-report" role="status">
              <div><strong>Archive HTML/CSS prête</strong><button aria-label="Fermer" onClick={()=>setHtmlExportReport(null)}>×</button></div>
              <a href={htmlExportReport.downloadUrl} download={htmlExportReport.fileName}>↓ Télécharger le fichier</a>
            </div>}
            <div className={"editor-layout"+(!showSlideRail?" slide-rail-collapsed":"")+(!showInspector?" inspector-collapsed":"")}>
              {showSlideRail&&<aside className="slide-rail">
                <div className="rail-heading"><span>DIAPOSITIVES</span><button onClick={() => void slideAction("addSlide")} disabled={busy}>+</button></div>
                <div className="slide-list" role="region" aria-label="Liste des diapositives" tabIndex={0}>
                {current.slides.map((s, i) =>
                  <button key={s.id} draggable className={"slide-tile " + (s.id === slideId ? "selected" : "")}
                    onDragStart={e=>{e.dataTransfer.setData("text/x-singe-slide",s.id);e.dataTransfer.effectAllowed="move";}}
                    onDragOver={e=>e.preventDefault()}
                    onDrop={e=>{e.preventDefault();const source=e.dataTransfer.getData("text/x-singe-slide");if(source)void reorderSlide(source,s.id);}}
                    onClick={() => void navigateToSlide(s)}>
                    <div className="slide-mini"><SlideThumbnail document={s.document} index={i+1}/></div>
                    <span>Diapositive {i + 1}</span>
                  </button>
                )}
                </div>
                {active && <div className="rail-tools">
                  <button onClick={() => void slideAction("duplicateSlide")} disabled={busy}>Dupliquer</button>
                  <button onClick={() => void slideAction("deleteSlide")} disabled={busy} className="danger-text">Supprimer</button>
                </div>}
              </aside>}
              <section className="editor-main">
                {draft ? <>
                  <div className="visual-toolbar" style={previewVariant?{pointerEvents:"none",opacity:.55}:undefined}>
                    <div className="visual-toolbar-group">
                      <button onClick={()=>setShowSlideRail(v=>!v)} title="Afficher ou masquer les diapositives">{showSlideRail?"☰ Diapos":"☰ Pages"}</button>
                      <button onClick={()=>addObject("text")} title="Insérer une zone de texte">+ Texte</button>
                      <button onClick={()=>setImageStudioOpen(true)} title="Rechercher des photographies">+ Image</button>
                       <button onClick={()=>setDiagramStudioOpen(true)} title="Générer un schéma avec des nœuds modifiables">+ Schéma</button>
                      <button onClick={()=>addObject("shape")} title="Insérer une forme">+ Forme</button>
                    </div>
                    <div className="visual-toolbar-group">
                      <button onClick={undo} disabled={historyRef.current.undo.length===0} title="Annuler (Ctrl+Z)">↶</button>
                      <button onClick={redo} disabled={historyRef.current.redo.length===0} title="Rétablir (Ctrl+Y)">↷</button>
                      <button onClick={copySelection} disabled={!selectedIds.length} title="Dupliquer (Ctrl+D)">⧉</button>
                      <button onClick={removeSelection} disabled={!selectedIds.length} title="Supprimer (Suppr)">⌫</button>
                    </div>
                    <div className="visual-toolbar-group">
                      <button onClick={()=>{setRightPane("tools");setShowInspector(true);setTab("layers");}} title="Afficher les calques">Calques</button>
                      <button onClick={()=>setAnimationPanelOpen(v=>!v)} aria-pressed={animationPanelOpen}>Animations</button>
                      <details className="editor-more">
                        <summary>Autres outils ▾</summary>
                        <div className="editor-more-menu">
                          <button onClick={()=>{setRightPane("tools");setShowInspector(true);}}>Propriétés des objets</button>
                          <button onClick={()=>setHistoryStudioOpen(true)}>Historique</button>
                          <button onClick={()=>setShowInspector(v=>!v)}>{showInspector?"Masquer le panneau latéral":"Afficher le panneau latéral"}</button>
                          <button disabled={!selectedIds.length} onClick={animateSelection}>+ Animer la sélection</button>
                          <button disabled={selectedIds.length!==2} onClick={connectSelection}>Relier les objets →</button>
                          <select aria-label="Aligner les objets" defaultValue="" disabled={selectedIds.length<2}
                            onChange={e=>{if(e.target.value==="distribute-h")distributeSelection("horizontal");else if(e.target.value==="distribute-v")distributeSelection("vertical");else if(e.target.value)alignSelection(e.target.value as "left"|"center"|"right"|"top"|"middle"|"bottom");e.target.value="";}}>
                            <option value="">Aligner les objets</option><option value="left">À gauche</option><option value="center">Centrer horizontalement</option>
                            <option value="right">À droite</option><option value="top">En haut</option><option value="middle">Centrer verticalement</option><option value="bottom">En bas</option><option value="distribute-h">Répartir horizontalement</option><option value="distribute-v">Répartir verticalement</option>
                          </select>
                          <label className="snap-control"><input type="checkbox" checked={grid>0} onChange={e=>setGrid(e.target.checked?10:0)}/> Grille d'alignement</label>
                        </div>
                      </details>
                    </div>
                  </div>
                  <div className="canvas-stage-shell">
                    <VisualCanvas document={previewVariant?.document??draft} selectedIds={previewVariant?[]:selectedIds}
                      onSelect={setSelectedIds} onChange={editDocument} zoom={zoom} grid={grid} readOnly={Boolean(previewVariant)}/>
                  </div>
                  <div className="canvas-statusbar">
                    <span>Diapositive {current.slides.findIndex(slide=>slide.id===slideId)+1} / {current.slides.length} · {draft.canvas.width} × {draft.canvas.height}
                    {variantSwitching?" · Enregistrement du choix…":""}</span>
                    <div className="canvas-zoom-controls">
                      <button type="button" aria-label="Réduire le zoom" onClick={()=>setZoom(v=>Math.max(.25,Math.round((v-.1)*100)/100))}>−</button>
                      <button type="button" onClick={()=>setZoom(1)} aria-pressed={zoom===1}>Ajuster</button>
                      <span>{Math.round(zoom*100)} %</span>
                      <button type="button" aria-label="Augmenter le zoom" onClick={()=>setZoom(v=>Math.min(8,Math.round((v+.1)*100)/100))}>+</button>
                      <button type="button" onClick={()=>{
                        const w=document.querySelector<HTMLElement>(".visual-viewport")?.clientWidth??800;
                        const h=document.querySelector<HTMLElement>(".visual-viewport")?.clientHeight??450;
                        const fit=Math.min(Math.max(40,w-40)/draft.canvas.width,Math.max(40,h-40)/draft.canvas.height);
                        setZoom(Math.min(8,Math.max(.25,1/fit)));
                      }}>100 % réel</button>
                    </div>
                  </div>
                  {animationPanelOpen&&!previewVariant&&<div className="editor-animation-drawer"><AnimationTimeline document={draft} selectedIds={selectedIds}
                    onChange={editDocument} onSelect={setSelectedIds} onPreview={()=>setPresenting(true)}/></div>}
                  <SpeakerNotesPane value={previewVariant?.notes??notes} readOnly={variantSwitching}
                    onChange={value=>{versionRef.current++;notesRef.current=value;setNotes(value);dirtyRef.current=true;setDirty(true);}}/>
                </> : <div className="no-slide">Aucune diapositive. <button className="primary" onClick={() => void slideAction("addSlide")}>Ajouter une diapositive</button></div>}
              </section>
              {draft&&showInspector&&<section className="editor-sidebar">
                <div className="editor-sidebar-tabs" role="group" aria-label="Panneau latéral">
                  <button aria-pressed={rightPane==="variants"||Boolean(previewVariant)} onClick={()=>setRightPane("variants")}>◆ Variantes</button>
                  <button aria-pressed={rightPane==="tools"&&!previewVariant} onClick={()=>{if(!variantSwitching){setRightPane("tools");setPreviewVariant(null);}}}>Outils</button>
                </div>
                {rightPane==="variants"||previewVariant?
                  <VariantGallery token={token} slideId={slideId} items={variants.items} original={variants.original} loading={variants.loading} error={variants.error}
                    selectedId={previewVariant?.id??draft.variantSelection?.activeId??null}
                    currentDocument={previewVariant?.document??draft} dirty={dirty} disabled={variantSwitching}
                    onSelect={variant=>{void selectVariant(variant);}} onCompare={()=>setVariantsStudioOpen(true)}/>:
                  <PropertiesPanel document={draft} selectedIds={selectedIds} onSelect={setSelectedIds}
                    onChange={editDocument} tab={tab} onTabChange={setTab}
                    onAdd={type=>type==="image"?setImageStudioOpen(true):addObject(type)} onDelete={removeSelection} onArrange={arrangeSelection}
                    onOpenImages={()=>setImageStudioOpen(true)} onGroup={groupSelection}/>}
              </section>}
            </div>
          </div>
        )}

        {creationSettingsOpen&&token&&<CreationInstructionsStudio token={token}
          presentationId={current?.presentation.id} presentationTitle={current?.presentation.title}
          onClose={()=>setCreationSettingsOpen(false)}/>}
        {improveOpen&&token&&current&&<ImprovementStudio token={token} detail={current}
          onClose={()=>setImproveOpen(false)} onCreated={async id=>{await refreshList();await loadDeck(id);}}/>}
        {importOpen&&token&&<ImportStudio token={token} onClose={()=>setImportOpen(false)}
          onCreated={async id=>{await refreshList();await loadDeck(id);}}/>}
        {diagramStudioOpen&&current&&<DiagramStudio onClose={()=>setDiagramStudioOpen(false)}
          onCreate={createDiagramSlide}/>}
        {imageStudioOpen&&token&&<ImageStudio token={token} onClose={()=>setImageStudioOpen(false)}
          selectedImage={selectedIds.length===1?draft?.elements.find(e=>e.id===selectedIds[0]&&e.type==="image"):undefined}
          onPick={chooseImage}/>}
        {historyStudioOpen&&token&&slideId&&current&&active&&<HistoryStudio key={slideId} token={token}
          slideId={slideId} revision={active.revision} dirty={dirty} onClose={()=>setHistoryStudioOpen(false)}
          onRestored={async()=>{await loadDeck(current.presentation.id,slideId);await refreshList();}}/>}
        {variantsStudioOpen&&token&&slideId&&draft&&<VariantsStudio key={slideId} token={token}
          slideId={slideId} document={draft} notes={notes} dirty={dirty} onSelectStored={selectVariant}
          onClose={()=>{setVariantsStudioOpen(false);setVariantRefreshKey(x=>x+1);}}/>}
        {presenting&&current&&current.slides.length>0&&<PresenterStudio
          detail={{...current,slides:current.slides.map(s=>s.id===slideId&&draft?
            {...s,document:draft,notes}:s)}}
          initialSlideId={slideId} onClose={()=>setPresenting(false)}/>}
        <footer className="footer">Diaporama de singe · Version ChatGPT <span>Neon · Netlify</span></footer>
      </main>
    </div>
  );
}
