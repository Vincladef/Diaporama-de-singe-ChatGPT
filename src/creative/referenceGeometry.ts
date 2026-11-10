import JSZip from "jszip";

/**
 * Spatial hints extracted from PowerPoint DrawingML, without rendering.
 * These are useful for reference retrieval but are NOT visual screenshots.
 */
export type ReferenceItemKind = "image" | "text" | "shape" | "diagram" | "connector";
export type RelativeFrame = { x: number; y: number; width: number; height: number };
export type ReferenceLayoutItem = {
  kind: ReferenceItemKind;
  frame?: RelativeFrame;
  text?: string;
};
export type ReferenceSlideLayout = {
  index: number;
  title?: string;
  imageCount: number;
  textCount: number;
  diagramCount: number;
  items: ReferenceLayoutItem[];
};
export type PowerPointGeometry = {
  source: "pptx-drawingml";
  rendered: false;
  slideCount: number;
  aspectRatio: number;
  slides: ReferenceSlideLayout[];
  limitations: string[];
};

const MAX_SLIDES = 8;
const MAX_ITEMS_PER_SLIDE = 20;
const MAX_XML_BYTES = 2_000_000;
const DEFAULT_CX = 12_192_000;
const DEFAULT_CY = 6_858_000;

function attr(element: string, name: string): number | undefined {
  const match = element.match(new RegExp("(?:^|\\s)" + name + "\\s*=\\s*[\"'](-?\\d+)[\"']"));
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}
function decodeXmlText(input: string): string {
  return input.replace(/&(?:amp|lt|gt|quot|apos|#x[0-9a-f]+|#\d+);/gi, entity => {
    const known: Record<string,string> = {
      "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"",
      "&apos;": "'",
    };
    if (known[entity]) return known[entity];
    const code = entity.startsWith("&#x") ? Number.parseInt(entity.slice(3, -1), 16)
      : entity.startsWith("&#") ? Number.parseInt(entity.slice(2, -1), 10) : NaN;
    return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
      ? String.fromCodePoint(code) : entity;
  });
}
function extractText(xml: string): string {
  return [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
    .map(match => decodeXmlText(match[1] ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 110);
}
function normalise(position: number, axis: number): number {
  return Math.round((position / axis) * 1000) / 10;
}
function frameFor(block: string, slideWidth: number, slideHeight: number): RelativeFrame | undefined {
  const transform = block.match(/<(?:a|p):xfrm\b[^>]*>([\s\S]*?)<\/(?:a|p):xfrm>/)?.[1];
  if (!transform) return undefined;
  const off = transform.match(/<a:off\b[^>]*\/?\s*>/)?.[0] ?? "";
  const ext = transform.match(/<a:ext\b[^>]*\/?\s*>/)?.[0] ?? "";
  const x = attr(off, "x"), y = attr(off, "y");
  const cx = attr(ext, "cx"), cy = attr(ext, "cy");
  if (x === undefined || y === undefined || cx === undefined || cy === undefined ||
      cx <= 0 || cy <= 0 || !slideWidth || !slideHeight) return undefined;
  return {
    x: normalise(x, slideWidth),
    y: normalise(y, slideHeight),
    width: normalise(cx, slideWidth),
    height: normalise(cy, slideHeight),
  };
}
function pptxSlideIndex(path: string): number {
  return Number(path.match(/\/slide(\d+)\.xml$/)?.[1] ?? 0);
}
function parseSlide(xml: string, index: number, width: number, height: number): ReferenceSlideLayout {
  const items: ReferenceLayoutItem[] = [];
  let imageCount = 0, textCount = 0, diagramCount = 0;
  const blocks = xml.matchAll(/<p:(sp|pic|graphicFrame|cxnSp)\b[^>]*>([\s\S]*?)<\/p:\1>/g);
  for (const [,tag,body] of blocks) {
    if (!body) continue;
    const snippet = extractText(body);
    const kind: ReferenceItemKind = tag === "pic" ? "image"
      : tag === "graphicFrame" ? "diagram"
      : tag === "cxnSp" ? "connector"
      : snippet ? "text" : "shape";
    if (kind === "image") imageCount++;
    if (kind === "text") textCount++;
    if (kind === "diagram") diagramCount++;
    if (items.length >= MAX_ITEMS_PER_SLIDE) continue;
    const frame = frameFor(body, width, height);
    items.push({kind, ...(frame ? {frame} : {}), ...(snippet && kind === "text" ? {text:snippet} : {})});
  }
  return {
    index,
    ...(items.find(item => item.kind === "text" && item.text)?.text
      ? {title:items.find(item => item.kind === "text" && item.text)!.text!.slice(0,80)} : {}),
    imageCount,textCount,diagramCount,items,
  };
}
export async function extractPowerPointGeometry(
  bytes: Uint8Array, maxSlides = MAX_SLIDES
): Promise<PowerPointGeometry> {
  if (bytes.byteLength > 4_000_000 || bytes.byteLength < 4)
    throw new Error("invalid_reference_size");
  const zip = await JSZip.loadAsync(bytes);
  const slidePaths = Object.keys(zip.files)
    .filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a,b) => pptxSlideIndex(a) - pptxSlideIndex(b));
  const presentation = zip.file("ppt/presentation.xml");
  const presentationXml = presentation && ((presentation as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize ?? 0) <= MAX_XML_BYTES
    ? await presentation.async("string") : "";
  const size = presentationXml.match(/<p:sldSz\b[^>]*\/?\s*>/)?.[0] ?? "";
  const width = attr(size, "cx") || DEFAULT_CX;
  const height = attr(size, "cy") || DEFAULT_CY;
  const slides: ReferenceSlideLayout[] = [];
  for (const path of slidePaths.slice(0,Math.max(1,Math.min(MAX_SLIDES,Math.floor(maxSlides))))) {
    const file = zip.file(path);
    const unpacked = (file as unknown as {_data?:{uncompressedSize?:number}} | null)?._data?.uncompressedSize;
    if (!file || typeof unpacked !== "number" || unpacked > MAX_XML_BYTES) continue;
    const xml = await file.async("string");
    slides.push(parseSlide(xml,pptxSlideIndex(path),width,height));
  }
  return {
    source:"pptx-drawingml",rendered:false,
    slideCount:slidePaths.length,
    aspectRatio:Math.round(width/height*1000)/1000,
    slides,
    limitations:[
      "Positions issues du DrawingML ; aucune capture d'écran n'a été produite.",
      "Les effets, masques, groupes et compositions complexes peuvent être incomplets.",
    ],
  };
}

export function summarizePowerPointGeometry(geometry: PowerPointGeometry, maxChars = 2000): string {
  const lines = geometry.slides.map(slide => {
    const fragments = slide.items.filter(item => item.frame && (item.kind === "image" || item.kind === "text" || item.kind === "diagram"))
      .slice(0, 8).map(item => {
        const f = item.frame!;
        const rect = [f.x,f.y,f.width,f.height].join("/");
        return item.kind + " (" + rect + " %)";
      });
    return "Diapo " + slide.index + " : " + slide.imageCount + " image(s), " +
      slide.textCount + " bloc(s) de texte, " + slide.diagramCount + " diagramme(s)" +
      (slide.title ? " ; texte initial « " + slide.title.slice(0,65) + " »" : "") +
      (fragments.length ? " ; emplacements x/y/l/h : " + fragments.join(", ") : "") + ".";
  });
  return ("Géométrie estimée, pas un rendu visuel (" + geometry.aspectRatio + ":1) :\n" +
    lines.join("\n")).slice(0,Math.max(0,maxChars));
}
