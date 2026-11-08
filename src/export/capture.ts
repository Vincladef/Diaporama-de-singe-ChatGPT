import { toPng } from "html-to-image";
import type { SlideDocument } from "../domain/slide";
import { renderSlideHtml } from "../engine/render";

export interface CaptureOptions {
  pixelRatio?: number;
  onWarning?: (message: string) => void;
}

/**
 * Capture the actual slide DOM at its reference resolution.
 *
 * The temporary iframe deliberately has ONLY allow-same-origin, NEVER allow-scripts.
 * Scripts in user-supplied HTML remain disabled, while the parent can read the
 * frame's computed styles for conversion. It is removed even on error.
 */
export async function captureSlide(document: SlideDocument, options: CaptureOptions = {}): Promise<string> {
  const { width, height } = document.canvas;
  const frame = window.document.createElement("iframe");
  frame.title = "Rendu temporaire pour export";
  frame.sandbox.add("allow-same-origin");
  frame.referrerPolicy = "no-referrer";
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed", top: "0", left: "-20000px",
    width: width + "px", height: height + "px",
    pointerEvents: "none", border: "0", opacity: "1",
  });
  try {
    const ready = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Le rendu de la diapositive a expiré.")), 15000);
      frame.addEventListener("load", () => { clearTimeout(timeout); resolve(); }, { once: true });
      frame.addEventListener("error", () => { clearTimeout(timeout); reject(new Error("Impossible de charger l'aperçu.")); }, { once: true });
    });
    frame.srcdoc = renderSlideHtml(document);
    window.document.body.appendChild(frame);
    await ready;
    const doc = frame.contentDocument;
    if (!doc?.body) throw new Error("Le navigateur refuse l'accès au cadre d'export.");

    // Fonts and images should settle before rasterization. Each wait is bounded.
    await Promise.race([
      doc.fonts.ready,
      new Promise<void>(resolve => window.setTimeout(resolve, 5000)),
    ]);
    const images = [...doc.images];
    await Promise.all(images.map(image => new Promise<void>(resolve => {
      if (image.complete) { resolve(); return; }
      const timeout = window.setTimeout(resolve, 5000);
      const done = () => { clearTimeout(timeout); resolve(); };
      image.addEventListener("load", done, { once: true });
      image.addEventListener("error", done, { once: true });
    })));
    const unavailable = images.filter(image => !image.complete || image.naturalWidth === 0);
    if (unavailable.length) {
      throw new Error(unavailable.length + " image(s) n'ont pas pu être chargées. Corrigez les sources avant un export fidèle.");
    }

    try {
      return await toPng(doc.body, {
        width, height,
        pixelRatio: options.pixelRatio ?? 1,
        cacheBust: false,
        backgroundColor: "#FFFFFF",
      });
    } catch (error) {
      options.onWarning?.("La capture HTML/CSS dépend de la prise en charge du navigateur et des règles CORS des médias.");
      throw new Error("Capture HTML/CSS impossible. Une image, une police ou un effet CSS n'est peut-être pas compatible avec l'export du navigateur. " +
        (error instanceof Error ? error.message : String(error)));
    }
  } finally {
    frame.remove();
  }
}
