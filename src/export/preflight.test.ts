import test from "node:test";
import assert from "node:assert/strict";
import { createEmptySlideDocument } from "../domain/slide.ts";
import { inspectExport } from "./preflight.ts";
test("distinguishes editable text, mixed HTML and raster-only diagrams",()=>{
 const native=createEmptySlideDocument();
 native.elements=[{id:"title",type:"text",text:"Titre",styles:{left:"0px",top:"0px"}}];
 const mixed=structuredClone(native);
 mixed.mode="hybrid";mixed.freeform={html:"<div>Composition</div>",css:""};
 const raster=structuredClone(native);
 raster.elements.push({id:"art",type:"svg",text:"<svg></svg>",styles:{}});
 const report=inspectExport([{document:native,notes:"Intro"},
   {document:mixed},{document:raster}]);
 assert.equal(report.slideCount,3);
 assert.equal(report.fullyNative,1);assert.equal(report.mixedEditable,1);
 assert.equal(report.rasterOnly,1);
 assert.equal(report.slides[0]?.notesPresent,true);
 assert.equal(report.googleSlides.directPublish,false);
 assert.equal(report.googleSlides.webEditorPublish,true);
 assert.equal(report.googleSlides.requiresOAuth,true);
});
test("flags CORS risks, non-native animation and aspect ratio changes",()=>{
 const a=createEmptySlideDocument(),b=createEmptySlideDocument();
 a.elements=[{id:"photo",type:"image",src:"https://example.org/photo.png",styles:{}}];
 a.animations=[{id:"enter",order:0,trigger:"click",effect:"fade",targetElementId:"photo",durationMs:350}];
 b.canvas={width:1920,height:1200};
 const report=inspectExport([{document:a},{document:b}]);
 assert.equal(report.totalRemoteImages,1);
 assert.equal(report.animatedSlides,1);
 assert.ok(report.warnings.some(w=>w.includes("animations Web")));
 assert.ok(report.warnings.some(w=>w.includes("Format différent")));
});
