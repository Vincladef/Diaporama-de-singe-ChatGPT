import test from "node:test";
import assert from "node:assert/strict";
import {reorderForegroundLayers} from "./layerOrder.ts";

const layers=[
  {id:"backdrop-free-text",zIndex:0},
  {id:"shape",zIndex:0},
  {id:"top-text",zIndex:2},
];

test("moving a shape backward leaves it above the backdrop",()=>{
  const next=reorderForegroundLayers(layers,["shape"],"backward");
  assert.deepEqual(next.map(x=>x.id),["shape","backdrop-free-text","top-text"]);
  assert.ok(next.every(x=>x.zIndex>0));
});

test("bringing objects to front preserves all other object order",()=>{
  const next=reorderForegroundLayers(layers,["backdrop-free-text"],"front");
  assert.deepEqual(next.map(x=>x.id),["shape","top-text","backdrop-free-text"]);
});

test("one-level moves never hide a selected element behind its slide",()=>{
  for(const d of ["back","front","forward","backward"] as const){
    const next=reorderForegroundLayers(layers,["shape"],d);
    assert.ok(next.every(e=>e.zIndex>=10));
    assert.equal(new Set(next.map(e=>e.id)).size,3);
  }
});
