import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { createEmptySlideDocument } from "../domain/slide.ts";
import { importNativeJson,importPowerPoint } from "./parse.ts";
import { partitionSlides } from "./submit.ts";

function simpleSlide(content:string,notes:string){
  return {document:{...createEmptySlideDocument(),elements:[
    {id:"text",type:"text" as const,text:content,styles:{left:"90px",top:"80px"}}
  ]},notes};
}
function slideXml(text:string){
  return '<?xml version="1.0" encoding="UTF-8"?>'+
  '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'+
  '<p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Titre"/></p:nvSpPr><p:spPr>'+
  '<a:xfrm><a:off x="914400" y="457200"/><a:ext cx="5486400" cy="1828800"/></a:xfrm></p:spPr>'+
  '<p:txBody><a:p><a:r><a:rPr sz="3600"/><a:t>'+text+'</a:t></a:r></a:p></p:txBody>'+
  '</p:sp></p:spTree></p:cSld></p:sld>';
}
async function fixture(){
 const zip=new JSZip();
 zip.file("ppt/presentation.xml",'<p:presentation xmlns:p="ppt"><p:sldIdLst>'+
   '<p:sldId id="256" r:id="rId4"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst>'+
   '<p:sldSz cx="12192000" cy="6858000"/></p:presentation>');
 zip.file("ppt/_rels/presentation.xml.rels",'<Relationships>'+
   '<Relationship Id="rId2" Target="slides/slide1.xml" Type="slide"/>'+
   '<Relationship Id="rId4" Target="slides/slide2.xml" Type="slide"/></Relationships>');
 zip.file("ppt/slides/slide1.xml",slideXml("Première"));
 zip.file("ppt/slides/slide2.xml",slideXml("Deuxième"));
 zip.file("ppt/slides/_rels/slide2.xml.rels",'<Relationships><Relationship Id="rId8" Target="../notesSlides/notesSlide2.xml" Type="notesSlide"/></Relationships>');
 zip.file("ppt/notesSlides/notesSlide2.xml",'<p:notes><p:cSld><p:spTree><p:sp>'+
   '<p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>'+
   '<p:txBody><a:p><a:r><a:t>Note principale</a:t></a:r></a:p></p:txBody>'+
   '</p:sp></p:spTree></p:cSld></p:notes>');
 return zip.generateAsync({type:"arraybuffer"});
}
test("PowerPoint import preserves slide ordering, native text and speaker notes",async()=>{
 const deck=await importPowerPoint(await fixture(),"Test.pptx");
 assert.equal(deck.kind,"pptx");
 assert.equal(deck.slides.length,2);
 assert.equal(deck.slides[0]?.document.elements[0]?.text,"Deuxième");
 assert.equal(deck.slides[0]?.notes,"Note principale");
 assert.equal(deck.slides[1]?.document.elements[0]?.text,"Première");
 assert.equal(deck.slides[0]?.document.canvas.width,1920);
 assert.ok(deck.slides[0]!.document.elements[0]!.styles.left);
});
test("missing PPTX components are rejected, not imported as blank slides",async()=>{
 const zip=new JSZip();zip.file("wrong.txt","not-a-pptx");
 await assert.rejects(importPowerPoint(await zip.generateAsync({type:"arraybuffer"}),"fake.pptx"),
  /ppt\/presentation.xml/);
});
test("native JSON export round-trips slide documents, HTML and notes",()=>{
 const input={presentation:{title:"Atelier"},slides:[simpleSlide("Bonjour","Commentaire"),
  {document:{...createEmptySlideDocument(),mode:"freeform",freeform:{html:"<h1>Libre</h1>",css:"h1{color:red}"}},notes:"Référence"}]};
 const imported=importNativeJson(JSON.stringify(input),"atelier.json");
 assert.equal(imported.title,"Atelier");
 assert.deepEqual(imported.slides[0]?.document,input.slides[0]?.document);
 assert.equal(imported.slides[0]?.notes,"Commentaire");
 assert.equal(imported.slides[1]?.document.freeform?.html,"<h1>Libre</h1>");
});
test("import rejects incompatible schema and invalid files",()=>{
 assert.throws(()=>importNativeJson('{"slides":[{"document":{"schemaVersion":3}}]}',"bad.json"));
 assert.throws(()=>importNativeJson('{"slides":[]}',"empty.json"),/entre 1 et 40/);
});
test("import batches large documents without changing order",()=>{
 const rows=Array.from({length:39},(_,i)=>simpleSlide("A".repeat(60000)+i,"Notes "+i));
 const groups=partitionSlides(rows);
 assert.ok(groups.length>=2);
 assert.deepEqual(groups.flat().map(s=>s.notes),rows.map(s=>s.notes));
 assert.ok(groups.every(c=>c.length<=20));
});

test("PowerPoint import preserves interleaved image/text drawing order",async()=>{
 const zip=await JSZip.loadAsync(await fixture());
 const xml=await zip.file("ppt/slides/slide1.xml")!.async("string");
 const image='<p:pic><p:blipFill><a:blip r:embed="rId9"/></p:blipFill><p:spPr>'+
 '<a:xfrm><a:off x="150000" y="400000"/><a:ext cx="1400000" cy="1400000"/></a:xfrm>'+
 '</p:spPr></p:pic>';
 zip.file("ppt/slides/slide1.xml",xml.replace("<p:spTree>","<p:spTree>"+image)
  .replace("</p:spTree>",""+image+"</p:spTree>"));
 zip.file("ppt/slides/_rels/slide1.xml.rels",'<Relationships>'+
 '<Relationship Id="rId9" Target="../media/portrait.png" Type="image"/></Relationships>');
 zip.file("ppt/media/portrait.png",Buffer.from(
 "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAJ1dB1cAAAAASUVORK5CYII=","base64"));
 const loaded=await importPowerPoint(await zip.generateAsync({type:"arraybuffer"}),"interleaved.pptx");
 assert.deepEqual(loaded.slides[1]?.document.elements.map(e=>e.type),["image","text","image"]);
 assert.equal(loaded.slides[1]?.document.elements[1]?.text,"Première");
});
test("PowerPoint import rejects an excessive compressed ZIP member before extraction",async()=>{
 const zip=new JSZip();
 zip.file("ppt/media/oversized.png",new Uint8Array(17_000_000));
 const bytes=await zip.generateAsync({type:"arraybuffer",compression:"DEFLATE"});
 await assert.rejects(importPowerPoint(bytes,"compressed-bomb.pptx"),/dépasse 16 Mo/);
});
