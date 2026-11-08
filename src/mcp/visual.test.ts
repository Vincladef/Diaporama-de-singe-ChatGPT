import assert from "node:assert/strict";
import test from "node:test";
import { CompositionSchema, composeDocument, repairDocument, reviewDocument } from "./visual.ts";
import { createEmptySlideDocument } from "../domain/slide.ts";

test("seven semantic layouts generate valid, editable slide documents",()=>{
  for(const layout of ["hero","section","split","quote","cards","comparison","timeline"] as const){
    const spec=CompositionSchema.parse({layout,title:"Un sujet qui compte",
      subtitle:"Exemple de présentation",body:"Contenu à expliquer",
      items:["Découvrir","Expérimenter","Retenir"],imageUrl:"https://example.com/visual.jpg"});
    const doc=composeDocument(spec);
    assert.equal(doc.canvas.width,1920);
    assert.equal(doc.canvas.height,1080);
    assert.equal(doc.mode,"structured");
    assert.ok(doc.elements.some(e=>e.type==="text"&&e.id==="scene-title"));
    if(["hero","section","split","quote"].includes(layout))
      assert.ok(doc.elements.some(e=>e.type==="image"));
    assert.equal(new Set(doc.elements.map(e=>e.id)).size,doc.elements.length);
    assert.deepEqual(doc.animations,[]);
  }
});

test("review detects visible text overlap and estimated text overflow",()=>{
  const doc=createEmptySlideDocument();
  doc.elements=[
    {id:"a",type:"text",text:"x".repeat(500),styles:{left:"25px",top:"30px",width:"300px",height:"80px",fontSize:"35px"}},
    {id:"b",type:"text",text:"Quelques mots",styles:{left:"40px",top:"40px",width:"310px",height:"80px",fontSize:"35px"}}
  ];
  const report=reviewDocument(doc);
  assert.ok(report.issues.some(i=>i.code==="text_overlap"));
  assert.ok(report.issues.some(i=>i.code==="possible_text_overflow"));
  assert.equal(report.metrics.textBlocks,2);
});

test("safe repair is deterministic and leaves full-bleed imagery intact",()=>{
  const doc=createEmptySlideDocument();
  doc.elements=[
    {id:"photo",type:"image",src:"https://example.com/picture.png",
      styles:{left:"-20px",top:"0px",width:"1920px",height:"1080px"}},
    {id:"caption",type:"text",text:"Légende",
      styles:{left:"-45px",top:"1050px",width:"500px",height:"100px",fontSize:"14px"}},
    {id:"smaller-photo",type:"image",src:"https://example.com/detail.png",
      styles:{left:"1900px",top:"80px",width:"400px",height:"300px"}}
  ];
  const safe=repairDocument(doc,"safe");
  assert.equal(safe.document.elements[0]!.styles.left,"-20px");
  assert.equal(safe.document.elements[1]!.styles.left,"0px");
  assert.equal(safe.document.elements[1]!.styles.top,"980px");
  assert.equal(safe.document.elements[2]!.styles.left,"1520px");
  assert.equal(safe.document.elements[2]!.styles.objectFit,"cover");
  assert.equal(doc.elements[1]!.styles.left,"-45px");
  const raised=repairDocument(safe.document,"readability");
  assert.equal(raised.document.elements[1]!.styles.fontSize,"24px");
  assert.equal(repairDocument(raised.document,"readability").changes.length,0);
});

test("freeform content and existing animations survive conservative repair",()=>{
  const doc=createEmptySlideDocument();
  doc.mode="hybrid";
  doc.freeform={html:"<section><h1>Éditorial</h1></section>",css:"h1{color:red}"};
  doc.elements=[{id:"a",type:"text",text:"Exemple",
    styles:{left:"-30px",top:"0px",width:"300px",height:"140px",fontSize:"40px"}}];
  doc.animations=[{id:"reveal",targetElementId:"a",order:0,trigger:"click",effect:"fade",durationMs:350}];
  const out=repairDocument(doc);
  assert.deepEqual(out.document.freeform,doc.freeform);
  assert.deepEqual(out.document.animations,doc.animations);
  assert.equal(out.document.elements[0]!.styles.left,"0px");
});

test("schemas reject unsafe image protocols and excessive content",()=>{
  assert.throws(()=>CompositionSchema.parse({layout:"hero",title:"A",imageUrl:"javascript:alert(1)"}));
  assert.throws(()=>CompositionSchema.parse({layout:"cards",title:"A",items:Array(7).fill("x")}));
});
