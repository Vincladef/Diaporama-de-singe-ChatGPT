import type { SlideDocument } from "../domain/slide";

export type HealthResult =
  | { ok: true; database: "connected"; schema: "ready" | "incomplete"; service: string }
  | { ok: false; database: "unavailable" | "not_configured"; service: string };

export interface DeckSummary {
  id: string;
  title: string;
  format: "16:9" | "4:3" | "custom";
  updated_at: string;
  slide_count: number;
  folder_id: string|null;
}
export interface FolderSummary{
 id:string;name:string;parent_id:string|null;created_at:string;presentation_count:number;
}
export interface Presentation {
  id: string;
  title: string;
  description: string;
  format: string;
  folder_id: string|null;
  updated_at: string;
}
export interface SlideRecord {
  id: string;
  presentation_id: string;
  position: number;
  document: SlideDocument;
  notes: string;
  revision: number;
  updated_at: string;
}
export interface PresentationDetail {
  presentation: Presentation;
  slides: SlideRecord[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code === "revision_conflict" ? "La diapositive a changé ailleurs. Actualisez pour éviter d'écraser la modification." :
      code === "unauthorized" ? "Code d’accès incorrect." :
      code === "access_not_configured" ? "L’accès privé n’est pas configuré sur Netlify." :
      "Erreur de l'application : " + code);
    this.status = status;
    this.code = code;
  }
}
const endpoint = "/.netlify/functions/workspace";
async function call<T>(token: string, options: { op?: string; id?: string; action?: Record<string, unknown> } = {}): Promise<T> {
  const url = new URL(endpoint, window.location.origin);
  if (options.op) url.searchParams.set("op", options.op);
  if (options.id) url.searchParams.set("id", options.id);
  let response: Response | undefined;
  // Network faults can be transient. Retry reads only, never an unconfirmed write.
  const retries = options.action ? 0 : 2;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      response = await fetch(url, {
        method: options.action ? "POST" : "GET",
        cache: "no-store",
        headers: { Authorization: "Bearer " + token, ...(options.action ? { "Content-Type": "application/json" } : {}) },
        body: options.action ? JSON.stringify(options.action) : undefined,
        signal: AbortSignal.timeout(12000),
      });
      break;
    } catch (error) {
      if (attempt === retries) {
        const operation = options.op ?? (options.action ? "enregistrement" : "lecture");
        throw new Error("Connexion à l'espace de travail indisponible (" + operation +
          "). Vérifiez votre réseau et réessayez. Détail : " +
          (error instanceof Error ? error.message : String(error)));
      }
      await new Promise<void>(resolve => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }
  if (!response) throw new Error("L'espace de travail n'a pas répondu.");
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = typeof payload === "object" && payload && "error" in payload ? String(payload.error) : "unknown";
    throw new ApiError(response.status, error);
  }
  return payload as T;
}
export interface CreationInstructions {
  global:string;
  presentation:string;
  effective:string;
  presentationId:string|null;
  precedence:string;
  updatedAt:string|null;
  references:CreationReference[];
}
export interface CreationReference {
  id:string;filename:string;mimeType:string;sizeBytes:number;analysis:string;createdAt:string;
}
export type VisualKind = "photographique"|"documentaire"|"graphique"|"schématique"|"comparatif"|"typographique"|"mixte";
export interface ReferencePageInfo {
  referenceId:string;slideNumber:number;visualKind:VisualKind;
  selected:boolean;layout:{
    title?:string;composition?:string;imageCount?:number;textCount?:number;
    imageCoverage?:number;geometrySignature?:number[];
  };
  renderWarning:string;width:number;height:number;
}
export interface ReferencePageCollection {
  referenceId:string;filename:string;mimeType:string;totalSlides:number;
  renderedCount:number;renderEngine:string|null;pages:ReferencePageInfo[];
}
export async function readReferencePages(token:string,id:string):Promise<ReferencePageCollection>{
  return call<ReferencePageCollection>(token,{op:"referencePages",id});
}
export async function renderReferencePages(token:string,id:string,start:number,count=3):Promise<{
  totalSlides:number;rendered:{slideNumber:number}[];renderEngine:string
}>{
  const response=await fetch(endpoint,{
    method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
    body:JSON.stringify({action:"renderReferencePages",id,start,count}),
    cache:"no-store",signal:AbortSignal.timeout(55000),
  });
  const data=await response.json() as {error?:string;totalSlides?:number;rendered?:{slideNumber:number}[];renderEngine?:string};
  if(!response.ok||!data.rendered)throw Error(data.error??"Le rendu PowerPoint a échoué.");
  return {totalSlides:data.totalSlides??0,rendered:data.rendered,renderEngine:data.renderEngine??"unknown"};
}
export async function saveReferenceSelection(token:string,id:string,pages:number[]):Promise<number[]>{
  const response=await call<{selected:number[]}>(token,{action:{action:"updateReferenceSelection",id,pages}});
  return response.selected;
}
export async function saveReferenceKind(token:string,id:string,page:number,kind:VisualKind):Promise<void>{
  await call(token,{action:{action:"updateReferenceKind",id,page,kind}});
}
export async function loadReferencePageImage(token:string,id:string,page:number):Promise<Blob>{
  const url=new URL(endpoint,window.location.origin);
  url.searchParams.set("op","referencePageImage");
  url.searchParams.set("id",id);
  url.searchParams.set("page",String(page));
  const response=await fetch(url,{headers:{Authorization:"Bearer "+token},cache:"no-store",signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error("Aperçu indisponible : "+response.status);
  const image=await response.blob();
  if(image.type!=="image/png")throw Error("Format d’aperçu inattendu.");
  return image;
}

export async function readCreationInstructions(token:string,presentationId?:string):Promise<CreationInstructions>{
  return call<CreationInstructions>(token,{op:"creationInstructions",id:presentationId});
}
export async function writeCreationInstructions(
  token:string,scope:"global"|"presentation",instructions:string,presentationId?:string
):Promise<CreationInstructions>{
  return call<CreationInstructions>(token,{action:{action:"saveCreationInstructions",scope,instructions,presentationId}});
}

export async function uploadCreationReference(token:string,file:File):Promise<CreationReference>{
  const form=new FormData();
  form.set("action","uploadCreationReference");
  form.set("file",file,file.name);
  const response=await fetch(endpoint,{
    method:"POST",headers:{Authorization:"Bearer "+token},body:form,
    cache:"no-store",signal:AbortSignal.timeout(60000),
  });
  const payload=await response.json() as {error?:string;reference?:CreationReference};
  if(!response.ok||!payload.reference){
    if(payload.error==="payload_too_large")throw new Error("Le fichier dépasse 4 Mo.");
    if(payload.error==="invalid_reference_file")throw new Error("Fichier invalide ou format non accepté.");
    if(payload.error==="maximum_references_reached")throw new Error("La limite de huit exemples est atteinte.");
    throw new Error("L’envoi du fichier a échoué : "+(payload.error??response.status));
  }
  return payload.reference;
}
export async function deleteCreationReference(token:string,id:string):Promise<void>{
  await command(token,{action:"removeCreationReference",id});
}
export async function downloadCreationReference(token:string,reference:CreationReference):Promise<void>{
  const url=new URL(endpoint,window.location.origin);
  url.searchParams.set("op","creationReferenceFile");
  url.searchParams.set("id",reference.id);
  const response=await fetch(url,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
  if(!response.ok)throw new Error("Impossible de récupérer le fichier.");
  const objectUrl=URL.createObjectURL(await response.blob());
  const link=document.createElement("a");
  link.href=objectUrl;link.download=reference.filename;
  document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
}

export async function listPresentations(token: string): Promise<DeckSummary[]> {
  return (await call<{ presentations: DeckSummary[] }>(token, { op: "list" })).presentations;
}
export async function listFolders(token:string):Promise<FolderSummary[]>{
  return (await call<{folders:FolderSummary[]}>(token,{op:"folders"})).folders;
}
export async function readDeckCover(token:string,id:string):Promise<SlideDocument|null>{
  return (await call<{document:SlideDocument|null}>(token,{op:"cover",id})).document;
}
export async function readPresentation(token: string, id: string): Promise<PresentationDetail> {
  return call<PresentationDetail>(token, { op: "presentation", id });
}
export interface DeckRevisions {
  id: string;
  title: string;
  slides: { id:string;position:number;revision:number }[];
}
export async function readDeckRevisions(token:string,id:string):Promise<DeckRevisions>{
  return call<DeckRevisions>(token,{op:"revisions",id});
}
export interface HistoryCheckpoint {
  id:string;name:string;created_at:string;notes:string;document:SlideDocument;
}
export async function readSlideHistory(token:string,slideId:string,limit=20):
  Promise<{ok:true;slideId:string;items:HistoryCheckpoint[];count:number}> {
  const url=new URL(endpoint,window.location.origin);
  url.searchParams.set("op","history");
  url.searchParams.set("id",slideId);
  url.searchParams.set("limit",String(Math.min(Math.max(limit,1),30)));
  const response=await fetch(url,{cache:"no-store",headers:{Authorization:"Bearer "+token}});
  const data:unknown=await response.json();
  if(!response.ok){
    const error=typeof data==="object"&&data&&"error" in data?String(data.error):"unknown";
    throw new ApiError(response.status,error);
  }
  return data as {ok:true;slideId:string;items:HistoryCheckpoint[];count:number};
}

export async function readVariantPreferences(token:string,slideId:string){
  const data=await call<{preferences:import("../preferences/ranking").PreferenceView[]}>(token,{
    op:"variantPreferences",id:slideId
  });
  return data.preferences??[];
}

export async function command<T>(token: string, action: Record<string, unknown>): Promise<T> {
  return call<T>(token, { action });
}
export async function checkHealth(signal?: AbortSignal): Promise<HealthResult> {
  const response = await fetch("/.netlify/functions/health", { signal, cache: "no-store" });
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("ok" in data)) throw new Error("Réponse de contrôle invalide.");
  return data as HealthResult;
}
