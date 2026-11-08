import test from "node:test";
import assert from "node:assert/strict";
import { createEmptySlideDocument } from "../domain/slide.ts";
import { proposeGraphicVariants } from "./propose.ts";

test("three optional proposals preserve HTML content and original input",()=>{
 const doc={...createEmptySlideDocument(),mode:"freeform" as const,
   freeform:{html:"<h1>A scientific question</h1><p>Evidence</p>",css:"h1{font-size:110px}"}};
 const designs=proposeGraphicVariants(doc);
 assert.equal(designs.length,3);
 assert.equal(new Set(designs.map(d=>d.name)).size,3);
 assert.ok(designs.every(d=>d.document.freeform?.html===doc.freeform.html));
 assert.equal(doc.freeform.css,"h1{font-size:110px}");
 assert.ok(designs.every(d=>d.document.freeform?.css!==doc.freeform.css));
});
test("structured shapes and images are retained as editable elements",()=>{
 const doc=createEmptySlideDocument();
 doc.elements=[{id:"photo",type:"image",src:"https://example.org/photo.jpg",styles:{}},
   {id:"title",type:"text",text:"Science",styles:{fontSize:"60px"}}];
 const variants=proposeGraphicVariants(doc);
 assert.ok(variants.every(v=>v.document.elements.length===2));
 assert.ok(variants.every(v=>v.document.elements.some(e=>e.id==="photo"&&e.src==="https://example.org/photo.jpg")));
 assert.ok(variants.every(v=>v.document.elements.some(e=>e.id==="title"&&e.text==="Science")));
 assert.deepEqual(doc.elements[0]?.styles,{});
});
