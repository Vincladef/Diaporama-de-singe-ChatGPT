import pptxgen from "pptxgenjs";
import type { SlideDocument, SlideElement } from "../domain/slide";
import type { PresentationDetail } from "../lib/api";
import { captureSlide } from "./capture";
import { captureObject } from "./captureObject";
import { captureNativeHtml, type NativeTextRun } from "./nativeHtml";
import { visibleStructuredElements } from "./nativeSteps";
import { inspectExport,isNativePptxObject } from "./preflight";
import { asColor, cssLength, pptxInches, safeDownloadName } from "./geometry";
import { buildExportFrames, type RevealExportMode } from "./reveals";
import { addNativeAnimationsToPptx, canUseNativeAnimations } from "./nativeAnimations";
import {getSlideTheme} from "../editor/slideThemes";

export type PowerPointMode = "faithful" | "editable";
export interface ExportProgress { completed: number; total: number; }
export interface ExportReport { fileName: string; slideCount: number; warnings: string[]; mode: PowerPointMode; downloadUrl: string; }
export interface PowerPointArtifact { fileName: string; slideCount: number; sourceSlideCount: number; warnings: string[]; mode: PowerPointMode; blob: Blob; }

function getNumber(style: SlideElement["styles"], key: string, reference: number, fallback: number): number {
  return cssLength(style[key], reference, fallback);
}
function safeNotes(value: string): string { return value.slice(0, 30000); }

async function fetchImageData(src: string): Promise<string> {
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(src)) return src;
  if (!/^https:\/\//i.test(src)) throw new Error("Seules les images HTTPS ou intégrées en data URL sont prises en charge.");
  const hostname = new URL(src).hostname;
  const candidates = [
    { label: "source", url: src },
    { label: "relais", url: "/.netlify/functions/export-media?url=" + encodeURIComponent(src) },
  ];
  const failures: string[] = [];
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, {
        mode: "cors", credentials: "omit", signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      if (Number(response.headers.get("content-length") ?? 0) > 18_000_000)
        throw new Error("fichier supérieur à 18 Mo");
      const mime = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? "";
      if (!/^image\/(?:png|jpe?g|gif|webp)$/.test(mime))
        throw new Error("type de fichier incompatible : " + (mime || "inconnu"));
      const blob = await response.blob();
      if (blob.size > 18_000_000) throw new Error("fichier supérieur à 18 Mo");
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Image non lisible"));
        reader.onerror = () => reject(new Error("Image non lisible"));
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      failures.push(candidate.label + " : " + (error instanceof Error ? error.message : String(error)));
    }
  }
  throw new Error(
    "Photo inaccessible pour l'export (" + hostname + "). " +
    "Essais direct et relais échoués. " + failures.join(" ; ")
  );
}

async function imageToDataUrl(src:string,cache:Map<string,Promise<string>>):Promise<string>{
  const known=cache.get(src);
  if(known)return known;
  const job=fetchImageData(src);
  cache.set(src,job);
  if(cache.size>20){
    const oldest=cache.keys().next().value;
    if(oldest&&oldest!==src)cache.delete(oldest);
  }
  try{return await job;}catch(error){cache.delete(src);throw error;}
}

function geometry(element: SlideElement, document: SlideDocument, slideW: number, slideH: number) {
  const s = element.styles;
  const xPx = getNumber(s, "left", document.canvas.width, 0);
  const yPx = getNumber(s, "top", document.canvas.height, 0);
  const wPx = getNumber(s, "width", document.canvas.width, document.canvas.width / 2);
  const hPx = getNumber(s, "height", document.canvas.height,
    element.type === "text" ? getNumber(s, "fontSize", document.canvas.width, 64) * 1.7 : document.canvas.height / 3);
  return {
    x: pptxInches(xPx, document.canvas.width, slideW),
    y: pptxInches(yPx, document.canvas.height, slideH),
    w: pptxInches(Math.max(wPx, 1), document.canvas.width, slideW),
    h: pptxInches(Math.max(hPx, 1), document.canvas.height, slideH),
  };
}
/**
 * Editable conversion of documented structured objects.
 * Arbitrary HTML/CSS remains a screenshot. This is a deliberate compatibility boundary.
 */
