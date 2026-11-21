import { test } from "node:test";
import assert from "node:assert/strict";
import { applySlideLayout, SLIDE_LAYOUTS } from "./slideLayouts.ts";
import { createEmptySlideDocument } from "../domain/slide.ts";

test("native layouts have a unique id and preserve document dimensions",()=>{
  assert.equal(new Set(SLIDE_LAYOUTS.map(layout=>layout.id)).size,SLIDE_LAYOUTS.length);
  const doc=createEmptySlideDocument();
  for(const layout of SLIDE_LAYOUTS){
    const out=applySlideLayout(doc,layout.id);
    assert.deepEqual(out.canvas,doc.canvas);
    assert.equal(out.themeId,"blanc");
  }
});
test("title and content creates distinct editable text placeholders",()=>{
  const doc=applySlideLayout(createEmptySlideDocument(),"title-body");
  assert.equal(doc.elements.length,2);
  assert.ok(doc.elements.every(e=>e.type==="text"&&e.text===""));
  assert.notEqual(doc.elements[0]?.id,doc.elements[1]?.id);
});
test("changing layout preserves existing text, photos, notes-independent HTML, and animations",()=>{
  const empty=createEmptySlideDocument();
  const doc={...empty,mode:"hybrid" as const,
    elements:[
      {id:"t1",type:"text" as const,text:"Mon titre",styles:{left:"10px",top:"10px"}},
      {id:"p1",type:"image" as const,src:"https://example.org/photo.jpg",styles:{width:"400px"}},
      {id:"s1",type:"shape" as const,styles:{width:"300px",height:"300px"}}
    ],
    freeform:{html:"<section>Composition IA</section>",css:"section{color:red}"},
    animations:[{id:"a1",targetElementId:"s1",order:0,trigger:"click" as const,effect:"fade" as const,durationMs:400}]
  };
  const out=applySlideLayout(doc,"two-columns");
  assert.equal(out.elements.find(e=>e.id==="t1")?.text,"Mon titre");
  assert.ok(out.elements.some(e=>e.id==="p1"));
  assert.ok(out.elements.some(e=>e.id==="s1"));
  assert.deepEqual(out.freeform,doc.freeform);
  assert.deepEqual(out.animations,doc.animations);
  assert.equal(out.elements.filter(e=>e.type==="text").length,3);
});
test("image-caption offers an editable image slot and keeps a pre-existing image",()=>{
  const empty=createEmptySlideDocument();
  const out=applySlideLayout(empty,"image-caption");
  assert.equal(out.elements.filter(e=>e.type==="image").length,1);
  assert.equal(out.elements.find(e=>e.type==="image")?.src,undefined);
  const added={...empty,elements:[{id:"photo",type:"image" as const,src:"https://example.org/p.jpg",styles:{}}]};
  assert.equal(applySlideLayout(added,"image-caption").elements.find(e=>e.type==="image")?.id,"photo");
});
test("blank layout is a no-op; freeform layout becomes hybrid without flattening",()=>{
  const doc=createEmptySlideDocument();
  assert.equal(applySlideLayout(doc,"blank"),doc);
  const free={...doc,mode:"freeform" as const,freeform:{html:"<p>AI</p>",css:"p{color:blue}"}};
  const result=applySlideLayout(free,"title");
  assert.equal(result.mode,"hybrid");
  assert.equal(result.freeform?.html,"<p>AI</p>");
});
