import test from "node:test";
import assert from "node:assert/strict";
import { asColor, cssLength, pptxInches, safeDownloadName } from "./geometry.ts";

test("CSS lengths in pixels and percentages become canvas coordinates", () => {
  assert.equal(cssLength("20%", 1920, 0), 384);
  assert.equal(cssLength("120px", 1920, 0), 120);
  assert.equal(cssLength("42", 1920, 0), 42);
  assert.equal(cssLength("auto", 1920, 34), 34);
});
test("PowerPoint dimensions preserve normalized positioning", () => {
  assert.ok(Math.abs(pptxInches(960, 1920, 13.333) - 6.6665) < 0.0001);
});
test("colors are normalized for PowerPoint", () => {
  assert.equal(asColor("#abc"), "AABBCC");
  assert.equal(asColor("rgb(255, 0, 128)"), "FF0080");
  assert.equal(asColor("#12ef34"), "12EF34");
});
test("download names are stable and safe", () => {
  assert.equal(safeDownloadName("Été : Psychologie / intro"), "Ete-Psychologie-intro.pptx");
  assert.equal(safeDownloadName(""), "Diaporama-de-singe.pptx");
});