type ParsedFill={color:string;transparency:number};
function parsedFill(value:unknown):ParsedFill{
  if(typeof value!=="string"||value==="transparent"||value==="none")
    return {color:"FFFFFF",transparency:100};
  const rgba=value.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+))?\s*\)/i);
  if(rgba)return {color:asColor(value,"FFFFFF"),
    transparency:Math.max(0,Math.min(100,Math.round(100*(1-Number(rgba[4]??1)))))};
  return {color:asColor(value,"A4BDAC"),transparency:0};
}
function appendNativeShape(
  pptx:pptxgen, slide:ReturnType<pptxgen["addSlide"]>,
  id:string, box:{x:number;y:number;w:number;h:number}, style:SlideElement["styles"],
):void{
  const raw=String(style.backgroundColor??style.background??"transparent");
  const gradient=raw.match(/^linear-gradient\(\s*(\d+)deg\s*,(.+)\)$/i);
  if(gradient){
    const stops=[...gradient[2]!.matchAll(/(rgba?\([^)]*\)|#[0-9a-fA-F]{6})\s+([\d.]+)%/g)]
      .map(m=>({fill:parsedFill(m[1]),at:Math.max(0,Math.min(1,Number(m[2])/100))}));
    if(stops.length>=2){
      const vertical=Number(gradient[1])%180===0;
      const reverse=Number(gradient[1])%360===270||Number(gradient[1])%360===0;
      const count=24;
      for(let i=0;i<count;i++){
        const t=reverse?1-(i+.5)/count:(i+.5)/count;
        let a=stops[0]!,b=stops[stops.length-1]!;
        for(let j=1;j<stops.length;j++)if(t<=stops[j]!.at){
          a=stops[j-1]!;b=stops[j]!;break;
        }
        const ratio=Math.max(0,Math.min(1,(t-a.at)/Math.max(.0001,b.at-a.at)));
        const c=(hex:string)=>[0,2,4].map(k=>parseInt(hex.slice(k,k+2),16));
        const left=c(a.fill.color),right=c(b.fill.color);
        const color=left.map((v,k)=>Math.round(v+(right[k]!-v)*ratio)
          .toString(16).padStart(2,"0")).join("").toUpperCase();
        const transparency=Math.round(a.fill.transparency+
          (b.fill.transparency-a.fill.transparency)*ratio);
        const part=vertical?{x:box.x,y:box.y+i*box.h/count,
          w:box.w,h:box.h/count+.004}:{x:box.x+i*box.w/count,y:box.y,
          w:box.w/count+.004,h:box.h};
        slide.addShape(pptx.ShapeType.rect,{...part,
          objectName:id+" - dégradé "+(i+1),
          line:{color,transparency:100},fill:{color,transparency}});
      }
      return;
    }
  }
  const fill=parsedFill(raw);
  const borderRadius=cssLength(style.borderRadius,1920,0);
  const lineColor=typeof style.border==="string"
    ? style.border.match(/#[0-9a-fA-F]{3,8}/)?.[0]:undefined;
  slide.addShape(borderRadius>0?pptx.ShapeType.roundRect:pptx.ShapeType.rect,{
    ...box,objectName:id,
    line:lineColor?{color:asColor(lineColor,"FFFFFF"),width:1}
      :{color:fill.color,transparency:100},
    fill,
  });
}

function safeSvgData(svg:string):string{
  if(!/^<svg[\s>]/i.test(svg.trim())||
    /<script|<foreignObject|\bon[a-z]+\s*=|\bhref\s*=\s*["']https?:/i.test(svg))
    throw new Error("SVG non sécurisé pour un objet PowerPoint.");
  const bytes=new TextEncoder().encode(svg);
  let binary="";
  for(const b of bytes)binary+=String.fromCharCode(b);
  return "data:image/svg+xml;base64,"+btoa(binary);
}

async function appendNativeObjects(
  pptx: pptxgen, slide: ReturnType<pptxgen["addSlide"]>, document: SlideDocument,
  slideW: number, slideH: number,cache:Map<string,Promise<string>>,
): Promise<void> {
  for (const element of document.elements) {
    if(element.hidden)continue;
    const box = geometry(element, document, slideW, slideH);
    const style = element.styles;
    if(!isNativePptxObject(element)){
      const image=await captureObject(document,element);
      slide.addImage({data:image,...box,objectName:element.id+" · rendu isolé"});
      continue;
    }
    if (element.type === "text") {
      const cssFontSize = getNumber(style, "fontSize", document.canvas.width, 64);
      const pt = Math.max(5, Math.min(300, pptxInches(cssFontSize, document.canvas.width, slideW) * 72));
      const face = String(style.fontFamily ?? "Aptos").split(",")[0]?.replace(/["']/g, "").trim() || "Aptos";
      slide.addText(element.text ?? "", {
        ...box, objectName: element.id,
        color: asColor(style.color, "25382C"),
        fontFace: face, fontSize: pt,
        bold: style.fontWeight === "bold" || Number(style.fontWeight) >= 600,
        italic: style.fontStyle === "italic",
        align: style.textAlign === "center" ? "center" : style.textAlign === "right" ? "right" : "left",
        valign: "top", margin: 0, breakLine: false,
      });
    } else if (element.type === "shape") {
      appendNativeShape(pptx,slide,element.id,box,style);
    } else if (element.type === "svg") {
      if(!element.text)continue;
      slide.addImage({data:safeSvgData(element.text),...box,objectName:element.id});
    } else if (element.type === "image") {
      if (!element.src) continue;
      const data = await imageToDataUrl(element.src,cache);
      const fit = element.styles.objectFit;
      if (fit === "cover" || fit === "contain") {
        slide.addImage({ data, ...box, objectName: element.id, sizing: { type: fit, w: box.w, h: box.h } });
      } else {
        slide.addImage({ data, ...box, objectName: element.id });
      }
    }
  }
}

/** Editable typography reconstructed from measured HTML text runs. */
function appendNativeHtmlText(
  slide: ReturnType<pptxgen["addSlide"]>, runs: NativeTextRun[],
  document: SlideDocument, slideW: number, slideH: number,
): void {
  for (const [index, run] of runs.entries()) {
    const x = pptxInches(run.x, document.canvas.width, slideW);
    const y = pptxInches(run.y, document.canvas.height, slideH);
    const w = pptxInches(run.w, document.canvas.width, slideW);
    const h = pptxInches(run.h, document.canvas.height, slideH);
    if (w <= 0 || h <= 0) continue;
    const family = run.fontFamily.split(",")[0]?.replace(/["']/g, "").trim() || "Aptos";
    const pt = Math.max(5, Math.min(280,
      pptxInches(run.fontSize, document.canvas.width, slideW) * 72));
    slide.addText(run.text, {
      x, y, w, h, objectName: "Texte HTML modifiable " + (index + 1),
      fontFace: family, fontSize: pt, color: asColor(run.color, "26342C"),
      bold: run.fontWeight >= 600, italic: run.italic, align: run.align,
      valign: "top", margin: 0, breakLine: false,
    });
  }
}

function emptyFreeform(document: SlideDocument): boolean {
  return !document.freeform?.html?.trim() && !document.freeform?.css?.trim();
}

/**
 * Create a PPTX in the browser. All slides share the first slide's aspect ratio,
 * as required by the PowerPoint format.
 */
export async function buildPowerPoint(
  deck: PresentationDetail, mode: PowerPointMode,
  onProgress?: (progress: ExportProgress) => void,
  revealMode: RevealExportMode = "steps",
): Promise<PowerPointArtifact> {
  if (!deck.slides.length) throw new Error("La présentation ne contient aucune diapositive.");
  const first = deck.slides[0]!;
  const aspect = first.document.canvas.width / first.document.canvas.height;
  const slideW = 13.333;
  const slideH = slideW / aspect;
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "SINGE_CUSTOM", width: slideW, height: slideH });
  pptx.layout = "SINGE_CUSTOM";
  pptx.author = "Diaporama de singe";
  pptx.subject = "Présentation exportée depuis le moteur HTML/CSS";
  pptx.title = deck.presentation.title;
  pptx.company = "Diaporama de singe";
  const warnings: string[] = [];
  const effectiveRevealMode = mode === "faithful" && revealMode === "native" ? "steps" : revealMode;
  const frames = buildExportFrames(deck.slides.map(s => s.document), effectiveRevealMode);
  const nativeDocuments: {index:number;document:SlideDocument}[] = [];
  const preflight=inspectExport(deck.slides);
  const imageCache=new Map<string,Promise<string>>();
  if(preflight.animatedSlides && effectiveRevealMode === "native") {
    const nativeCount=deck.slides.filter(s=>canUseNativeAnimations(s.document)).length;
    warnings.push(nativeCount+" diapositive(s) animées avec des objets PowerPoint natifs ; "+(preflight.animatedSlides-nativeCount)+" diapositive(s) utilisent les étapes de secours pour préserver les animations HTML.");
  }
  if(preflight.animatedSlides && effectiveRevealMode !== "native")warnings.push(effectiveRevealMode === "steps"
    ? preflight.animatedSlides + " diapositive(s) animées développées en " + frames.length +
      " écrans successifs au total. En mode modifiable, les textes et objets convertibles restent éditables ; les fondus et déplacements Web ne sont pas des animations natives Google Slides/PowerPoint."
    : preflight.animatedSlides + " diapositive(s) comportent des animations Web ; l'export statique ne conserve pas leurs apparitions au clic.");
  if(preflight.totalRemoteImages)warnings.push(
    "Les photos externes dépendent de la politique CORS de leurs hébergeurs. En cas de blocage, utilisez un média librement téléchargeable.");

  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index]!;
    const source = deck.slides[frame.sourceIndex]!;
    const document = source.document;
    const slide = pptx.addSlide();
    const theme=getSlideTheme(document.themeId);
    const swatches=theme?.background.match(/#[0-9a-fA-F]{6}/g)??[];
    slide.background={color:swatches[0]?.slice(1).toUpperCase()??"FFFFFF"};
    if(mode==="editable"&&theme?.background.startsWith("linear-gradient(")&&swatches.length>=2){
      const angle=Number(theme.background.match(/linear-gradient\((\d+)deg/)?.[1]??90);
      appendNativeShape(pptx,slide,"Fond du thème",{x:0,y:0,w:slideW,h:slideH},{
        backgroundColor:"linear-gradient("+angle+"deg,"+swatches[0]+" 0%,"+swatches[swatches.length-1]+" 100%)",
      });
    }
    if (source.notes?.trim()) slide.addNotes(safeNotes(source.notes));
    const number = frame.sourceIndex + 1;
    const ratio = document.canvas.width / document.canvas.height;
    if (Math.abs(ratio - aspect) > 0.001) {
      warnings.push("Diapositive " + number + " : format différent ; les éléments seront adaptés au format du premier écran.");
    }

    if (mode === "faithful") {
      const image = await captureSlide(document,
        frame.revealClickCount === null ? {} : { revealClickCount: frame.revealClickCount });
      slide.addImage({ data: image, x: 0, y: 0, w: slideW, h: slideH,
        objectName: frame.revealClickCount === null ? "Render " + number :
          "Reveal " + number + "." + frame.revealClickCount });
    } else {
      if(document.elements.some(el=>el.styles.textShadow||el.styles.boxShadow)) {
        warnings.push("Diapositive "+number+" : certaines ombres CSS ne sont pas convertibles en objets.");
      }
      const unsupported = document.elements.some(element =>
        element.type==="group" || Boolean(element.parentId) ||
        document.elements.some(child=>child.parentId===element.id));
      if (unsupported) {
        const image = await captureSlide(document,
          frame.revealClickCount === null ? {} : { revealClickCount: frame.revealClickCount });
        slide.addImage({ data: image, x: 0, y: 0, w: slideW, h: slideH });
        warnings.push("Diapositive "+number+" : composition imbriquée non convertible ; image complète de secours.");
      } else {
        const hasFreeform = document.mode !== "structured" && !emptyFreeform(document);
        if (hasFreeform) {
          const extracted = await captureNativeHtml(document,
            frame.revealClickCount === null ? undefined : frame.revealClickCount);
          slide.addImage({ data: extracted.background, x: 0, y: 0, w: slideW, h: slideH,
            objectName: "Décor HTML et médias" });
          appendNativeHtmlText(slide, extracted.texts, document, slideW, slideH);
          warnings.push("Diapositive " + number +
            " : " + extracted.texts.length + " texte(s) HTML converti(s) en objets modifiables ; photos, diagrammes et effets CSS complexes restent dans le décor.");
        }
        const fallbacks=document.elements.filter(element=>!isNativePptxObject(element));
        if(fallbacks.length)warnings.push("Diapositive "+number+" : "+
          fallbacks.length+" objet(s) à effet complexe converti(s) séparément en images ; les autres restent modifiables.");
        const visible = frame.revealClickCount === null ? document.elements :
          visibleStructuredElements(document, frame.revealClickCount);
        await appendNativeObjects(pptx, slide,
          { ...document, elements: visible }, slideW, slideH, imageCache);
      }
    }
    if(effectiveRevealMode === "native" && frame.revealClickCount===null && canUseNativeAnimations(document))
      nativeDocuments.push({index,document});
    onProgress?.({ completed: index + 1, total: frames.length });
  }

  const fileName = safeDownloadName(deck.presentation.title);
  // Keep control of the Blob instead of relying on a library's 100ms revoke timer.
  // This also lets us validate the ZIP signature before reporting success.
  const generated = await pptx.write({ outputType: "blob", compression: true });
  let blob = generated instanceof Blob
    ? generated
    : new Blob([generated as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  if(nativeDocuments.length) blob = await addNativeAnimationsToPptx(blob,nativeDocuments);
  const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (blob.size < 800 || signature[0] !== 0x50 || signature[1] !== 0x4B) {
    throw new Error("Le fichier PowerPoint généré ne semble pas être une archive PPTX valide.");
  }
  // Inspect ZIP's central-directory filenames at the end of the generated archive.
  const tail = new TextDecoder("utf-8").decode(await blob.slice(Math.max(0, blob.size - 750_000)).arrayBuffer());
  for (let i = 1; i <= frames.length; i++) {
    if (!tail.includes("ppt/slides/slide" + i + ".xml")) {
      throw new Error("Le PowerPoint généré ne contient pas la diapositive " + i + ".");
    }
  }
  return { fileName, slideCount: frames.length, sourceSlideCount: deck.slides.length, warnings, mode, blob };
}

/** The file download and Google Slides conversion reuse the exact same PPTX builder. */
export async function exportPowerPoint(
  deck: PresentationDetail, mode: PowerPointMode,
  onProgress?: (progress: ExportProgress) => void,
  revealMode: RevealExportMode = "steps",
): Promise<ExportReport> {
  const artifact = await buildPowerPoint(deck, mode, onProgress, revealMode);
  const href = URL.createObjectURL(artifact.blob);
  const anchor = document.createElement("a");
  anchor.download = artifact.fileName;
  anchor.href = href;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 300_000);
  return {
    fileName: artifact.fileName, slideCount: artifact.slideCount,
    warnings: artifact.warnings, mode: artifact.mode, downloadUrl: href,
  };
}
