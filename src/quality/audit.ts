import type { SlideDocument,SlideElement } from "../domain/slide.ts";
import {inspectMarkupMedia} from "./markupMedia.ts";

export type Finding={
  severity:"error"|"warning"|"info";
  code:string;
  message:string;
  slideIndex:number;
  elementId?:string;
};
export type AuditResult={
  slideCount:number;
  errorCount:number;
  warningCount:number;
  infoCount:number;
  findings:Finding[];
  readyToProject:boolean;
};
const complexStyles=["transform","backdropFilter","clipPath","mask","mixBlendMode","backgroundImage","writingMode"];
function n(value:unknown):number|undefined{
  if(typeof value==="number")return Number.isFinite(value)?value:undefined;
  if(typeof value!=="string"||!/^[-+]?[0-9]*\.?[0-9]+(?:px)?$/.test(value.trim()))return undefined;
  const result=Number.parseFloat(value);return Number.isFinite(result)?result:undefined;
}
function urlCheck(src:string|undefined):"missing"|"safe"|"unsupported"{
  if(!src)return "missing";
  if(/^https:\/\//i.test(src)||/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(src))return "safe";
  return "unsupported";
}
export function auditSlide(doc:SlideDocument,index:number):Finding[]{
  const findings:Finding[]=[];
  const push=(severity:Finding["severity"],code:string,message:string,elementId?:string)=>{
    findings.push({severity,code,message,slideIndex:index, ...(elementId?{elementId}:{})});
  };
  const html=doc.freeform?.html??"",css=doc.freeform?.css??"";
  const freeformMedia=inspectMarkupMedia(doc);
  if(freeformMedia.invalidUrls.length)
    push("error","freeform_image_url","Une image HTML/CSS contient une URL de format non autorisé.");
  if(freeformMedia.imageCount)
    push("info","freeform_image_requires_capture",
      freeformMedia.imageCount+" image(s) dans le HTML/CSS : vérifier leur chargement réel avec Chromium ; l'audit statique ne le prouve pas.");
  if(doc.elements.length===0&&!html.trim())push("warning","empty_slide","Cette diapositive ne contient aucun élément visible.");
  const ids=new Set<string>();
  for(const e of doc.elements){
    if(ids.has(e.id))push("error","duplicate_id","Plusieurs objets possèdent le même identifiant ; la sélection et les animations seront ambiguës.",e.id);
    ids.add(e.id);
    if(e.type==="image"){
      const source=urlCheck(e.src);
      if(source!=="safe")push("error","image_source",source==="missing"?"Image sans source.":"L'image doit utiliser HTTPS ou un format intégré pris en charge.",e.id);
      if((e.src??"").length>1_200_000)push("warning","large_image","Image intégrée volumineuse ; le chargement et l'enregistrement peuvent ralentir.",e.id);
    }
    const left=n(e.styles.left),top=n(e.styles.top),width=n(e.styles.width),height=n(e.styles.height);
    if((left!==undefined&&left>doc.canvas.width)||(top!==undefined&&top>doc.canvas.height)||
      (left!==undefined&&width!==undefined&&left+width<0)||
      (top!==undefined&&height!==undefined&&top+height<0))
      push("warning","off_canvas","L'objet se trouve hors de la zone visible.",e.id);
    if((width!==undefined&&width<=0)||(height!==undefined&&height<=0))
      push("warning","empty_geometry","L'objet possède une dimension non positive.",e.id);
    if(e.type==="text"){
      if(!(e.text??"").trim())push("warning","empty_text","Zone de texte vide.",e.id);
      const font=n(e.styles.fontSize);
      if(font!==undefined&&font<22)push("info","small_font","Texte petit sur un écran 1920 × 1080 ; vérifier la lisibilité en projection.",e.id);
    }
    if(complexStyles.some(key=>e.styles[key]!==undefined))
      push("info","pptx_rasterization","Cet objet emploie des effets CSS qui peuvent nécessiter un fond image lors de l'export PowerPoint.",e.id);
  }
  for(const cue of doc.animations){
    if(cue.targetElementId&&!ids.has(cue.targetElementId))
      push("error","missing_animation_target","L'animation "+cue.id+" cible un objet absent.",cue.targetElementId);
    if(cue.targetSelector){
      if(cue.targetSelector.length>240||/[<>]/.test(cue.targetSelector))
        push("error","invalid_animation_selector","Le sélecteur de l'animation "+cue.id+" est invalide.");
      else if(!html.trim())
        push("warning","selector_without_html","L'animation "+cue.id+" emploie un sélecteur CSS alors que cette diapositive ne contient pas de HTML libre.");
    }
  }
  if(doc.mode!=="structured"&&(html.trim()||css.trim()))
    push("info","freeform_pptx","Le contenu HTML/CSS libre est exporté en image de fond pour préserver son aspect ; il ne reste pas entièrement éditable dans PowerPoint.");
  const bytes=new TextEncoder().encode(JSON.stringify(doc)).byteLength;
  if(bytes>1_250_000)push("warning","large_slide","Cette diapositive est proche de la limite de taille d'import par lot.");
  if(html.length>600_000||css.length>240_000)push("error","document_limit","Le HTML ou le CSS dépasse les limites de sauvegarde.");
  return findings;
}
export function auditDeck(slides:{document:SlideDocument;notes?:string}[]):AuditResult{
  const findings=slides.flatMap((slide,i)=>auditSlide(slide.document,i));
  const ratio=slides[0]?slides[0].document.canvas.width/slides[0].document.canvas.height:0;
  for(let i=1;i<slides.length;i++){
    const d=slides[i]!.document;
    const current=d.canvas.width/d.canvas.height;
    if(Math.abs(current-ratio)>.001)findings.push({
      severity:"warning",code:"mixed_aspect",slideIndex:i,
      message:"Format différent de la première diapositive ; l'export PowerPoint adaptera les dimensions."
    });
  }
  if(!slides.length)findings.push({
    severity:"error",code:"no_slides",slideIndex:0,
    message:"La présentation ne comporte aucune diapositive."
  });
  const errorCount=findings.filter(f=>f.severity==="error").length;
  const warningCount=findings.filter(f=>f.severity==="warning").length;
  return {slideCount:slides.length,errorCount,warningCount,
    infoCount:findings.filter(f=>f.severity==="info").length,
    findings,readyToProject:errorCount===0&&slides.length>0};
}
