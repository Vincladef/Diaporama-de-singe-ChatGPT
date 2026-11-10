import assert from "node:assert/strict";
import {test} from "node:test";
import JSZip from "jszip";
import {extractPowerPointGeometry,summarizePowerPointGeometry} from "./referenceGeometry.ts";

async function createDeck(slideFiles:Record<string,string>):Promise<Uint8Array>{
  const zip=new JSZip();
  zip.file("ppt/presentation.xml",
    '<p:presentation xmlns:p="p"><p:sldSz cy="720" cx="1280"/></p:presentation>');
  for (const [name,content] of Object.entries(slideFiles))
    zip.file("ppt/slides/"+name,content);
  return zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
}
const positionedText = (text:string,x:number,y:number,w:number,h:number) =>
  '<p:sp><p:spPr><a:xfrm><a:off y="'+y+'" x="'+x+'"/><a:ext cy="'+h+'" cx="'+w+'"/></a:xfrm></p:spPr>'+
  '<p:txBody><a:p><a:r><a:t>'+text+'</a:t></a:r></a:p></p:txBody></p:sp>';
const positionedImage = (x:number,y:number,w:number,h:number) =>
  '<p:pic><p:spPr><a:xfrm><a:off x="'+x+'" y="'+y+'"/><a:ext cx="'+w+'" cy="'+h+'"/></a:xfrm></p:spPr></p:pic>';

test("extracts positions, images and titles from PowerPoint DrawingML",async()=>{
  const bytes=await createDeck({"slide1.xml":
    '<p:sld><p:spTree>'+
    positionedText("Question &amp; preuve",128,72,450,90)+
    positionedImage(640,0,640,720)+
    '</p:spTree></p:sld>'});
  const ref=await extractPowerPointGeometry(bytes);
  assert.equal(ref.slideCount,1);
  assert.equal(ref.rendered,false);
  assert.equal(ref.source,"pptx-drawingml");
  assert.equal(ref.aspectRatio,1.778);
  assert.equal(ref.slides[0]?.title,"Question & preuve");
  assert.equal(ref.slides[0]?.imageCount,1);
  assert.equal(ref.slides[0]?.textCount,1);
  assert.deepEqual(ref.slides[0]?.items[0]?.frame,{x:10,y:10,width:35.2,height:12.5});
  assert.deepEqual(ref.slides[0]?.items[1]?.frame,{x:50,y:0,width:50,height:100});
  assert.match(summarizePowerPointGeometry(ref),/image \(50\/0\/50\/100 %\)/);
});

test("sorts slide files numerically and ignores oversized XML members",async()=>{
  const bytes=await createDeck({
    "slide10.xml":"<p:sld>"+positionedText("Dix",0,0,300,80)+"</p:sld>",
    "slide2.xml":"<p:sld>"+positionedText("Deux",0,0,300,80)+"</p:sld>",
    "slide1.xml":"<p:sld>"+positionedText("Un",0,0,300,80)+"</p:sld>"
  });
  const ref=await extractPowerPointGeometry(bytes,2);
  assert.equal(ref.slideCount,3);
  assert.deepEqual(ref.slides.map(x=>x.index),[1,2]);
  assert.equal(ref.slides[1]?.title,"Deux");
});

test("rejects empty archives and caps summary output",async()=>{
  await assert.rejects(()=>extractPowerPointGeometry(new Uint8Array()),/invalid_reference_size/);
  const bytes=await createDeck({"slide1.xml":'<p:sld>'+positionedText("Titre",0,0,500,120)+'</p:sld>'});
  const ref=await extractPowerPointGeometry(bytes);
  assert.ok(summarizePowerPointGeometry(ref,80).length<=80);
});
