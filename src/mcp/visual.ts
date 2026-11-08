import { z } from "zod";
import { createEmptySlideDocument, SlideDocumentSchema, type SlideDocument, type SlideElement } from "../domain/slide.ts";
import { auditSlide } from "../quality/audit.ts";

/** Deterministic scene composition. These presets never require pixel coordinates from the AI. */
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const CompositionSchema = z.object({
  layout: z.enum(["hero", "section", "split", "quote", "cards", "comparison", "timeline"]),
  title: z.string().trim().min(1).max(220),
  subtitle: z.string().max(400).optional(),
  body: z.string().max(2400).optional(),
  imageUrl: z.url().refine(v => v.startsWith("https://"), "HTTPS image required").optional(),
  imageSide: z.enum(["left", "right"]).default("left"),
  items: z.array(z.string().trim().min(1).max(380)).max(6).default([]),
  accent: hex.default("#A8D8BE"),
  background: hex.default("#17251F"),
  notes: z.string().max(30000).optional(),
}).strict();
export type Composition = z.infer<typeof CompositionSchema>;

const unit = (v: number) => Math.round(v) + "px";
const baseFont = "Arial, Helvetica, sans-serif";

export function composeDocument(input: Composition): SlideDocument {
  const spec = CompositionSchema.parse(input);
  const d = createEmptySlideDocument();
  const out: SlideElement[] = [];
  const W = d.canvas.width, H = d.canvas.height;
  const add = (id: string, type: SlideElement["type"], styles: SlideElement["styles"], text?: string, src?: string) => {
    out.push({ id, type, styles: { position: "absolute", ...styles }, ...(text !== undefined ? { text } : {}), ...(src ? { src } : {}) });
  };
  const shape = (id: string, x: number, y: number, w: number, h: number, bg: string, extra: SlideElement["styles"] = {}) =>
    add(id, "shape", { left: unit(x), top: unit(y), width: unit(w), height: unit(h), background: bg, ...extra });
  const text = (id: string, value: string | undefined, x: number, y: number, w: number, h: number,
    size: number, color: string, extra: SlideElement["styles"] = {}) => {
    if (!value?.trim()) return;
    add(id, "text", { left: unit(x), top: unit(y), width: unit(w), height: unit(h),
      color, fontFamily: baseFont, fontSize: unit(size), lineHeight: "1.13",
      whiteSpace: "pre-wrap", overflow: "hidden", ...extra }, value);
  };
  const image = (id: string, x: number, y: number, w: number, h: number) => {
    if (spec.imageUrl) add(id, "image", { left: unit(x), top: unit(y), width: unit(w), height: unit(h),
      objectFit: "cover", objectPosition: "center" }, undefined, spec.imageUrl);
  };
  const titleSize = spec.title.length > 85 ? 69 : spec.title.length > 53 ? 84 : 102;
  const white = "#FFFFFF", muted = "#CEDAD2";
  const dark = spec.background, accent = spec.accent;

  switch (spec.layout) {
    case "hero": {
      shape("scene-background", 0, 0, W, H, dark);
      image("scene-photo", 0, 0, W, H);
      if (spec.imageUrl) shape("scene-shade", 0, 0, W, H,
        "linear-gradient(90deg,rgba(8,21,17,.94) 0%,rgba(8,21,17,.64) 58%,rgba(8,21,17,.06) 100%)");
      shape("scene-accent", 120, 174, 100, 8, accent);
      text("scene-kicker", spec.subtitle, 120, 228, 1280, 92, 37, muted);
      text("scene-title", spec.title, 120, 405, 1530, 340, titleSize, white, { fontWeight: 700, letterSpacing: "-2px" });
      text("scene-body", spec.body, 126, 832, 1210, 155, 37, white);
      break;
    }
    case "section": {
      shape("scene-background", 0, 0, W, H, dark);
      image("scene-photo", 0, 0, W, 730);
      if (spec.imageUrl) shape("scene-photo-shade", 0, 0, W, 730,
        "linear-gradient(0deg,rgba(8,21,17,.52),rgba(8,21,17,.03))");
      shape("scene-accent", 115, 800, 85, 9, accent);
      text("scene-title", spec.title, 113, 835, 1660, 147, 86, white, { fontWeight: 700 });
      text("scene-subtitle", spec.subtitle || spec.body, 118, 999, 1590, 60, 27, muted);
      break;
    }
    case "split": {
      shape("scene-background", 0, 0, W, H, "#F4F3ED");
      const photoLeft = spec.imageSide === "left";
      const picX = photoLeft ? 0 : 976, textX = photoLeft ? 1060 : 106;
      image("scene-photo", picX, 0, 944, H);
      if (!spec.imageUrl) shape("scene-photo-placeholder", picX, 0, 944, H, dark);
      shape("scene-accent", textX, 153, 100, 8, accent);
      text("scene-subtitle", spec.subtitle, textX, 217, 730, 90, 32, "#496056");
      text("scene-title", spec.title, textX, 340, 740, 335,
        spec.title.length > 65 ? 63 : 81, "#17251F", { fontWeight: 700 });
      text("scene-body", spec.body, textX, 755, 735, 245, 36, "#2F433A");
      break;
    }
    case "quote": {
      shape("scene-background", 0, 0, W, H, dark);
      if (spec.imageUrl) {
        image("scene-photo", 1180, 0, 740, H);
        shape("scene-photo-shade", 1120, 0, 800, H,
          "linear-gradient(90deg," + dark + ",rgba(23,37,31,.14))");
      }
      text("scene-glyph", "“", 115, 145, 250, 225, 170, accent, { fontFamily: "Georgia, serif" });
      text("scene-title", spec.title, 155, 360, spec.imageUrl ? 1280 : 1580, 420,
        spec.title.length > 130 ? 57 : 76, white, { fontFamily: "Georgia, serif" });
      text("scene-subtitle", spec.subtitle || spec.body, 162, 896, 1380, 110, 34, muted);
      break;
    }
    case "cards": {
      shape("scene-background", 0, 0, W, H, "#F5F4EF");
      shape("scene-accent", 108, 101, 94, 9, accent);
      text("scene-title", spec.title, 108, 147, 1690, 143, 79, dark, { fontWeight: 700 });
      text("scene-subtitle", spec.subtitle || spec.body, 111, 300, 1640, 110, 32, "#4C6256");
      const values = spec.items.length ? spec.items : [spec.body || spec.title];
      const cols = values.length <= 3 ? values.length : 3;
      const rows = Math.ceil(values.length / cols);
      const gap = 25, cardW = (1690 - (cols - 1) * gap) / cols;
      const cardH = rows === 1 ? 445 : 265;
      values.forEach((item, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const x = 108 + col * (cardW + gap), y = 500 + row * (cardH + 24);
        shape("scene-card-" + i, x, y, cardW, cardH, white, { border: "2px solid #D9E1DA", borderRadius: "10px" });
        shape("scene-card-rule-" + i, x + 35, y + 38, 60, 8, accent);
        text("scene-card-number-" + i, String(i + 1).padStart(2, "0"), x + 35, y + 73, cardW - 70, 65, 30, "#647D70");
        text("scene-card-copy-" + i, item, x + 35, y + 149, cardW - 70, cardH - 168,
          rows === 1 ? 39 : 31, dark, { fontWeight: 600 });
      });
      break;
    }
    case "comparison": {
      shape("scene-background", 0, 0, W, H, "#F4F3ED");
      text("scene-title", spec.title, 100, 105, 1680, 150, 76, dark, { fontWeight: 700 });
      text("scene-subtitle", spec.subtitle, 108, 259, 1690, 90, 32, "#4C6256");
      const panels = [spec.items[0] || spec.body || "Premier élément", spec.items[1] || "Deuxième élément"];
      panels.forEach((value, i) => {
        const x = 99 + i * 872;
        shape("scene-panel-" + i, x, 425, 850, 535, i === 0 ? dark : "#DEE7DF", { borderRadius: "8px" });
        shape("scene-rule-" + i, x + 55, 480, 100, 9, accent);
        text("scene-panel-number-" + i, i === 0 ? "01" : "02", x + 55, 533, 740, 75, 39,
          i === 0 ? accent : "#496056");
        text("scene-panel-copy-" + i, value, x + 55, 654, 741, 275, 48,
          i === 0 ? white : dark, { fontWeight: 600 });
      });
      break;
    }
    case "timeline": {
      shape("scene-background", 0, 0, W, H, dark);
      text("scene-title", spec.title, 105, 99, 1700, 135, 82, white, { fontWeight: 700 });
      text("scene-subtitle", spec.subtitle, 113, 256, 1600, 95, 34, muted);
      const values = (spec.items.length ? spec.items : [spec.body || spec.title]).slice(0, 5);
      const step = 1680 / values.length;
      shape("scene-rail", 126, 556, 1675, 6, "#6F9781");
      values.forEach((item, i) => {
        const x = 125 + i * step;
        shape("scene-point-" + i, x, 540, 36, 36, accent, { borderRadius: "50%" });
        text("scene-step-index-" + i, String(i + 1).padStart(2, "0"), x, 436, step - 20, 68, 32, accent);
        text("scene-step-copy-" + i, item, x, 621, step - 25, 270, 35, white, { fontWeight: 600 });
      });
      break;
    }
  }
  d.elements = out;
  return SlideDocumentSchema.parse(d);
}

