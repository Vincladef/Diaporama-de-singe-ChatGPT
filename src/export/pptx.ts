import pptxgen from "pptxgenjs";
import type { SlideDocument, SlideElement } from "../domain/slide";
import type { PresentationDetail } from "../lib/api";
import { captureSlide } from "./capture";
import { inspectExport,isNativePptxObject } from "./preflight";
import { asColor, cssLength, pptxInches, safeDownloadName } from "./geometry";
import { buildExportFrames, type RevealExportMode } from "./reveals";

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
  const response = await fetch(src, { mode: "cors", credentials: "omit",
    signal:AbortSignal.timeout(18000) });
  if (!response.ok) throw new Error("Impossible de récupérer l'image : HTTP " + response.status);
  if(Number(response.headers.get("content-length")??0)>18_000_000)
    throw new Error("Cette image dépasse 18 Mo ; réduisez-la avant l'export.");
  const type = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!/^image\/(?:png|jpe?g|gif|webp)$/i.test(type)) throw new Error("Format d'image non compatible avec PowerPoint : " + type);
  const blob = await response.blob();
  if(blob.size>18_000_000)throw new Error("Cette image dépasse 18 Mo ; réduisez-la avant l'export.");
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Image non lisible"));
    reader.onerror = () => reject(new Error("Image non lisible"));
    reader.readAsDataURL(blob);
  });
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
async function appendNativeObjects(
  pptx: pptxgen, slide: ReturnType<pptxgen["addSlide"]>, document: SlideDocument,
  slideW: number, slideH: number,cache:Map<string,Promise<string>>,
): Promise<void> {
  for (const element of document.elements) {
    const box = geometry(element, document, slideW, slideH);
    const style = element.styles;
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
      slide.addShape(getNumber(style, "borderRadius", document.canvas.width, 0) > 0 ?
        pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
        ...box, objectName: element.id,
        line: { color: asColor(style.borderColor ?? style.backgroundColor, "FFFFFF"), transparency: 100 },
        fill: { color: asColor(style.backgroundColor, "A4BDAC") },
      });
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
  const frames = buildExportFrames(deck.slides.map(s => s.document), revealMode);
  const preflight=inspectExport(deck.slides);
  const imageCache=new Map<string,Promise<string>>();
  if(preflight.animatedSlides)warnings.push(revealMode === "steps"
    ? preflight.animatedSlides + " diapositive(s) animées développées en " + frames.length +
      " écrans successifs au total. Les clics dévoilent le contenu en avançant d'une diapositive ; les fondus et déplacements Web ne sont pas des animations natives Google Slides/PowerPoint."
    : preflight.animatedSlides + " diapositive(s) comportent des animations Web ; l'export statique ne conserve pas leurs apparitions au clic.");
  if(preflight.totalRemoteImages)warnings.push(
    "Les photos externes dépendent de la politique CORS de leurs hébergeurs. En cas de blocage, utilisez un média librement téléchargeable.");

  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index]!;
    const source = deck.slides[frame.sourceIndex]!;
    const document = source.document;
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    if (source.notes?.trim()) slide.addNotes(safeNotes(source.notes));
    const number = frame.sourceIndex + 1;
    const ratio = document.canvas.width / document.canvas.height;
    if (Math.abs(ratio - aspect) > 0.001) {
      warnings.push("Diapositive " + number + " : format différent ; les éléments seront adaptés au format du premier écran.");
    }

    if (frame.revealClickCount !== null) {
      // One rendered page per click boundary. This is more robust than hoping that
      // imported PowerPoint animation XML survives the Google Slides conversion.
      const image = await captureSlide(document, { revealClickCount: frame.revealClickCount });
      slide.addImage({ data: image, x: 0, y: 0, w: slideW, h: slideH,
        objectName: "Reveal " + number + "." + frame.revealClickCount });
    } else if (mode === "faithful") {
      const image = await captureSlide(document);
      slide.addImage({ data: image, x: 0, y: 0, w: slideW, h: slideH, objectName: "Render " + number });
    } else {
      if(document.elements.some(el=>el.styles.textShadow||el.styles.boxShadow)) {
        warnings.push("Diapositive "+number+" : ombres CSS ignorées en mode objets modifiables, afin de conserver le texte éditable.");
      }
      const unsupported = document.elements.some(element => !isNativePptxObject(element));
      if (unsupported) {
        const image = await captureSlide(document);
        slide.addImage({ data: image, x: 0, y: 0, w: slideW, h: slideH });
        warnings.push("Diapositive " + number + " : certains objets ou effets ne sont pas convertibles ; image de secours.");
      } else {
        const hasFreeform = document.mode !== "structured" && !emptyFreeform(document);
        if (hasFreeform) {
          const backdrop: SlideDocument = { ...document, mode: "freeform", elements: [] };
          const image = await captureSlide(backdrop);
          slide.addImage({ data: image, x: 0, y: 0, w: slideW, h: slideH });
          warnings.push("Diapositive " + number + " : HTML/CSS libre conservé comme fond image. Les objets structurés restent modifiables.");
        }
        await appendNativeObjects(pptx, slide, document, slideW, slideH,imageCache);
      }
    }
    onProgress?.({ completed: index + 1, total: frames.length });
  }

  const fileName = safeDownloadName(deck.presentation.title);
  // Keep control of the Blob instead of relying on a library's 100ms revoke timer.
  // This also lets us validate the ZIP signature before reporting success.
  const generated = await pptx.write({ outputType: "blob", compression: true });
  const blob = generated instanceof Blob
    ? generated
    : new Blob([generated as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
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
