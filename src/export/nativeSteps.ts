import type { SlideDocument, SlideElement, AnimationStep } from "../domain/slide.ts";
import { buildPlaybackPlan } from "../animation/timeline.ts";

const entrance = new Set<AnimationStep["effect"]>(["appear", "fade", "move", "scale", "wipe", "custom"]);

/** Which structured objects remain visible at a click boundary? 
 * Enables editability even when a logical slide expands into multiple export pages.
 */
export function visibleStructuredElements(document: SlideDocument, clickCount: number): SlideElement[] {
  const plan = buildPlaybackPlan(document.animations);
  const applied = [...plan.intro, ...plan.clicks.slice(0, Math.max(0, clickCount)).flat()];
  const affect = (step: AnimationStep, item: SlideElement): boolean => {
    if (step.targetElementId) return step.targetElementId === item.id;
    if (!step.targetSelector) return false;
    return step.targetSelector === '[data-id="' + item.id + '"]' ||
      step.targetSelector === '#' + item.id;
  };
  return document.elements.filter(item => {
    const allCues = plan.all.filter(step => affect(step, item));
    const firstEntrance = allCues.some(step => entrance.has(step.effect));
    let shown = !firstEntrance;
    for (const cue of applied) {
      if (!affect(cue, item)) continue;
      if (entrance.has(cue.effect)) shown = true;
      else if (cue.effect === "hide") shown = false;
      else if (cue.effect === "highlight" || cue.effect === "dim") shown = true;
    }
    return shown;
  });
}
