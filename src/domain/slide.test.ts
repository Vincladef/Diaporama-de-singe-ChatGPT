import test from "node:test";
import assert from "node:assert/strict";
import { SlideDocumentSchema, createEmptySlideDocument } from "./slide.ts";

test("un document vierge est valide et au format 16:9", () => {
  const doc = createEmptySlideDocument();
  assert.deepEqual(SlideDocumentSchema.parse(doc).canvas, { width: 1920, height: 1080 });
});

test("un document hybride autorise du HTML/CSS libre", () => {
  const doc = { ...createEmptySlideDocument(), mode: "hybrid", freeform: { html: "<h1>Bonjour</h1>", css: "h1{font-size:4rem}" } };
  assert.equal(SlideDocumentSchema.parse(doc).freeform?.html, "<h1>Bonjour</h1>");
});

test("une version inconnue est rejetée", () => {
  assert.throws(() => SlideDocumentSchema.parse({ ...createEmptySlideDocument(), schemaVersion: 2 }));
});

test("les apparitions au clic sont modélisables", () => {
  const doc = {
    ...createEmptySlideDocument(),
    animations: [{ id: "a1", targetElementId: "title", order: 0, trigger: "click", effect: "appear", durationMs: 300 }],
  };
  assert.equal(SlideDocumentSchema.parse(doc).animations[0]?.trigger, "click");
});
