import type { SlideDocument } from "../domain/slide.ts";
import { reviewDocument } from "../mcp/visual.ts";
import { inspectMarkupMedia } from "../quality/markupMedia.ts";

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
/** Include HTML <img> and CSS backgrounds, not just native image layers.
 * Sources remain internal to the comparison; no binary data is returned to MCP. */
function images(doc:SlideDocument):string[]{
  const markup=inspectMarkupMedia(doc);
  return [...doc.elements.filter(e=>e.type==="image").map(e=>e.src??""),
    ...markup.imageUrls,...markup.backgroundUrls]
    .filter(Boolean).sort();
}
function missingCount(base:string[],other:string[]):number{
  const counts=new Map<string,number>();
  for(const value of other)counts.set(value,(counts.get(value)??0)+1);
  let missing=0;
  for(const value of base){
    const count=counts.get(value)??0;
    if(count)counts.set(value,count-1);else missing++;
  }
  return missing;
}
function svgCount(doc:SlideDocument):number{
  return doc.elements.filter(e=>e.type==="svg").length+
    [...(doc.freeform?.html??"").matchAll(/<svg\b/gi)].length;
}
export function compareOneVariant(baseline:VariantComparable,variant:VariantComparable){
  const doc=variant.document;
  const review=reviewDocument(doc);
  const baseTexts=texts(baseline.document),otherTexts=texts(doc);
  const baseImages=images(baseline.document),otherImages=images(doc);
  const missingImages=missingCount(baseImages,otherImages);
  const missingDiagrams=Math.max(0,svgCount(baseline.document)-svgCount(doc));
  const fonts=[...new Set(doc.elements.filter(e=>e.type==="text")
    .map(e=>String(e.styles.fontFamily??"")).filter(Boolean))].slice(0,6);
  const colors=[...new Set(doc.elements.flatMap(e=>["color","background"].map(k=>String(e.styles[k]??"")))
    .filter(c=>/^#[0-9a-fA-F]{6}$/.test(c)))].slice(0,8);
  return {
    id:variant.id,name:variant.name,
    preserves:{text:JSON.stringify(baseTexts)===JSON.stringify(otherTexts),
      imageUrls:missingImages===0,
      sourceVisuals:missingImages===0&&missingDiagrams===0,
      notes:baseline.notes===variant.notes},
    indicators:{imageCount:review.metrics.imageCount,editableObjects:review.metrics.editableObjects,
      textBlocks:review.metrics.textBlocks,animations:review.metrics.animations,
      fonts,colors,
      estimatedTextWarnings:review.issues.filter(i=>i.code==="possible_text_overflow").length,
      geometryWarnings:review.issues.filter(i=>i.code==="text_overlap"||i.code==="off_canvas").length,
      errors:review.issues.filter(i=>i.severity==="error").length,
      warnings:review.issues.filter(i=>i.severity==="warning").length+
        Number(missingImages>0||missingDiagrams>0),
      missingSourceImages:missingImages,missingSourceDiagrams:missingDiagrams},
    importantFindings:[
      ...(missingImages?[{code:"source_images_missing",missingCount:missingImages}]:[]),
      ...(missingDiagrams?[{code:"source_diagrams_missing",missingCount:missingDiagrams}]:[]),
      ...review.issues.filter(i=>i.severity!=="info").slice(0,5)
        .map(i=>({code:i.code,elementId:i.elementId}))
    ].slice(0,6),
  };
}
