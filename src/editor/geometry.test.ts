import test from "node:test";
import assert from "node:assert/strict";
import { createEmptySlideDocument } from "../domain/slide.ts";
import { alignElements, distributeElements, duplicateElements, elementBox, lengthToPx, transformBox, withElementBoxes, worldBox } from "./geometry.ts";

test("CSS coordinates support px, percentages and safe fallbacks",()=>{
  assert.equal(lengthToPx("25%", 1920),480);
  assert.equal(lengthToPx("128px", 1920),128);
  assert.equal(lengthToPx("auto", 1920,42),42);
});
test("dragging snaps positions to a grid",()=>{
  const b=transformBox({x:117,y:70,w:300,h:100},36,23,"move",10);
  assert.deepEqual(b,{x:150,y:90,w:300,h:100});
});
test("resize from top left maintains lower/right edges",()=>{
  const b=transformBox({x:80,y:60,w:400,h:220},30,20,"nw");
  assert.deepEqual(b,{x:110,y:80,w:370,h:200});
});
test("resizing never produces negative dimensions",()=>{
  const b=transformBox({x:80,y:60,w:400,h:220},1000,0,"w");
  assert.equal(b.w,12);
  assert.equal(b.x,468);
});
test("nested objects use parent offsets and preserve local coordinates when moved",()=>{
  const doc=createEmptySlideDocument();
  doc.elements=[
    {id:"parent",type:"group",styles:{left:"100px",top:"50px",width:"500px",height:"300px"}},
    {id:"child",type:"text",parentId:"parent",styles:{left:"20px",top:"30px",width:"150px",height:"50px"}}
  ];
  const child=doc.elements[1]!;
  assert.deepEqual(worldBox(child,doc),{x:120,y:80,w:150,h:50});
  const changed=withElementBoxes(doc,{child:{x:200,y:180,w:200,h:70}});
  assert.equal(changed.elements[1]?.styles.left,"100px");
  assert.equal(changed.elements[1]?.styles.top,"130px");
});
test("alignment and duplication keep original objects editable",()=>{
  const doc=createEmptySlideDocument();
  doc.elements=[
    {id:"a",type:"text",styles:{left:"40px",top:"80px",width:"100px",height:"50px"}},
    {id:"b",type:"shape",styles:{left:"230px",top:"210px",width:"200px",height:"50px"}}
  ];
  const aligned=alignElements(doc,["a","b"],"left");
  assert.equal(elementBox(aligned.elements[1]!,aligned).x,40);
  const duplicated=duplicateElements(doc,["a"],()=> "new-id");
  assert.equal(duplicated.document.elements.length,3);
  assert.equal(duplicated.document.elements[2]?.styles.left,"70px");
  assert.equal(doc.elements.length,2);
});

test("distributes three boxes with constant gaps without moving outer bounds",()=>{
  const doc=createEmptySlideDocument();
  doc.elements=[
    {id:"a",type:"shape",styles:{left:"100px",top:"0px",width:"100px",height:"40px"}},
    {id:"b",type:"shape",styles:{left:"220px",top:"0px",width:"100px",height:"40px"}},
    {id:"c",type:"shape",styles:{left:"700px",top:"0px",width:"100px",height:"40px"}}
  ];
  const result=distributeElements(doc,["a","b","c"],"horizontal");
  assert.equal(result.elements[0]?.styles.left,"100px");
  assert.equal(result.elements[1]?.styles.left,"400px");
  assert.equal(result.elements[2]?.styles.left,"700px");
});
test("duplicated semantic groups do not change their originals on future moves",()=>{
  const doc=createEmptySlideDocument();
  doc.elements=[
    {id:"a",type:"text",groupId:"original",groupName:"Étape",styles:{left:"20px"}},
    {id:"b",type:"text",groupId:"original",groupName:"Étape",styles:{left:"70px"}}
  ];
  let i=0;
  const copy=duplicateElements(doc,["a","b"],()=>String(++i));
  const duplicateIds=copy.document.elements.slice(2).map(e=>e.groupId);
  assert.equal(duplicateIds[0],duplicateIds[1]);
  assert.notEqual(duplicateIds[0],"original");
});
