import type { SlideDocument } from "../domain/slide.ts";
import { reviewDocument } from "../mcp/visual.ts";

export type VariantComparable={name:string;notes:string;document:SlideDocument;id?:string};
const stripHtml=(s:string)=>s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,"")
  .replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/\s+/g," ").trim();
function texts(doc:SlideDocument):string[]{
  const entries=doc.elements.filter(e=>e.type==="text").map(e=>(e.text??"").replace(/\s+/g," ").trim());
  const raw=stripHtml(doc.freeform?.html??"");
  if(raw)entries.push(raw);
  return entries.filter(Boolean).sort();
}
function images(doc:SlideDocument):string[]{
  return doc.elements.filter(e=>e.type==="image").map(e=>e.src??"").filter(Boolean).sort();
}
export function compareOneVariant(baseline:VariantComparable,variant:VariantComparable){
  const doc=variant.document;
  const review=reviewDocument(doc);
  const baseTexts=texts(baseline.document),otherTexts=texts(doc);
  const baseImages=images(baseline.document),otherImages=images(doc);
  const fonts=[...new Set(doc.elements.filter(e=>e.type==="text")
    .map(e=>String(e.styles.fontFamily??"")).filter(Boolean))].slice(0,6);
  const colors=[...new Set(doc.elements.flatMap(e=>["color","background"].map(k=>String(e.styles[k]??"")))
    .filter(c=>/^#[0-9a-fA-F]{6}$/.test(c)))].slice(0,8);
  return {
    id:variant.id,name:variant.name,
    preserves:{text:JSON.stringify(baseTexts)===JSON.stringify(otherTexts),
      imageUrls:JSON.stringify(baseImages)===JSON.stringify(otherImages),
      notes:baseline.notes===variant.notes},
    indicators:{imageCount:review.metrics.imageCount,editableObjects:review.metrics.editableObjects,
      textBlocks:review.metrics.textBlocks,animations:review.metrics.animations,
      fonts,colors,
      estimatedTextWarnings:review.issues.filter(i=>i.code==="possible_text_overflow").length,
      geometryWarnings:review.issues.filter(i=>i.code==="text_overlap"||i.code==="off_canvas").length,
      errors:review.issues.filter(i=>i.severity==="error").length,
      warnings:review.issues.filter(i=>i.severity==="warning").length},
    importantFindings:review.issues.filter(i=>i.severity!=="info").slice(0,5)
      .map(i=>({code:i.code,elementId:i.elementId})),
  };
}
