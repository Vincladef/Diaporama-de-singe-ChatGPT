import { useEffect, useMemo, useRef, useState } from "react";
import { SlideDocumentSchema, type SlideDocument, type SlideElement } from "./domain/slide";
import { VisualCanvas } from "./editor/VisualCanvas";
import { AnimationTimeline } from "./editor/AnimationTimeline";
import { PresenterStudio } from "./presenter/PresenterStudio";
import { PropertiesPanel, type InspectorTab } from "./editor/PropertiesPanel";
import { SlideThumbnail } from "./editor/SlideThumbnail";
import { ImageStudio } from "./editor/ImageStudio";
import { VariantsStudio } from "./editor/VariantsStudio";
import { HistoryStudio } from "./editor/HistoryStudio";
import { ImportStudio } from "./import/ImportStudio";
import { ImprovementStudio } from "./improve/ImprovementStudio";
import { QualityStudio } from "./quality/QualityStudio";
import type { ImageCandidate } from "./images/search";
import { alignElements, distributeElements, duplicateElements, transformBox, withElementBoxes, worldBox, type Box } from "./editor/geometry";
import { buildPowerPoint, exportPowerPoint, type ExportReport, type PowerPointMode } from "./export/pptx";
import { inspectExport, isNativePptxObject } from "./export/preflight";
import {makeSmartConnector,refreshSmartConnectors} from "./graphics/connectors";
import { canUseNativeAnimations } from "./export/nativeAnimations";
import type { RevealExportMode } from "./export/reveals";
import {
  getGoogleClientId, isValidGoogleClientId, requestGoogleDriveAccess,
  uploadPowerPointToGoogleSlides, type GoogleSlidesResult,
} from "./export/googleSlides";
import { ApiError, command, listPresentations, readPresentation, readDeckRevisions, type DeckSummary, type PresentationDetail, type SlideRecord } from "./lib/api";

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
  const [current, setCurrent] = useState<PresentationDetail | null>(null);
  const [slideId, setSlideId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SlideDocument | null>(null);
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<InspectorTab>("design");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [imageStudioOpen,setImageStudioOpen]=useState(false);
  const [variantsStudioOpen,setVariantsStudioOpen]=useState(false);
  const [historyStudioOpen,setHistoryStudioOpen]=useState(false);
  const [presenting,setPresenting]=useState(false);
  const [importOpen,setImportOpen]=useState(false);
  const [improveOpen,setImproveOpen]=useState(false);
  const [qualityOpen,setQualityOpen]=useState(false);
  const [animationPanelOpen,setAnimationPanelOpen]=useState(false);
  const [showDeckSidebar,setShowDeckSidebar]=useState(true);
  const [showSlideRail,setShowSlideRail]=useState(true);
  const [showInspector,setShowInspector]=useState(true);
  const [zoom, setZoom] = useState(1);
  const [grid, setGrid] = useState(10);
  const [autoSave, setAutoSave] = useState(true);
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
  const [exportMode, setExportMode] = useState<PowerPointMode>(() =>
    new URLSearchParams(window.location.search).get("export") === "faithful" ? "faithful" : "editable");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [exportReport, setExportReport] = useState<ExportReport | null>(null);
  const [exportTarget, setExportTarget] = useState<"pptx" | "google" | null>(null);
  const [googleReport, setGoogleReport] = useState<GoogleSlidesResult | null>(null);
  const [googleExportSlideCount, setGoogleExportSlideCount] = useState<number | null>(null);
  const [revealExportMode, setRevealExportMode] = useState<RevealExportMode>("steps");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listPresentations(token).then(items => {
      if (cancelled) return;
      setDecks(items);
      const remembered = new URLSearchParams(window.location.search).get("deck") ?? sessionStorage.getItem(DECK_KEY);
      if (remembered && items.some(item => item.id === remembered)) {
        void readPresentation(token, remembered).then(data => {
          if (!cancelled) {
            setCurrent(data);
            const first = data.slides[0];
            pickSlide(first);
          }
        }).catch(e => { if (!cancelled) setError(String(e.message ?? e)); });
      }
    }).catch(e => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "Accès impossible.");
      if (e instanceof ApiError && e.status === 401) { sessionStorage.removeItem(SESSION_KEY); setToken(""); }
    });
    return () => { cancelled = true; };
  }, [token]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    const key = entry.trim();
    if (!key) return;
    setLoginBusy(true); setError("");
    try {
      const items = await listPresentations(key);
      sessionStorage.setItem(SESSION_KEY, key);
      setDecks(items);
      setEntry(""); setToken(key);
    } catch (e) { setError(e instanceof Error ? e.message : "Connexion impossible."); }
    finally { setLoginBusy(false); }
  }

  async function logout() {
    if (!await flushPending()) return;
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(DECK_KEY);
    setToken(""); setDecks([]); setCurrent(null); setSlideId(null); setDraft(null); draftRef.current=null; setNotes(""); setDirty(false); setSelectedIds([]);
  }

  function pickSlide(slide?: SlideRecord) {
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
  async function refreshList() { setDecks(await listPresentations(token)); }
  async function loadDeck(id: string, preferred?: string) {
    const detail = await readPresentation(token, id);
    setCurrent(detail);
    sessionStorage.setItem(DECK_KEY, id);
    pickSlide(detail.slides.find(s => s.id === preferred) ?? detail.slides[0]);
  }
  async function openDeck(id: string) {
    if (!await flushPending()) return;
    setBusy(true); setError("");
    try { await loadDeck(id); } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  }
  async function createDeck() {
    const title = window.prompt("Titre de la présentation", "Sans titre");
    if (!title?.trim() || !await flushPending()) return;
    setBusy(true); setError("");
    try {
      const response = await command<{ presentation: { id: string } }>(token, { action: "createPresentation", title: title.trim() });
      await refreshList(); await loadDeck(response.presentation.id);
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  }
  async function renameDeck() {
    if (!current) return;
    const title = window.prompt("Nouveau titre", current.presentation.title);
    if (!title?.trim()) return;
    setBusy(true); setError("");
    try {
      await command(token, { action: "renamePresentation", id: current.presentation.id, title: title.trim() });
      setCurrent({ ...current, presentation: { ...current.presentation, title: title.trim() } });
      await refreshList();
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  }
  async function deleteDeck() {
    if (!current || !window.confirm("Supprimer cette présentation et toutes ses diapositives ?")) return;
    setBusy(true); setError("");
    try {
      await command(token, { action: "deletePresentation", id: current.presentation.id });
      setCurrent(null); setDraft(null); setDirty(false); setSlideId(null); sessionStorage.removeItem(DECK_KEY);
      await refreshList();
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
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
      const next:SlideDocument=single?
        {...doc,elements:doc.elements.map(e=>e.id===id?{...e,src:photo.imageUrl}:e)}:
        {...doc,mode:doc.mode==="freeform"?"hybrid":doc.mode,
          elements:[...doc.elements,{id,type:"image",src:photo.imageUrl,
            styles:{left:"120px",top:"210px",width:"1000px",height:"600px",objectFit:"cover",objectPosition:"50% 50%"}}]};
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
  function applyVariant(document:SlideDocument,variantNotes:string){
    editDocument(document,"variant");notesRef.current=variantNotes;setNotes(variantNotes);setSelectedIds([]);
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
      const pptxReveals = revealExportMode==="steps" && exportMode==="editable" ? "native" : revealExportMode;
      const report = await exportPowerPoint(fresh, exportMode, ({ completed, total }) =>
        setExportProgress("Écran " + completed + "/" + total), pptxReveals);
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
      const pptxReveals = revealExportMode==="steps" && exportMode==="editable" ? "native" : revealExportMode;
      const artifact = await buildPowerPoint(fresh, exportMode, ({ completed, total }) =>
        setExportProgress("Écran " + completed + "/" + total), pptxReveals);
      setExportProgress("Conversion dans Google Drive…");
      const result = await uploadPowerPointToGoogleSlides(accessToken, artifact.blob, fresh.presentation.title);
      setGoogleExportSlideCount(artifact.slideCount);
      setGoogleReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "La conversion dans Google Slides a échoué.");
    } finally { setExportBusy(false); setExportTarget(null); setExportProgress(""); }
  }

  const active = current?.slides.find(s=>s.id===slideId);
  const statusText = externalChanges ? "Nouvelle version distante" : dirty ? "Modifications non enregistrées" : "Enregistré";
  const exportPreview=useMemo(()=>{
    if(!current)return null;
    const sources=current.slides.map(slide=>slide.id===slideId&&draft?
      {...slide,document:draft,notes}:slide);
    return {report:inspectExport(sources),
      objects:sources.map(slide=>({
        total:slide.document.elements.filter(e=>!e.hidden).length,
        native:slide.document.elements.filter(e=>!e.hidden&&isNativePptxObject(e)).length,
        animations:slide.document.animations.length,
        office:canUseNativeAnimations(slide.document),
      }))};
  },[current,slideId,draft,notes]);

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
    if(!autoSave||!dirty||busy||exportBusy||externalChanges||!current||!draft)return;
    const timer=window.setTimeout(()=>void save(),1900);
    return()=>window.clearTimeout(timer);
  },[autoSave,dirty,busy,exportBusy,externalChanges,current?.presentation.id,slideId,draft,notes]);

  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if(!draftRef.current||!currentRef.current)return;
      const target=e.target instanceof HTMLElement?e.target:null;
      const writing=!!target?.closest("input, textarea, select, [contenteditable='true']");
      const mod=e.ctrlKey||e.metaKey;
      if(mod&&e.key.toLowerCase()==="s"){e.preventDefault();void save();return;}
      if(writing)return;
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
    <div className={"app"+(!showDeckSidebar?" deck-sidebar-collapsed":"")}>
      <aside className="sidebar">
        <div className="identity"><span className="identity-mark">◆</span><strong>Diaporama<br />de singe</strong></div>
        <div className="edition">ÉDITION CHATGPT</div>
        <div className="list-heading"><span>PRÉSENTATIONS</span><button onClick={() => void createDeck()} disabled={busy} title="Nouvelle présentation">+</button></div>
        <div className="deck-list">
          {decks.map(deck =>
            <button key={deck.id} className={"deck-item " + (current?.presentation.id === deck.id ? "active" : "")}
              onClick={() => void openDeck(deck.id)} disabled={busy}>
              <span className="deck-name">{deck.title}</span>
              <small>{deck.slide_count} diapo{deck.slide_count !== 1 ? "s" : ""}</small>
            </button>
          )}
          {decks.length === 0 && <p className="sidebar-hint">Aucune présentation</p>}
        </div>
        <div className="sidebar-bottom">
          <span className="connected-dot" /> Stockage privé
          <button className="text-btn logout" onClick={() => void logout()}>Quitter</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="subtle-btn panel-toggle" aria-label={showDeckSidebar?"Masquer la liste des présentations":"Afficher les présentations"}
            aria-pressed={showDeckSidebar} onClick={()=>setShowDeckSidebar(v=>!v)}>☰</button>
          <div className="breadcrumb">{current ? current.presentation.title : "Mes présentations"}</div>
          <button className="subtle-btn import-top-button" onClick={()=>setImportOpen(true)} disabled={busy}>⇧ Importer</button>
          {current && <div className="header-actions">
            <button className="subtle-btn" onClick={()=>setImproveOpen(true)} disabled={busy}>✦ Améliorer</button>
            <button className="subtle-btn" onClick={() => void renameDeck()} disabled={busy}>Renommer</button>
            <button className="subtle-btn danger-text" onClick={() => void deleteDeck()} disabled={busy}>Supprimer</button>
          </div>}
        </header>
        <ErrorMessage text={error} clear={() => setError("")} />
        {!current ? (
          <section className="home-content">
            <span className="eyebrow">ATELIER DE CRÉATION · HTML/CSS</span>
            <h1>Vos présentations.</h1>
            <p>Créez une présentation, puis composez librement chaque diapositive.</p>
            <button className="primary" onClick={() => void createDeck()} disabled={busy}>+ Nouvelle présentation</button>
          </section>
        ) : (
          <div className="editing-area">
            <div className="editor-topline">
              <div><strong>{current.presentation.title}</strong><span> {current.slides.length} diapositive{current.slides.length > 1 ? "s" : ""}</span></div>
              <div className="save-row">
                <span className={dirty||externalChanges ? "dirty-indicator" : "saved-indicator"}>{statusText}</span>
                <label className="auto-save-option"><input type="checkbox" checked={autoSave} onChange={e=>setAutoSave(e.target.checked)}/> Auto</label>
                <button className="primary small-primary" onClick={() => void save()} disabled={!dirty || busy || !active || exportBusy}>Enregistrer</button>
                <button className="subtle-btn" onClick={()=>setQualityOpen(true)} disabled={!current.slides.length}>✓ Vérifier</button>
                <button className="subtle-btn present-action" onClick={()=>setPresenting(true)} disabled={!current.slides.length}>▶ Présenter</button>
                <label className="export-mode-label" htmlFor="export-mode">Export
                  <select id="export-mode" value={exportMode} disabled={exportBusy || busy}
                    onChange={e => setExportMode(e.target.value as PowerPointMode)}>
                    <option value="faithful">Visuel fidèle</option>
                    <option value="editable">Objets modifiables (recommandé)</option>
                  </select>
                </label>
                <label className="reveal-export-toggle" title="PPTX et Google Slides utilisent le même fichier. Animations natives pour les objets compatibles ; étapes de repli pour les compositions complexes. Google peut modifier les effets à la conversion.">
                  <input type="checkbox" checked={revealExportMode === "steps"} disabled={exportBusy || busy}
                    onChange={e => setRevealExportMode(e.target.checked ? "steps" : "static")} />
                  Étapes au clic
                </label>
                <button className="subtle-btn export-action" onClick={() => void downloadPowerPoint()} disabled={exportBusy || busy || !current.slides.length}>
                  {exportBusy && exportTarget === "pptx" ? (exportProgress || "Export en cours…") : "Télécharger PPTX"}
                </button>
                <button className="subtle-btn google-export-action" onClick={startGoogleExport}
                  disabled={exportBusy || busy || !current.slides.length} title="Créer une présentation dans votre Google Drive">
                  {exportBusy && exportTarget === "google" ? (exportProgress || "Conversion…") : "Exporter vers Google Slides"}
                </button>
              </div>
            </div>
            {externalChanges && <div className="external-banner" role="alert"><strong>Modifications détectées depuis le MCP ou un autre onglet.</strong>
              <span>Conservez votre brouillon local avant de charger la version distante.</span>
              {dirty&&<button className="subtle-btn" onClick={backupDraft}>Exporter le brouillon JSON</button>}
              <button className="subtle-btn" onClick={()=>{if(window.confirm("Recharger la version distante ? Les modifications locales non enregistrées seront perdues.")){setExternalChanges(false);void loadDeck(current.presentation.id,slideId??undefined);}}}>Charger la version distante</button>
            </div>}
            {exportPreview&&<details className="export-preflight">
              <summary>Contrôle avant export : {exportPreview.report.fullyNative} diapo(s) entièrement éditables,
                {" "+exportPreview.report.mixedEditable} mixtes et {exportPreview.report.rasterOnly} aplatie(s)
              </summary>
              <p>Le mode « Visuel fidèle » produit des images. En mode « Objets modifiables »,
                seuls les effets incompatibles sont isolés, sauf pour les compositions imbriquées.
                Google Slides peut modifier certains effets PowerPoint au moment de l'importation.</p>
              <div className="export-preflight-scroll"><table>
                <thead><tr><th>Diapositive</th><th>Modifiabilité</th><th>Animations au clic</th></tr></thead>
                <tbody>{exportPreview.report.slides.map((risk,i)=><tr key={i}>
                  <td>{i+1}</td>
                  <td>{exportMode==="faithful"?"Image entière":
                    risk.mode==="raster"?"Composition aplatie":
                    exportPreview.objects[i]?.native+" / "+exportPreview.objects[i]?.total+" objets natifs"}
                  </td>
                  <td>{exportPreview.objects[i]?.animations===0?"Aucune":
                    exportMode==="faithful"?"Étapes statiques":
                    exportPreview.objects[i]?.office?"Effets PowerPoint natifs possibles":"Étapes de secours"}
                  </td>
                </tr>)}</tbody>
              </table></div>
              {exportPreview.report.warnings.length>0&&
                <p className="export-preflight-disclaimer">{exportPreview.report.warnings.join(" · ")}</p>}
            </details>}
            {exportReport && <div className="export-report" role="status">
              <strong>PowerPoint prêt : {exportReport.fileName}</strong>
              <a className="export-download-link" href={exportReport.downloadUrl} download={exportReport.fileName}>Enregistrer le fichier PowerPoint</a>
              <span>{exportReport.slideCount} diapositive{exportReport.slideCount > 1 ? "s" : ""} · {exportReport.mode === "faithful" ? "Rendu en images" : "Éléments éditables lorsque compatibles"}.</span>
              {exportReport.warnings.length > 0 && <details><summary>{exportReport.warnings.length} précision{exportReport.warnings.length > 1 ? "s" : ""} sur la compatibilité</summary>
                <ul>{exportReport.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
              </details>}
              <span>Vous pouvez aussi utiliser « Exporter vers Google Slides » pour créer une présentation directement dans votre Drive.</span>
            </div>}
            {googleReport && <div className="export-report google-success-report" role="status">
              <strong>Présentation créée dans Google Slides : {googleReport.name}</strong>
              <a href={googleReport.url} target="_blank" rel="noopener noreferrer">Ouvrir la présentation Google Slides</a>
              <span>Conversion à partir du PPTX {exportMode === "faithful" ? "visuel fidèle" : "avec objets éditables lorsque compatibles"}
                {revealExportMode === "steps" && googleExportSlideCount !== null
                  ? " · " + googleExportSlideCount + " diapositives exportées. Le PPTX contient des animations natives quand elles sont compatibles ; Google peut modifier ou supprimer certains effets. Les compositions complexes utilisent des étapes successives."
                  : " · Export statique sans animations Web."}
              </span>
            </div>}
            <div className={"editor-layout"+(!showSlideRail?" slide-rail-collapsed":"")+(!showInspector?" inspector-collapsed":"")}>
              {showSlideRail&&<aside className="slide-rail">
                <div className="rail-heading"><span>DIAPOSITIVES</span><button onClick={() => void slideAction("addSlide")} disabled={busy}>+</button></div>
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
                {active && <div className="rail-tools">
                  <button onClick={() => void slideAction("duplicateSlide")} disabled={busy}>Dupliquer</button>
                  <button onClick={() => void slideAction("deleteSlide")} disabled={busy} className="danger-text">Supprimer</button>
                </div>}
              </aside>}
              <section className="editor-main">
                {draft ? <>
                  <div className="visual-toolbar">
                    <div className="visual-toolbar-group">
                      <button onClick={()=>setShowSlideRail(v=>!v)} title="Afficher ou masquer les diapositives">{showSlideRail?"Masquer les diapos":"Diapos"}</button>
                      <button onClick={()=>{setShowInspector(true);setTab("layers");}} title="Gérer les calques">Calques</button>
                      <button onClick={()=>setShowInspector(v=>!v)} title="Afficher ou masquer l'inspecteur">{showInspector?"Masquer les outils":"Outils"}</button>
                      <button onClick={()=>addObject("text")} title="Insérer une zone de texte">+ Texte</button>
                      <button onClick={()=>setImageStudioOpen(true)} title="Rechercher dans les photothèques">+ Image</button>
                      <button onClick={()=>setVariantsStudioOpen(true)} title="Comparer plusieurs compositions">Variantes</button>
                      <button onClick={()=>setHistoryStudioOpen(true)} title="Afficher l'historique des sauvegardes">Historique</button>
                      <button onClick={()=>setAnimationPanelOpen(v=>!v)} aria-pressed={animationPanelOpen} title="Configurer les animations au clic">Animations</button>
                      <button onClick={animateSelection} disabled={!selectedIds.length} title="Ajouter un fondu au clic sur les calques sélectionnés">+ Animer</button>
                      <button onClick={connectSelection} disabled={selectedIds.length!==2}
                        title="Créer une flèche liée aux deux objets, qui les suit lors de leur déplacement">Relier →</button>
                      <button onClick={()=>addObject("shape")} title="Insérer une forme">+ Forme</button>
                    </div>
                    <div className="visual-toolbar-group">
                      <button onClick={undo} disabled={historyRef.current.undo.length===0} title="Annuler (Ctrl+Z)">↶</button>
                      <button onClick={redo} disabled={historyRef.current.redo.length===0} title="Rétablir (Ctrl+Y)">↷</button>
                      <button onClick={copySelection} disabled={!selectedIds.length} title="Dupliquer (Ctrl+D)">⧉</button>
                      <button onClick={removeSelection} disabled={!selectedIds.length} title="Supprimer (Suppr)">⌫</button>
                    </div>
                    <div className="visual-toolbar-group">
                      <select aria-label="Aligner les objets" defaultValue="" disabled={selectedIds.length<2}
                        onChange={e=>{if(e.target.value==="distribute-h")distributeSelection("horizontal");else if(e.target.value==="distribute-v")distributeSelection("vertical");else if(e.target.value)alignSelection(e.target.value as "left"|"center"|"right"|"top"|"middle"|"bottom");e.target.value="";}}>
                        <option value="">Aligner</option><option value="left">À gauche</option><option value="center">Centrer horizontalement</option>
                        <option value="right">À droite</option><option value="top">En haut</option><option value="middle">Centrer verticalement</option><option value="bottom">En bas</option><option value="distribute-h">Répartir horizontalement (3+)</option><option value="distribute-v">Répartir verticalement (3+)</option>
                      </select>
                    </div>
                    <div className="visual-toolbar-group visual-toolbar-zoom">
                      <button aria-label="Réduire le zoom" onClick={()=>setZoom(z=>Math.max(.5,Math.round((z-.1)*10)/10))}>−</button>
                      <button onClick={()=>setZoom(1)} title="Ajuster à la fenêtre">Ajuster</button>
                      <span title="Zoom par rapport au format ajusté">{Math.round(zoom*100)} % ajusté</span>
                      <button onClick={()=>{
                        const width=document.querySelector<HTMLElement>(".visual-viewport")?.clientWidth??840;
                        if(draft)setZoom(draft.canvas.width/Math.max(width-2,250));
                      }} title="Afficher les pixels à leur taille réelle">100 % réel</button>
                      <button aria-label="Augmenter le zoom" onClick={()=>setZoom(z=>Math.min(5,Math.round((z+.1)*10)/10))}>+</button>
                    </div>
                  </div>
                  <div className="section-caption"><span>DIAPOSITIVE · {draft.canvas.width} × {draft.canvas.height}</span>
                    <label className="snap-control"><input type="checkbox" checked={grid>0} onChange={e=>setGrid(e.target.checked?10:0)}/> Grille d'alignement</label>
                  </div>
                  <VisualCanvas document={draft} selectedIds={selectedIds} onSelect={setSelectedIds} onChange={editDocument} zoom={zoom} grid={grid}/>
                  <div className="canvas-footer">Sélectionnez un élément, faites-le glisser ou redimensionnez-le. Double-cliquez sur un texte pour l'éditer. Maj + clic pour sélectionner plusieurs éléments.</div>
                  {animationPanelOpen&&<AnimationTimeline document={draft} selectedIds={selectedIds}
                    onChange={editDocument} onSelect={setSelectedIds} onPreview={()=>setPresenting(true)}/>}
                  <div className="notes-row">
                    <label htmlFor="slide-notes">Notes du présentateur</label>
                    <textarea id="slide-notes" rows={3} value={notes} onChange={e => { versionRef.current++;notesRef.current=e.target.value;setNotes(e.target.value);dirtyRef.current=true;setDirty(true); }} placeholder="Notes facultatives…" />
                  </div>
                </> : <div className="no-slide">Aucune diapositive. <button className="primary" onClick={() => void slideAction("addSlide")}>Ajouter une diapositive</button></div>}
              </section>
              {draft && showInspector && <PropertiesPanel document={draft} selectedIds={selectedIds} onSelect={setSelectedIds}
                onChange={editDocument} tab={tab} onTabChange={setTab}
                onAdd={type=>type==="image"?setImageStudioOpen(true):addObject(type)} onDelete={removeSelection} onArrange={arrangeSelection}
                onOpenImages={()=>setImageStudioOpen(true)} onGroup={groupSelection}/>}
            </div>
          </div>
        )}

        {qualityOpen&&current&&<QualityStudio
          detail={{...current,slides:current.slides.map(s=>s.id===slideId&&draft?
            {...s,document:draft,notes}:s)}}
          onClose={()=>setQualityOpen(false)}
          onFocus={index=>{
            const next=current.slides[index];
            if(!next)return;
            setQualityOpen(false);
            if(next.id!==slideId)void navigateToSlide(next);
          }}/>}
        {improveOpen&&token&&current&&<ImprovementStudio token={token} detail={current}
          onClose={()=>setImproveOpen(false)} onCreated={async id=>{await refreshList();await loadDeck(id);}}/>}
        {importOpen&&token&&<ImportStudio token={token} onClose={()=>setImportOpen(false)}
          onCreated={async id=>{await refreshList();await loadDeck(id);}}/>}
        {imageStudioOpen&&token&&<ImageStudio token={token} onClose={()=>setImageStudioOpen(false)}
          selectedImage={selectedIds.length===1?draft?.elements.find(e=>e.id===selectedIds[0]&&e.type==="image"):undefined}
          onPick={chooseImage}/>}
        {historyStudioOpen&&token&&slideId&&current&&active&&<HistoryStudio key={slideId} token={token}
          slideId={slideId} revision={active.revision} dirty={dirty} onClose={()=>setHistoryStudioOpen(false)}
          onRestored={async()=>{await loadDeck(current.presentation.id,slideId);await refreshList();}}/>}
        {variantsStudioOpen&&token&&slideId&&draft&&<VariantsStudio key={slideId} token={token}
          slideId={slideId} document={draft} notes={notes} dirty={dirty} onApply={applyVariant}
          onClose={()=>setVariantsStudioOpen(false)}/>}
        {presenting&&current&&current.slides.length>0&&<PresenterStudio
          detail={{...current,slides:current.slides.map(s=>s.id===slideId&&draft?
            {...s,document:draft,notes}:s)}}
          initialSlideId={slideId} onClose={()=>setPresenting(false)}/>}
        <footer className="footer">Diaporama de singe · Version ChatGPT <span>Neon · Netlify</span></footer>
      </main>
    </div>
  );
}
