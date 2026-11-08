import test from "node:test";
import assert from "node:assert/strict";
import {createEmptySlideDocument,type SlideDocument} from "../domain/slide.ts";
import {auditDeck,auditSlide} from "./audit.ts";

test("audits missing image sources and animation targets across the whole deck",()=>{
  const doc:SlideDocument={...createEmptySlideDocument(),elements:[
    {id:"missing",type:"image",styles:{left:"1950px",top:"90px",width:"500px"}},
    {id:"caption",type:"text",text:"Learning",styles:{fontSize:"16px"}}
  ],animations:[{id:"reveal",targetElementId:"unknown",order:0,trigger:"click",effect:"fade",durationMs:200}]};
  const result=auditDeck([{document:doc}]);
  assert.equal(result.readyToProject,false);
  assert.deepEqual(new Set(result.findings.map(x=>x.code)).has("missing_animation_target"),true);
  assert.ok(result.findings.some(x=>x.code==="image_source"));
  assert.ok(result.findings.some(x=>x.code==="off_canvas"));
  assert.ok(result.findings.some(x=>x.code==="small_font"));
});
test("checks PowerPoint conversion caveats without calling safe slides broken",()=>{
  const doc:SlideDocument={...createEmptySlideDocument(),mode:"hybrid",
    freeform:{html:"<h1>Reference</h1>",css:"h1{color:#fff}"},
    elements:[{id:"caption",type:"text",text:"Reference",styles:{left:"40px",fontSize:"48px",clipPath:"inset(0)"}}],
    animations:[]};
  const findings=auditSlide(doc,1);
  assert.ok(findings.some(x=>x.code==="pptx_rasterization"));
  assert.ok(findings.some(x=>x.code==="freeform_pptx"));
  const result=auditDeck([{document:doc}]);
  assert.equal(result.readyToProject,true);
  assert.equal(result.errorCount,0);
});
test("detects canvas aspect mismatch and duplicate ids",()=>{
  const original=createEmptySlideDocument();
  const changed:SlideDocument={...createEmptySlideDocument(),canvas:{width:1024,height:768},
    elements:[{id:"duplicate",type:"text",text:"A",styles:{}},{id:"duplicate",type:"text",text:"B",styles:{}}]};
  const summary=auditDeck([{document:original},{document:changed}]);
  assert.ok(summary.findings.some(x=>x.code==="mixed_aspect"));
  assert.ok(summary.findings.some(x=>x.code==="duplicate_id"));
});
