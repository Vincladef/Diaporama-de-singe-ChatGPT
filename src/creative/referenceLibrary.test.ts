import assert from "node:assert/strict";
import {test} from "node:test";
import {classifyReferenceSlide,rankReferencePages,type ReferencePageInfo} from "./referenceLibrary.ts";
import type {ReferenceSlideLayout} from "./referenceGeometry.ts";
const sample:ReferenceSlideLayout={
  index:4,title:"Ancienne étude",imageCount:1,textCount:2,diagramCount:0,
  items:[
    {kind:"image",frame:{x:0,y:0,width:60,height:100}},
    {kind:"text",text:"Ancienne étude",frame:{x:67,y:10,width:28,height:15}},
    {kind:"text",text:"Texte",frame:{x:67,y:38,width:27,height:20}}
  ]
};
test("categorises and describes photographic slide from layout geometry",()=>{
  const layout=classifyReferenceSlide(sample);
  assert.equal(layout.kind,"photographique");
  assert.equal(layout.imageCoverage,.6);
  assert.equal(layout.imageFrames.length,1);
  assert.ok(layout.composition.includes("photographie"));
  assert.equal(layout.geometrySignature.length,11);
});
test("search prefers matching category and geometry rather than source wording",()=>{
  const image=classifyReferenceSlide(sample);
  const comparison=classifyReferenceSlide({...sample,index:5,title:"Autre sujet",
    imageCount:0,textCount:5,items:Array.from({length:5},(_,i)=>({kind:"text" as const,
      frame:{x:i%2?52:8,y:10+i*12,width:36,height:9},text:"Donnée"}))});
  const pages:ReferencePageInfo[]=[
    {referenceId:"a",slideNumber:5,visualKind:comparison.kind,selected:true,layout:comparison,renderWarning:""},
    {referenceId:"a",slideNumber:4,visualKind:image.kind,selected:true,layout:image,renderWarning:""},
    {referenceId:"b",slideNumber:6,visualKind:"photographique",selected:false,layout:image,renderWarning:""},
  ];
  const result=rankReferencePages(pages,{kind:"photographique",imageDominant:true,geometrySignature:image.geometrySignature});
  assert.deepEqual(result.map(x=>x.slideNumber),[4,5]);
  assert.ok(result[0]!.score>result[1]!.score);
});
