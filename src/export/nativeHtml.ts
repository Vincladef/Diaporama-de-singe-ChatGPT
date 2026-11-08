import { toPng } from "html-to-image";
import type { SlideDocument } from "../domain/slide";
import { renderSlideHtml } from "../engine/render";
import { SlideAnimationPlayer } from "../animation/runtime";

/** A text run measured in the real browser, in source-canvas pixels. */
export type NativeTextRun = {
  text: string;
  x: number; y: number; w: number; h: number;
  fontSize: number; fontFamily: string; fontWeight: number;
  italic: boolean; color: string; align: "left" | "center" | "right";
  letterSpacing: number;
};
export type NativeHtmlCapture = { background: string; texts: NativeTextRun[] };

function visibleText(el: HTMLElement, win: Window): boolean {
  let node: HTMLElement | null = el;
  while (node && node !== el.ownerDocument.body) {
    const s = win.getComputedStyle(node);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < .01) return false;
    node = node.parentElement;
  }
  return true;
}

function extractText(doc: Document, width: number, height: number): { texts: NativeTextRun[]; hide: () => void } {
  const win = doc.defaultView;
  if (!win) return { texts: [], hide: () => {} };
  const root = doc.body.querySelector(".s") ?? doc.body;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const candidates: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(node instanceof Text) || !node.textContent?.trim()) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest("script,style,svg,defs,template,noscript")) continue;
    candidates.push(node);
    if (candidates.length >= 500) break;
  }
  const texts: NativeTextRun[] = [];
  const toHide: Text[] = [];
  for (const node of candidates) {
    const parent = node.parentElement;
    if (!parent || !visibleText(parent, win)) continue;
    const range = doc.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (!Number.isFinite(rect.x) || rect.width < 2 || rect.height < 2 ||
      rect.right < 0 || rect.bottom < 0 || rect.left > width || rect.top > height) continue;
    const css = win.getComputedStyle(parent);
    const text = node.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text) continue;
    let transformed = text;
    if (css.textTransform === "uppercase") transformed = text.toLocaleUpperCase("fr");
    else if (css.textTransform === "lowercase") transformed = text.toLocaleLowerCase("fr");
    const weight = parseInt(css.fontWeight, 10);
    texts.push({
      text: transformed,
      x: Math.max(0, rect.x), y: Math.max(0, rect.y),
      w: Math.min(width, rect.width + 7), h: Math.min(height, rect.height + 5),
      fontSize: Math.max(6, parseFloat(css.fontSize) || 20),
      fontFamily: css.fontFamily || "Aptos",
      fontWeight: Number.isFinite(weight) ? weight : (css.fontWeight === "bold" ? 700 : 400),
      italic: css.fontStyle === "italic",
      color: css.color,
      align: css.textAlign === "center" ? "center" : css.textAlign === "right" ? "right" : "left",
      letterSpacing: parseFloat(css.letterSpacing) || 0,
    });
    toHide.push(node);
  }
  // A display:contents wrapper keeps the CSS layout and spacing unchanged while
  // removing only the glyphs from the faithful backdrop. The text becomes native.
  return { texts, hide: () => {
    for (const node of toHide) {
      const parent = node.parentNode;
      if (!parent) continue;
      const span = doc.createElement("span");
      span.style.setProperty("display", "contents", "important");
      span.style.setProperty("color", "transparent", "important");
      span.style.setProperty("-webkit-text-fill-color", "transparent", "important");
      span.style.setProperty("text-shadow", "none", "important");
      parent.replaceChild(span, node);
      span.appendChild(node);
    }
  } };
}

/**
 * Hybrid export for arbitrary HTML: preserve complex decoration as an image,
 * but rebuild every measurable visible text run as an editable PPTX text box.
 * Unsupported masks, pseudo-elements, photos and CSS painting remain raster.
 */
export async function captureNativeHtml(document: SlideDocument, revealClickCount?: number): Promise<NativeHtmlCapture> {
  const { width, height } = document.canvas;
  const frame = window.document.createElement("iframe");
  frame.title = "Extraction de textes modifiables";
  frame.sandbox.add("allow-same-origin");
  frame.referrerPolicy = "no-referrer";
  Object.assign(frame.style, {
    position: "fixed", top: "0", left: "-20000px", width: width + "px",
    height: height + "px", pointerEvents: "none", border: "0",
  });
  let player: SlideAnimationPlayer | undefined;
  try {
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Le rendu HTML a expiré.")), 15000);
      frame.addEventListener("load", () => { clearTimeout(timer); resolve(); }, { once: true });
      frame.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Le rendu HTML a échoué.")); }, { once: true });
    });
    frame.srcdoc = renderSlideHtml({ ...document, elements: [], mode: "freeform" });
    window.document.body.appendChild(frame);
    await ready;
    const doc = frame.contentDocument;
    if (!doc?.body) throw new Error("Le document de conversion HTML est inaccessible.");
    await Promise.race([doc.fonts.ready, new Promise<void>(resolve => setTimeout(resolve, 5000))]);
    await Promise.all([...doc.images].map(image => new Promise<void>(resolve => {
      if (image.complete) return resolve();
      const timer = window.setTimeout(resolve, 6000);
      const done = () => { clearTimeout(timer); resolve(); };
      image.addEventListener("load", done, { once: true });
      image.addEventListener("error", done, { once: true });
    })));
    if ([...doc.images].some(image => !image.complete || !image.naturalWidth)) {
      throw new Error("Une photographie HTML ne charge pas ; conversion modifiable impossible.");
    }
    if (revealClickCount !== undefined) {
      player = new SlideAnimationPlayer(doc, document);
      const missing = player.missingTargets();
      if (missing.length) throw new Error("Cible d'animation introuvable : " + missing.slice(0, 3).join(", "));
      await player.seek(revealClickCount, { animate: false });
    }
    const extracted = extractText(doc, width, height);
    extracted.hide();
    const background = await toPng(doc.body, {
      width, height, pixelRatio: 1, cacheBust: false, backgroundColor: "#101715",
    });
    return { background, texts: extracted.texts };
  } finally {
    player?.dispose();
    frame.remove();
  }
}
