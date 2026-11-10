import assert from "node:assert/strict";
import {test} from "node:test";
import pptxgen from "pptxgenjs";
import {renderPptxReferenceBatch} from "./referenceRendering.ts";

test("renders a genuine PPTX page to PNG with image dimensions and layout metadata",async()=>{
  const presentation=new pptxgen();
  presentation.layout="LAYOUT_WIDE";
  const slide=presentation.addSlide();
  slide.background={color:"F2F2EE"};
  slide.addText("Exemple visuel",{
    x:0.7,y:0.5,w:6,h:1,fontFace:"Arial",fontSize:36,color:"202020"
  });
  slide.addShape(presentation.ShapeType.rect,{x:0.7,y:1.8,w:10.5,h:3.1,fill:{color:"557B61"},line:{color:"557B61"}});
  const buffer=await presentation.write({outputType:"nodebuffer"});
  const bytes=new Uint8Array(buffer as Buffer);
  const result=await renderPptxReferenceBatch(bytes,1,1);
  assert.equal(result.totalSlides,1);
  assert.equal(result.pages.length,1);
  assert.equal(result.pages[0]?.slideNumber,1);
  assert.equal(result.pages[0]?.width,960);
  assert.ok((result.pages[0]?.height??0)>400);
  assert.ok((result.pages[0]?.png.byteLength??0)>100);
  assert.ok(result.pages[0]?.png.subarray(0,4).every((b,i)=>b===[137,80,78,71][i]));
  assert.ok(result.pages[0]?.layout.textCount);
});
test("renders a requested later slide without losing the source slide number",async()=>{
  const presentation=new pptxgen();
  presentation.layout="LAYOUT_WIDE";
  presentation.addSlide().addText("Première page",{x:1,y:1,w:5,h:1,fontSize:22});
  presentation.addSlide().addText("Seconde page",{x:1,y:1,w:5,h:1,fontSize:22});
  const bytes=new Uint8Array(await presentation.write({outputType:"nodebuffer"}) as Buffer);
  const result=await renderPptxReferenceBatch(bytes,2,1);
  assert.equal(result.totalSlides,2);
  assert.equal(result.pages.length,1);
  assert.equal(result.pages[0]?.slideNumber,2);
  assert.ok(result.pages[0]?.png.byteLength);
});

test("rejects invalid PowerPoint preview batches",async()=>{
  await assert.rejects(()=>renderPptxReferenceBatch(new Uint8Array(),1,1),/invalid_reference_file/);
  await assert.rejects(()=>renderPptxReferenceBatch(new Uint8Array(200),1,4),/invalid_reference_batch/);
});