export type VisualIssue = { severity:"error"|"warning"|"info"; code:string; message:string; elementId?:string; suggestion?:string };
type Rect = { x:number;y:number;w:number;h:number };
function numeric(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?(?:px)?$/.test(value.trim())) return null;
  const n = Number.parseFloat(value); return Number.isFinite(n) ? n : null;
}
function rect(el: SlideElement): Rect | null {
  const x = numeric(el.styles.left), y = numeric(el.styles.top);
  const w = numeric(el.styles.width), h = numeric(el.styles.height);
  return x === null || y === null || w === null || h === null ? null : { x,y,w,h };
}
function estimatedLines(value: string, width: number, fontSize: number): number {
  const charsPerLine = Math.max(1, Math.floor(width / Math.max(8,fontSize * .53)));
  return value.split("\n").reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/charsPerLine)),0);
}
function intersects(a:Rect,b:Rect): number {
  return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)) *
    Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
}
export function reviewDocument(document: SlideDocument, slideIndex = 0): { issues:VisualIssue[]; metrics:Record<string,number>; methodology:string } {
  const doc=SlideDocumentSchema.parse(document);
  const issues:VisualIssue[] = auditSlide(doc,slideIndex).map(f=>({
    severity:f.severity,code:f.code,message:f.message,
    ...(f.elementId?{elementId:f.elementId}:{}),
  }));
  const texts = doc.elements.filter(e=>e.type==="text" && (e.text??"").trim());
  const images = doc.elements.filter(e=>e.type==="image");
  for (const el of texts) {
    const box=rect(el), size=numeric(el.styles.fontSize);
    if (!box) continue;
    if (box.x < 44 || box.x+box.w > doc.canvas.width-44)
      issues.push({severity:"info",code:"text_safe_margin",elementId:el.id,
        message:"Texte proche d'un bord de projection.",suggestion:"Prévoir une marge d'au moins 44 px."});
    if (size !== null) {
      const required=estimatedLines(el.text??"",box.w,size)*size*1.18;
      if (required > box.h * 1.18) issues.push({severity:"warning",code:"possible_text_overflow",elementId:el.id,
        message:"La zone de texte semble trop basse pour son contenu.",suggestion:"Augmenter sa hauteur, réduire le texte ou ajuster sa taille après prévisualisation."});
    }
  }
  for (let i=0;i<texts.length;i++) for(let j=i+1;j<texts.length;j++) {
    const a=rect(texts[i]!),b=rect(texts[j]!);
    if (!a||!b||a.w<=0||a.h<=0||b.w<=0||b.h<=0) continue;
    if(intersects(a,b)>Math.min(a.w*a.h,b.w*b.h)*.12)
      issues.push({severity:"warning",code:"text_overlap",elementId:texts[j]!.id,
        message:"Deux zones de texte paraissent se recouvrir.",suggestion:"Contrôler l'empilement et espacer les blocs."});
  }
  return {issues,metrics:{
    textBlocks:texts.length,imageCount:images.length,editableObjects:doc.elements.length,
    animations:doc.animations.length,canvasWidth:doc.canvas.width,canvasHeight:doc.canvas.height,
  },methodology:"Analyse statique des objets et dimensions ; la prévisualisation dans le navigateur est nécessaire pour vérifier les pixels, les polices et les images distantes."};
}

