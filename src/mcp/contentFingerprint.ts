import {createHash} from "node:crypto";
import type {SlideDocument} from "../domain/slide.ts";

const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export type ContentSignature={
  texts:{id:string;hash:string}[];
  images:{kind:string;index:number;hash:string}[];
  vectors:{id:string;hash:string}[];
  html:string;
  notes:string;
};
export type LockedBaseline={version:1;slides:{id:string;signature:ContentSignature}[]};

/** Content only. Text, media and notes are invariant; geometry, palette and animations are not. */
export function sourceContentSignature(document:SlideDocument,notes:string):ContentSignature{
  const texts=document.elements.filter(e=>e.type==="text").map(e=>({
    id:e.id,hash:digest(e.text??e.textRuns?.map(r=>r.text).join("")??"")
  })).sort((a,b)=>a.id.localeCompare(b.id));
  const images:{kind:string;index:number;hash:string}[]=[];
  document.elements.filter(e=>e.type==="image"&&e.src).forEach((e,index)=>
    images.push({kind:"element",index,hash:digest(e.src!)}));
  for(const [kind,sources] of [
    ["html-image",Array.from((document.freeform?.html??"").matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi),m=>m[1]!)],
    ["css-background",Array.from((document.freeform?.css??"").matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi),m=>m[1]!)]
  ] as const){sources.forEach((src,index)=>images.push({kind,index,hash:digest(src)}));}
  images.sort((a,b)=>a.kind.localeCompare(b.kind)||a.index-b.index);
  const vectors=document.elements.filter(e=>e.type==="svg").map(e=>({
    id:e.id,hash:digest(JSON.stringify([e.text??"",e.src??""]))
  })).sort((a,b)=>a.id.localeCompare(b.id));
  return {texts,images,vectors,html:digest(document.freeform?.html??""),notes:digest(notes)};
}
export function compareContentSignatures(source:ContentSignature,current:ContentSignature):string[]{
  const fields=(["texts","images","vectors","html","notes"] as const);
  const stable=(value:unknown):string=>JSON.stringify(value,(_key,item)=>
    item&&typeof item==="object"&&!Array.isArray(item)
      ?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b)))
      :item);
  return fields.filter(field=>stable(source[field])!==stable(current[field]))
    .map(field=>"content_changed:"+field);
}
export function checkLockedChanges(
  baseline:LockedBaseline,changes:{id:string;document:SlideDocument;notes:string}[]
):void{
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
    const issues=current?compareContentSignatures(original.signature,
      sourceContentSignature(current.document,current.notes)):["slide_missing"];
    return {slideId:original.id,ok:issues.length===0,issues};
  });
  const unknown=slides.filter(s=>!baseline.slides.some(b=>b.id===s.id)).map(s=>s.id);
  return {ok:results.every(r=>r.ok)&&unknown.length===0,
    sourceSlideCount:baseline.slides.length,currentSlideCount:slides.length,
    slides:results,additionalSlideIds:unknown};
}
