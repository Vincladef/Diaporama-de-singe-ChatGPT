import test from "node:test";
import assert from "node:assert/strict";
import { AnimationStepSchema, SlideDocumentSchema, createEmptySlideDocument } from "../domain/slide.ts";
import { buildPlaybackPlan,initialPlaybackPosition,nextPosition,previousPosition,gotoSlide } from "./timeline.ts";

const cue=(id:string,order:number,trigger:"click"|"after-previous",effect:"appear"|"fade"="fade")=>
  AnimationStepSchema.parse({id,targetElementId:id,order,trigger,effect,durationMs:250});

test("click groups collect after-previous steps without demanding extra clicks",()=>{
 const plan=buildPlaybackPlan([
   cue("third",2,"after-previous"),
   cue("first",0,"click"),cue("second",1,"after-previous"),
   cue("fourth",3,"click"),
 ]);
 assert.equal(plan.intro.length,0);
 assert.equal(plan.clicks.length,2);
 assert.deepEqual(plan.clicks[0]?.map(c=>c.id),["first","second","third"]);
 assert.deepEqual(plan.clicks[1]?.map(c=>c.id),["fourth"]);
});
test("after-previous before any click forms automatic intro sequence",()=>{
 const plan=buildPlaybackPlan([cue("intro",0,"after-previous"),cue("later",1,"click")]);
 assert.deepEqual(plan.intro.map(c=>c.id),["intro"]);
 assert.equal(plan.clicks.length,1);
});
test("next moves through reveals before changing the slide",()=>{
 const first={...createEmptySlideDocument(),animations:[cue("x",0,"click"),cue("y",1,"click")]};
 const second={...createEmptySlideDocument(),animations:[cue("z",0,"click")]};
 const docs=[first,second],start=initialPlaybackPosition();
 assert.deepEqual(nextPosition(docs,start),{slide:0,reveal:1});
 assert.deepEqual(nextPosition(docs,{slide:0,reveal:2}),{slide:1,reveal:0});
 assert.deepEqual(nextPosition(docs,{slide:1,reveal:1}),{slide:1,reveal:1});
 assert.deepEqual(previousPosition(docs,{slide:1,reveal:0}),{slide:0,reveal:2});
 assert.deepEqual(previousPosition(docs,start),start);
 assert.deepEqual(gotoSlide(docs,1),{slide:1,reveal:0});
});
test("older animation documents and freeform CSS selector cues remain valid",()=>{
 const old=AnimationStepSchema.parse({id:"legacy",targetElementId:"title",trigger:"click",order:0,effect:"fade",durationMs:350});
 assert.equal(old.easing,undefined);
 const withSelector=AnimationStepSchema.parse({id:"css",targetSelector:".question",trigger:"after-previous",order:1,
   effect:"custom",durationMs:450,keyframes:[{opacity:0,transform:"translateY(60px)"},{opacity:1,transform:"translateY(0)"}]});
 const doc={...createEmptySlideDocument(),mode:"freeform" as const,
   freeform:{html:'<div class="question">Pourquoi ?</div>',css:""},animations:[old,withSelector]};
 assert.equal(SlideDocumentSchema.parse(doc).animations.length,2);
 assert.equal(SlideDocumentSchema.safeParse({...doc,animations:[{...old,targetElementId:undefined,targetSelector:undefined}]}).success,false);
});
test("timeline never mutates original cue order or data",()=>{
 const unordered=[cue("last",8,"click"),cue("first",2,"click")];
 const plan=buildPlaybackPlan(unordered);
 assert.deepEqual(unordered.map(x=>x.id),["last","first"]);
 assert.deepEqual(plan.all.map(x=>x.id),["first","last"]);
});
