import test from "node:test";
import assert from "node:assert/strict";
import { createEmptySlideDocument } from "../domain/slide.ts";
import { buildExportFrames, MAX_EXPORT_FRAMES } from "./reveals.ts";

const cue=(id:string,order:number,trigger:"click"|"after-previous",effect:"fade"|"hide"|"highlight"="fade")=>
 ({id,targetSelector:"#"+id,order,trigger,effect,durationMs:350});

test("each click produces a cumulative frame including the mostly-empty initial state",()=>{
 const animated=createEmptySlideDocument();
 animated.animations=[
   cue("arrow1",1,"after-previous"),cue("node1",0,"click"),
   cue("node2",2,"click"),cue("label",3,"after-previous"),
 ];
 const staticSlide=createEmptySlideDocument();
 const f=buildExportFrames([animated,staticSlide]);
 assert.deepEqual(f.map(x=>[x.sourceIndex,x.revealClickCount,x.totalClicks]),[
   [0,0,2],[0,1,2],[0,2,2],[1,null,0],
 ]);
});

test("intro-only animations do not create unnecessary click pages",()=>{
 const document=createEmptySlideDocument();
 document.animations=[cue("intro",0,"after-previous")];
 assert.deepEqual(buildExportFrames([document]).map(x=>x.revealClickCount),[null]);
});

test("static export preserves one completed slide even with many animations",()=>{
 const document=createEmptySlideDocument();
 document.animations=[cue("a",0,"click"),cue("b",1,"click")];
 const frames=buildExportFrames([document],"static");
 assert.deepEqual(frames.map(x=>x.revealClickCount),[null]);
});

test("excessive slide multiplication fails explicitly rather than truncating the click sequence",()=>{
 const document=createEmptySlideDocument();
 document.animations=Array.from({length:50},(_,i)=>cue("x"+i,i,"click"));
 const docs=Array.from({length:5},()=>document);
 assert.throws(()=>buildExportFrames(docs),new RegExp(String(MAX_EXPORT_FRAMES)));
 assert.equal(buildExportFrames(docs,"static").length,5);
});
