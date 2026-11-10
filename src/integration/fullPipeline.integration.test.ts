import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {clarkWellsDemonstration} from "./clarkWellsDemonstration.ts";
import {SlideDocumentSchema} from "../domain/slide.ts";
import {layoutSignature} from "../variants/independent.ts";
import {captureSlidePixels} from "../visual/capture.ts";
import {inspectMarkupMedia} from "../quality/markupMedia.ts";
import {inspectExport} from "../export/preflight.ts";

process.env.VISUAL_USE_LOCAL_CHROMIUM="1";
const demos=clarkWellsDemonstration;
const groups=[0,1,2].map(i=>demos.filter(x=>x.slide_index===i));

test("actual Neon demonstration has three distinct AI compositions on each science slide",()=>{
 assert.equal(demos.length,9);
 for(const [idx,group] of groups.entries()){
   assert.equal(group.length,3,"three saved alternatives for slide "+idx);
   assert.equal(new Set(group.map(x=>x.variant_id)).size,3);
   assert.equal(new Set(group.map(x=>layoutSignature(x.document))).size,3,
     "three genuine layouts, not fixed recolorings");
   for(const item of group){
     assert.doesNotThrow(()=>SlideDocumentSchema.parse(item.document));
     assert.match(item.notes,/Clark|Wells/i);
     assert.ok(item.document.freeform?.html.trim());
     assert.ok(item.document.freeform?.css.trim());
     assert.ok(item.document.animations.some(a=>a.trigger==="click"));
     assert.equal(item.document.canvas.width,1920);
     assert.equal(item.document.canvas.height,1080);
     const animatedTargets=item.document.animations.filter(a=>
       a.targetSelector?item.document.freeform?.html.includes(a.targetSelector.slice(1)):true);
     assert.equal(animatedTargets.length,item.document.animations.length,
       "all reveal targets exist on the real slide");
   }
   assert.ok(group.some(x=>
     inspectMarkupMedia(x.document).imageCount+x.document.elements.filter(e=>e.type==="image").length>0),
     "every topic includes at least one photographic direction");
   const risks=inspectExport(group.map(x=>({document:x.document,notes:x.notes})));
   assert.equal(risks.slides.length,3);
 }
});

test("Chromium draws the nine persisted variants with loaded photos and 16:9 pixels",
 {timeout:300_000},async()=>{
 await mkdir("artifacts/integration",{recursive:true});
 const diagnostics=[];
 for(const variant of demos){
   console.log("INTEGRATION_PIXEL_START",variant.slide_index,variant.name);
   const rendered=await captureSlidePixels(variant.document);
   const d=rendered.diagnostics;
   assert.equal(d.browser,"Chromium");
   assert.equal(d.pixelWidth,1920);
   assert.equal(d.pixelHeight,1080);
   assert.equal(d.fontsReady,true,"fonts loaded: "+variant.name);
   assert.ok(rendered.png.length>8_000,"PNG contains real pixels: "+variant.name);
   assert.equal(d.missingImages,0,"missing image(s): "+variant.name+" "+JSON.stringify(d));
   assert.equal(d.failedRequests,0,"failed/blocked resource(s): "+variant.name+" "+JSON.stringify(d));
   const mandatory=inspectMarkupMedia(variant.document).imageCount+
     variant.document.elements.filter(e=>e.type==="image").length;
   if(mandatory)assert.ok(d.imageCount>=mandatory,"expected photos in DOM: "+variant.name);
   const fatal=d.issues.filter(x=>x.kind==="missing_image"||x.kind==="off_canvas");
   assert.equal(fatal.length,0,"fatal geometry: "+variant.name+" "+JSON.stringify(fatal));
   const file="visual-"+(variant.slide_index+1)+"-"+variant.name[0]+".png";
   await writeFile("artifacts/integration/"+file,rendered.png);
   diagnostics.push({slide:variant.slide_index+1,name:variant.name,file,...d});
   console.log("INTEGRATION_PIXEL_COMPLETE",variant.slide_index,variant.name,
     "bytes="+rendered.png.length,"photos="+d.loadedImages+"/"+d.imageCount,
     "issues="+d.issues.length);
 }
 await writeFile("artifacts/integration/report.json",JSON.stringify(diagnostics,null,2));
});
