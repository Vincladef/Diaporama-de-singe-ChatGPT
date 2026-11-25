import {z} from "zod";
import type {SlideDocument,SlideElement} from "../domain/slide.ts";
import {digest,database} from "./security.ts";
import {inventorySourceVisuals} from "./sourceImages.ts";
import {getDeck,type DbSlide} from "./store.ts";

/** Immutable content baseline. Geometry, palette and animation are deliberately excluded. */
export type ContentSignature={
  texts:{id:string;hash:string}[];
  images:{kind:string;index:number;hash:string}[];
  vectors:{id:string;hash:string}[];
  html:string;
  notes:string;
};
export type LockedBaseline={version:1;slides:{id:string;signature:ContentSignature}[]};

export function sourceContentSignature(document:SlideDocument,notes:string):ContentSignature {
  const texts=document.elements.filter(e=>e.type==="text").map((e:SlideElement)=>({
    id:e.id,hash:digest(e.text??e.textRuns?.map(r=>r.text).join("")??"")
  })).sort((a,b)=>a.id.localeCompare(b.id));
  const media=inventorySourceVisuals(document);
  const images=media.images.map(i=>({kind:i.kind,index:i.sourceIndex,hash:i.fingerprint}))
    .sort((a,b)=>a.kind.localeCompare(b.kind)||a.index-b.index);
  const vectors=document.elements.filter(e=>e.type==="svg").map(e=>({
    id:e.id,hash:digest(JSON.stringify([e.text??"",e.src??""]))
  })).sort((a,b)=>a.id.localeCompare(b.id));
  return {texts,images,vectors,html:digest(document.freeform?.html??""),notes:digest(notes)};
}
export function compareContentSignatures(source:ContentSignature,current:ContentSignature):string[]{
  const fields=(["texts","images","vectors","html","notes"] as const);
  return fields.filter(field=>JSON.stringify(source[field])!==JSON.stringify(current[field]))
    .map(field=>"content_changed:"+field);
}
export async function readContentLock(presentationId:string):Promise<LockedBaseline|null>{
  z.uuid().parse(presentationId);
  const rows=await database().query(
    "SELECT baseline FROM public.mcp_deck_content_locks WHERE presentation_id=$1::uuid",
    [presentationId]);
  return rows[0]?.baseline as LockedBaseline|undefined??null;
}
export async function assertNoContentLock(presentationId:string):Promise<void>{
  if(await readContentLock(presentationId))throw Error("source_content_locked_structural_change");
}
export async function lockSourceContent(presentationId:string,enabled=true,confirmUnlock=false){
  z.uuid().parse(presentationId);
  if(!enabled){
    if(!confirmUnlock)throw Error("unlock_requires_confirmation");
    const rows=await database().query(
      "DELETE FROM public.mcp_deck_content_locks WHERE presentation_id=$1::uuid RETURNING presentation_id",
      [presentationId]);
    return {presentationId,locked:false,changed:rows.length>0};
  }
  const existing=await readContentLock(presentationId);
  if(existing)return {presentationId,locked:true,changed:false,slides:existing.slides.length};
  const deck=await getDeck(presentationId,"full",0,100);
  if(deck.nextOffset!==null)throw Error("lock_limit_100_slides");
  const slides=deck.slides.filter((s):s is DbSlide=>"document" in s);
  const baseline:LockedBaseline={version:1,slides:slides.map(s=>({
    id:s.id,signature:sourceContentSignature(s.document,s.notes)
  }))};
  const rows=await database().query(
    "INSERT INTO public.mcp_deck_content_locks(presentation_id,baseline) "+
    "VALUES($1::uuid,$2::jsonb) ON CONFLICT DO NOTHING RETURNING presentation_id",
    [presentationId,JSON.stringify(baseline)]);
  return {presentationId,locked:true,changed:rows.length>0,slides:baseline.slides.length};
}
export function checkLockedChanges(
  baseline:LockedBaseline,changes:{id:string;document:SlideDocument;notes:string}[]
):void {
  const byId=new Map(baseline.slides.map(s=>[s.id,s.signature]));
  for(const slide of changes){
    const source=byId.get(slide.id);
    if(!source)throw Error("source_content_locked_unknown_slide");
    const issues=compareContentSignatures(source,sourceContentSignature(slide.document,slide.notes));
    if(issues.length)throw Error("locked_content_changed:"+slide.id+":"+issues.join(","));
  }
}
export function compareLockedDeck(
  baseline:LockedBaseline,slides:{id:string;document:SlideDocument;notes:string}[]
){
  const byId=new Map(slides.map(s=>[s.id,s]));
  const results=baseline.slides.map(original=>{
    const current=byId.get(original.id);
    return {slideId:original.id,ok:!!current&&
      compareContentSignatures(original.signature,sourceContentSignature(current.document,current.notes)).length===0,
      issues:current?compareContentSignatures(original.signature,
        sourceContentSignature(current.document,current.notes)):["slide_missing"]};
  });
  const unknown=slides.filter(s=>!baseline.slides.some(b=>b.id===s.id)).map(s=>s.id);
  return {ok:results.every(r=>r.ok)&&unknown.length===0,
    sourceSlideCount:baseline.slides.length,currentSlideCount:slides.length,
    slides:results,additionalSlideIds:unknown};
}
