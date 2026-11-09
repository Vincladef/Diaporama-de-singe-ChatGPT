import assert from "node:assert/strict";
import { test } from "node:test";
import { combineCreationInstructions } from "./instructions.ts";

test("les règles globales sont utilisées seules sans instruction locale",()=>{
  assert.equal(combineCreationInstructions("Images nombreuses",""),"Images nombreuses");
});
test("les instructions locales ont une priorité déclarée et préservent le global",()=>{
  const content=combineCreationInstructions("Style sobre","Palette rouge pour ce projet");
  assert.match(content,/Style sobre/);
  assert.match(content,/prioritaires en cas de conflit/);
  assert.ok(content.indexOf("Palette rouge")>content.indexOf("Style sobre"));
});
test("une consigne locale seule est valable",()=>{
  assert.equal(combineCreationInstructions("","Animations au clic"),"Animations au clic");
});
