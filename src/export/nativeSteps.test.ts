import test from "node:test";
import assert from "node:assert/strict";
import { visibleStructuredElements } from "./nativeSteps.ts";
import { createEmptySlideDocument } from "../domain/slide.ts";

test("structured objects preserve click-by-click editability", () => {
  const doc = createEmptySlideDocument();
  doc.elements = [
    { id: "background", type: "shape", styles: {} },
    { id: "a", type: "text", text: "Premier concept", styles: {} },
    { id: "arrow", type: "shape", styles: {} },
    { id: "b", type: "text", text: "Deuxième concept", styles: {} },
  ];
  doc.animations = [
    { id: "c1", targetElementId: "a", trigger: "click", order: 0, effect: "fade", durationMs: 300 },
    { id: "c2", targetElementId: "arrow", trigger: "click", order: 1, effect: "wipe", durationMs: 300 },
    { id: "c3", targetElementId: "b", trigger: "click", order: 2, effect: "scale", durationMs: 300 },
    { id: "c4", targetElementId: "arrow", trigger: "click", order: 3, effect: "hide", durationMs: 300 },
  ];
  const ids = (count: number) => visibleStructuredElements(doc, count).map(item => item.id);
  assert.deepEqual(ids(0), ["background"]);
  assert.deepEqual(ids(1), ["background", "a"]);
  assert.deepEqual(ids(2), ["background", "a", "arrow"]);
  assert.deepEqual(ids(3), ["background", "a", "arrow", "b"]);
  assert.deepEqual(ids(4), ["background", "a", "b"]);
});

test("automatic introduction appears before first click", () => {
  const doc = createEmptySlideDocument();
  doc.elements = [{ id: "intro", type: "text", styles: {} }];
  doc.animations = [
    { id: "automatic", targetElementId: "intro", trigger: "after-previous", order: 0, effect: "fade", durationMs: 250 },
  ];
  assert.deepEqual(visibleStructuredElements(doc, 0).map(x => x.id), ["intro"]);
});
