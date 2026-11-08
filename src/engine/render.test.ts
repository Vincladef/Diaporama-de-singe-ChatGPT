import test from "node:test";
import assert from "node:assert/strict";
import { createEmptySlideDocument, type SlideDocument } from "../domain/slide.ts";
import { renderSlideHtml } from "./render.ts";

test("renders arbitrary HTML/CSS free of fixed templates", () => {
  const slide: SlideDocument = { ...createEmptySlideDocument(), mode: "freeform", freeform: { html: "<h1>Libre</h1>", css: "h1{color:teal}" } };
  const html = renderSlideHtml(slide);
  assert.ok(html.includes("<h1>Libre</h1>"));
  assert.ok(html.includes("h1{color:teal}"));
  assert.ok(html.includes("script-src &#39;none&#39;"));
});
test("escapes structured text and retains stable element IDs", () => {
  const slide: SlideDocument = { ...createEmptySlideDocument(), elements: [
    { id: "title", type: "text", text: "<script>oops()</script>", styles: { top: "40px", fontSize: "80px" } },
  ] };
  const html = renderSlideHtml(slide);
  assert.ok(html.includes('data-id="title"'));
  assert.ok(html.includes("font-size:80px"));
  assert.ok(!html.includes("<script>oops()</script>"));
});
test("disallows unsafe image protocols", () => {
  const slide: SlideDocument = { ...createEmptySlideDocument(), elements: [
    { id: "image", type: "image", src: "javascript:alert(1)", styles: {} },
  ] };
  assert.ok(renderSlideHtml(slide).includes('src=""'));
});
test("hybrid documents render freeform and structured layers", () => {
  const slide: SlideDocument = { ...createEmptySlideDocument(), mode: "hybrid",
    freeform: { html: "<section>Backdrop</section>", css: "" },
    elements: [{ id: "overlay", type: "text", text: "Overlay", styles: {} }],
  };
  const html = renderSlideHtml(slide);
  assert.ok(html.includes("Backdrop") && html.includes("Overlay"));
});
