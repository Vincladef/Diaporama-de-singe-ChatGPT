import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { XMLValidator } from "fast-xml-parser";
import { createEmptySlideDocument } from "../domain/slide.ts";
import { buildExportFrames } from "./reveals.ts";
import { canUseNativeAnimations, buildNativeTimingXml, addNativeAnimationsToPptx, readNativeShapeIds } from "./nativeAnimations.ts";

function sample(){
  const doc=createEmptySlideDocument();
  doc.elements=[
    {id:"block",type:"text",text:"Un bloc",styles:{}},
    {id:"arrow",type:"shape",styles:{background:"#223344"}},
  ];
  doc.animations=[
    {id:"a",targetElementId:"block",order:0,trigger:"click",effect:"fade",durationMs:560},
    {id:"b",targetElementId:"arrow",order:1,trigger:"click",effect:"wipe",durationMs:440},
  ];
  return doc;
}
const baseXml='<?xml version="1.0" encoding="UTF-8"?>'+
 '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'+
 '<p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="block"/>'+
 '</p:nvSpPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="arrow"/>'+
 '</p:nvSpPr></p:sp></p:spTree></p:cSld><p:clrMapOvr/></p:sld>';

test("OOXML stores 2 ordered real PowerPoint click effects on one slide",()=>{
  const doc=sample();
  assert.equal(canUseNativeAnimations(doc),true);
  const xml=buildNativeTimingXml(baseXml,doc);
  assert.equal(XMLValidator.validate(xml),true);
  assert.equal((xml.match(/nodeType="clickEffect"/g)||[]).length,2);
  assert.equal((xml.match(/delay="indefinite"/g)||[]).length,2);
  assert.match(xml,/presetID="10".*filter="fade"/s);
  assert.match(xml,/presetID="22".*filter="wipe\(left\)"/s);
  assert.match(xml,/spid="2"/);
  assert.match(xml,/spid="3"/);
  assert.equal((xml.match(/<p:timing>/g)||[]).length,1);
  const ids=[...xml.matchAll(/<p:cTn\b[^>]*\bid="(\d+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  assert.deepEqual(buildExportFrames([doc],"native").map(v=>v.revealClickCount),[null]);
});

test("unconvertible HTML falls back to progressive frames, preserving visual behavior",()=>{
  const doc=sample();
  doc.mode="freeform";
  doc.freeform={html:'<div id="block">Texte</div>',css:""};
  assert.equal(canUseNativeAnimations(doc),false);
  assert.deepEqual(buildExportFrames([doc],"native").map(v=>v.revealClickCount),[0,1,2]);
});

test("timing targets escaped PowerPoint object names",()=>{
  assert.equal(readNativeShapeIds('<p:cNvPr id="15" name="Bloc &amp; lien"></p:cNvPr>').get("Bloc & lien"),15);
  assert.throws(()=>buildNativeTimingXml(baseXml.replace('name="arrow"','name="not-the-arrow"'),sample()),/introuvable/);
});

test("ZIP receives a timing tree without multiplying slides",async()=>{
  const zip=new JSZip();
  zip.file("ppt/slides/slide1.xml",baseXml);
  const bytes=await zip.generateAsync({type:"uint8array"});
  const blob=new Blob([new Uint8Array(bytes)]);
  const patched=await addNativeAnimationsToPptx(blob,[{index:0,document:sample()}]);
  const result=await JSZip.loadAsync(patched);
  assert.ok(result.file("ppt/slides/slide1.xml"));
  assert.equal(result.file("ppt/slides/slide2.xml"),null);
  const xml=await result.file("ppt/slides/slide1.xml")!.async("string");
  assert.equal(XMLValidator.validate(xml),true);
  assert.match(xml,/<p:timing>/);
});
