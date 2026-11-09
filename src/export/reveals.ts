import type { SlideDocument } from "../domain/slide.ts";
import { buildPlaybackPlan } from "../animation/timeline.ts";
import { canUseNativeAnimations } from "./nativeAnimations.ts";

/** Google Slides import does not receive the Web animation timeline.
 * In stages mode, every logical click is exported as its own cumulative frame.
 * During presentation, "next slide" reproduces click-by-click reveal order.
 */
export type RevealExportMode = "steps" | "static" | "native";
export interface ExportFrame {
  sourceIndex: number;
  /** null means the original static view; 0 is before the first click. */
  revealClickCount: number | null;
  totalClicks: number;
}
export const MAX_EXPORT_FRAMES = 240;

export function buildExportFrames(
  documents: Pick<SlideDocument, "animations">[],
  mode: RevealExportMode = "steps",
): ExportFrame[] {
  const frames: ExportFrame[] = [];
  for (const [sourceIndex, document] of documents.entries()) {
    const totalClicks = buildPlaybackPlan(document.animations).clicks.length;
    if ((mode === "steps" || (mode === "native" && !canUseNativeAnimations(document as SlideDocument))) && totalClicks > 0) {
      for (let revealClickCount = 0; revealClickCount <= totalClicks; revealClickCount++) {
        frames.push({sourceIndex, revealClickCount, totalClicks});
      }
    } else {
      frames.push({sourceIndex, revealClickCount: null, totalClicks});
    }
    if (frames.length > MAX_EXPORT_FRAMES) {
      throw new Error("L'export progressif dépasserait " + MAX_EXPORT_FRAMES +
        " écrans. Réduisez les apparitions ou choisissez l'export statique.");
    }
  }
  return frames;
}
