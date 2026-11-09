import test from "node:test";
import assert from "node:assert/strict";
import {SlideDocumentSchema,createEmptySlideDocument} from "../domain/slide.ts";
import {withElementBoxes} from "../editor/geometry.ts";
import {makeSmartConnector,refreshSmartConnectors} from "./connectors.ts";

test("smart connector remains a native vector object and points to two objects",()=>{
  const doc=createEmptySlideDocument();
  doc.elements=[
    {id:"left",type:"shape",name:"A",styles:{left:"100px",top:"100px",width:"180px",height:"100px"}},
    {id:"right",type:"shape",name:"B",styles:{left:"800px",top:"230px",width:"200px",height:"100px"}},
  ];
  const connector=makeSmartConnector(doc,"left","right","arrow");
  assert.equal(connector.linkFrom,"left");
  assert.equal(connector.linkTo,"right");
  assert.equal(connector.type,"svg");
  assert.match(connector.text??"",/<polygon/);
  doc.elements.push(connector);
  assert.equal(SlideDocumentSchema.safeParse(doc).success,true);
});

test("connector geometry follows the movement of its linked shape",()=>{
  const doc=createEmptySlideDocument();
  doc.elements=[
    {id:"left",type:"shape",styles:{left:"0px",top:"0px",width:"100px",height:"100px"}},
    {id:"right",type:"shape",styles:{left:"300px",top:"0px",width:"100px",height:"100px"}},
  ];
  doc.elements.push(makeSmartConnector(doc,"left","right","arrow"));
  const before=doc.elements.find(el=>el.id==="arrow")!;
  const changed=withElementBoxes(doc,{right:{x:600,y:400,w:100,h:100}});
  const after=refreshSmartConnectors(changed).elements.find(el=>el.id==="arrow")!;
  assert.notEqual(after.text,before.text);
  assert.notEqual(after.styles.height,before.styles.height);
  assert.equal(after.linkTo,"right");
});
