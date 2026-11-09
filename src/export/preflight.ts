import type { SlideDocument, SlideElement } from "../domain/slide.ts";

export type ExportModeHint="native"|"mixed"|"raster";
export type SlideExportRisk={
  position:number;mode:ExportModeHint;images:number;remoteImages:number;
  animations:number;notesPresent:boolean;warnings:string[];
};
export type ExportPreflight={
  slideCount:number;fullyNative:number;mixedEditable:number;rasterOnly:number;
  totalRemoteImages:number;animatedSlides:number;warnings:string[];
  slides:SlideExportRisk[];
  googleSlides:{directPublish:false;webEditorPublish:true;requiresOAuth:true;workflow:string};
};
export function isNativePptxObject(e:SlideElement):boolean{
  if(!["text","image","shape","svg"].includes(e.type)||e.parentId)return false;
  if(e.type==="svg"&&(!e.text?.trim().startsWith("<svg")||
      /<script|<foreignObject|\\bon[a-z]+\\s*=|\\bhref\\s*=\\s*["']https?:/i.test(e.text)))return false;
  const excluded=["transform","filter","backdropFilter","clipPath","mask",
    "mixBlendMode","backgroundImage","writingMode"];
  return !excluded.some(name=>e.styles[name]!==undefined&&e.styles[name]!=="");
}
export function inspectExport(slides:{document:SlideDocument;notes?:string}[]):ExportPreflight{
  const risks:SlideExportRisk[]=[];
  const first=slides[0]?.document.canvas;
  const expectedRatio=first?first.width/first.height:16/9;
  for(let i=0;i<slides.length;i++){
    const {document,notes}=slides[i]!;
    const media=document.elements.filter(x=>x.type==="image");
    const embeddedImages=(document.freeform?.html??"").match(/<img\b[^>]*\bsrc\s*=\s*["']https:\/\/[^"']+["']/gi)??[];
    const cssUrls=(document.freeform?.css??"").match(/url\(\s*["']?https:\/\/[^)]+\)/gi)??[];
    const remote=media.filter(x=>x.src?.startsWith("https://")).length+
      embeddedImages.length+cssUrls.length;
    const hasFree=!!(document.freeform?.html?.trim()||document.freeform?.css?.trim());
    const hasGroups=document.elements.some(x=>x.type==="group" || Boolean(x.parentId) ||
      document.elements.some(child=>child.parentId===x.id));
    const isolated=document.elements.filter(x=>!isNativePptxObject(x)).length;
    const mode:ExportModeHint=hasGroups?"raster":
      (isolated>0 || (document.mode!=="structured"&&hasFree))?"mixed":"native";
    const issues:string[]=[];
    const ratio=document.canvas.width/document.canvas.height;
    if(Math.abs(ratio-expectedRatio)>.002)issues.push("Format différent du premier écran ; adaptation nécessaire.");
    if(mode==="raster")issues.push("Groupes imbriqués : conversion de la page en image de secours.");
    if(isolated && !hasGroups)issues.push(isolated+" objet(s) complexe(s) rendu(s) séparément ; les autres restent modifiables.");
    if(mode==="mixed")issues.push("Mode modifiable : textes HTML convertis ; décor CSS complexe conservé en image, objets structurés indépendants.");
    if(document.elements.some(x=>x.type==="svg")&&!hasUnsupported)
      issues.push("Les tracés SVG sont conservés en image vectorielle indépendante, sans édition des points.");
    if(document.animations.length)issues.push("Apparitions : animations PowerPoint natives pour les objets compatibles ; étapes successives sinon. La conversion Google Slides peut modifier les effets.");
    if(media.some(x=>!x.src))issues.push("Image sans source.");
    if(remote)issues.push("Les images distantes nécessitent un accès CORS pour la capture/export dans ce navigateur.");
    if(document.elements.length>950)issues.push("Plus de 950 éléments ; risque de surcharge mémoire.");
    risks.push({position:i+1,mode,images:media.length+embeddedImages.length,remoteImages:remote,
      animations:document.animations.length,notesPresent:Boolean(notes?.trim()),warnings:issues});
  }
  const allWarnings=[...new Set(risks.flatMap(r=>r.warnings))];
  return {
    slideCount:slides.length,fullyNative:risks.filter(r=>r.mode==="native").length,
    mixedEditable:risks.filter(r=>r.mode==="mixed").length,
    rasterOnly:risks.filter(r=>r.mode==="raster").length,
    totalRemoteImages:risks.reduce((sum,r)=>sum+r.remoteImages,0),
    animatedSlides:risks.filter(r=>r.animations>0).length,warnings:allWarnings,
    slides:risks,
    googleSlides:{directPublish:false,webEditorPublish:true,requiresOAuth:true,
      workflow:"L'éditeur Web propose « Exporter vers Google Slides » après autorisation Google OAuth. Le MCP ne publie pas directement : en l'absence d'OAuth, téléchargez le PPTX et importez-le via Google Drive."},
  };
}
