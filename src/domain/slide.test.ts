import test from "node:test";
import assert from "node:assert/strict";
import { SlideDocumentSchema, createEmptySlideDocument } from "./slide.ts";
import {editSlide} from "../mcp/documents.ts";

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

test("editable layer metadata persists without changing the slide format",()=>{
 const doc=createEmptySlideDocument();
 doc.elements=[{id:"title",type:"text",text:"Titre",name:"Grand titre",
  hidden:false,locked:true,groupId:"cluster-1",groupName:"Chronologie",styles:{}}];
 const value=SlideDocumentSchema.parse(doc);
 assert.equal(value.elements[0]?.name,"Grand titre");
 assert.equal(value.elements[0]?.locked,true);
 assert.equal(value.elements[0]?.groupName,"Chronologie");
});

test("le choix de composition A/B/C survit aux retouches manuelles",()=>{
  const doc=createEmptySlideDocument();
  doc.variantSelection={
    originalId:"00000000-0000-4000-8000-000000000001",
    activeId:"00000000-0000-4000-8000-000000000002",
  };
  const changed=editSlide(doc,"Notes existantes",[{op:"set_html",html:"<h1>Version B</h1>"}]);
  assert.deepEqual(changed.document.variantSelection,doc.variantSelection);
  assert.equal(changed.notes,"Notes existantes");
  assert.equal(SlideDocumentSchema.parse(changed.document).variantSelection?.activeId,doc.variantSelection.activeId);
});