export function repairDocument(document: SlideDocument, mode:"safe"|"readability"="safe"):
  {document:SlideDocument;changes:{elementId:string;action:string}[]} {
  const doc=structuredClone(SlideDocumentSchema.parse(document));
  const changes:{elementId:string;action:string}[]=[];
  for (const el of doc.elements) {
    const b=rect(el);
    if (!b) continue;
    const isFullBleed=(b.w*b.h >= doc.canvas.width*doc.canvas.height*.78);
    if(isFullBleed || el.type==="group" || el.type==="svg") continue;
    const maxW=doc.canvas.width, maxH=doc.canvas.height;
    if(b.w<=0 || b.h<=0) continue; // Requires author judgment.
    const w=Math.min(b.w,maxW),h=Math.min(b.h,maxH);
    const x=Math.min(Math.max(0,b.x),Math.max(0,maxW-w));
    const y=Math.min(Math.max(0,b.y),Math.max(0,maxH-h));
    if(x!==b.x||y!==b.y||w!==b.w||h!==b.h) {
      el.styles={...el.styles,left:unit(x),top:unit(y),width:unit(w),height:unit(h)};
      changes.push({elementId:el.id,action:"reposition_and_fit_within_canvas"});
    }
    if(el.type==="image"&&!el.styles.objectFit){
      el.styles={...el.styles,objectFit:"cover"};
      changes.push({elementId:el.id,action:"set_image_cover"});
    }
    if(mode==="readability" && el.type==="text"){
      const font=numeric(el.styles.fontSize);
      if(font!==null && font>0 && font<24){
        el.styles={...el.styles,fontSize:"24px"};
        changes.push({elementId:el.id,action:"increase_font_to_24px"});
      }
    }
  }
  return {document:SlideDocumentSchema.parse(doc),changes};
}
