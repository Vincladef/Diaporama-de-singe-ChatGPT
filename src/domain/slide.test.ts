import { describe, expect, it } from "vitest";
import { SlideDocumentSchema, createEmptySlideDocument } from "./slide";

describe("versioned slide document", () => {
  it("accepts an empty 16:9 document", () => {
    const doc = createEmptySlideDocument();
    expect(SlideDocumentSchema.parse(doc).canvas).toEqual({ width: 1920, height: 1080 });
  });

  it("supports freeform HTML/CSS without discarding the structured data", () => {
    const doc = { ...createEmptySlideDocument(), mode: "hybrid", freeform: { html: "<h1>Bonjour</h1>", css: "h1{font-size:4rem}" } };
    expect(SlideDocumentSchema.parse(doc).freeform?.html).toContain("Bonjour");
  });

  it("rejects unsupported schema versions", () => {
    expect(() => SlideDocumentSchema.parse({ ...createEmptySlideDocument(), schemaVersion: 2 })).toThrow();
  });

  it("validates click-based animation steps", () => {
    const doc = {
      ...createEmptySlideDocument(),
      animations: [{ id: "a1", targetElementId: "title", order: 0, trigger: "click", effect: "appear", durationMs: 300 }],
    };
    expect(SlideDocumentSchema.parse(doc).animations[0]?.trigger).toBe("click");
  });
});
