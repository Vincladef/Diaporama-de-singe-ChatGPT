import test from "node:test";
import assert from "node:assert/strict";
import { DiagramSchema,composeDiagram } from "./diagrams.ts";
import { renderSlideHtml } from "../engine/render.ts";

const nodes=Array.from({length:5},(_,i)=>({id:"step-"+i,label:"Étape "+(i+1),detail:"Description "+i}));
for(const kind of ["mindmap","flow","cycle","hierarchy","causal","matrix"] as const){
  test("diagram "+kind+" renders editable nodes and valid vector connectors",()=>{
    const doc=composeDiagram(DiagramSchema.parse({kind,title:"Comprendre les mécanismes",nodes}));
    assert.equal(doc.canvas.width,1920);
    assert.ok(doc.elements.some(e=>e.id==="diagram-node-step-0"&&e.type==="text"));
    assert.equal(doc.elements.filter(e=>e.id.startsWith("diagram-panel-")).length,5);
    const html=renderSlideHtml(doc);
    assert.ok(html.includes("Étape 1"));
    if(kind!=="matrix")assert.ok(doc.elements.some(e=>e.id==="diagram-connectors"&&e.type==="svg"));
    assert.equal(new Set(doc.elements.map(e=>e.id)).size,doc.elements.length);
  });
}
test("diagram never injects user labels into raw svg markup",()=>{
  const doc=composeDiagram(DiagramSchema.parse({kind:"flow",title:"Sécurité",
    nodes:[{id:"a",label:'<script>alert("x")</script>'},{id:"b",label:"Suite"}]}));
  const connector=doc.elements.find(e=>e.id==="diagram-connectors")!;
  assert.ok(!connector.text?.includes("script"));
  const html=renderSlideHtml(doc);
  assert.ok(html.includes("&lt;script&gt;"));
});
test("invalid edges and duplicate node IDs are rejected",()=>{
  const base={kind:"flow" as const,title:"Test",nodes:[{id:"a",label:"A"},{id:"b",label:"B"}]};
  assert.equal(DiagramSchema.safeParse({...base,edges:[{from:"a",to:"absent"}]}).success,false);
  assert.equal(DiagramSchema.safeParse({...base,nodes:[{id:"a",label:"A"},{id:"a",label:"B"}]}).success,false);
});
test("focus and notes survive structured diagram generation",()=>{
  const d=DiagramSchema.parse({kind:"mindmap",title:"Idée",nodes,focus:"step-3",
    theme:"ink",notes:"Présenter lentement"});
  const doc=composeDiagram(d);
  assert.equal(d.notes,"Présenter lentement");
  assert.equal(doc.mode,"structured");
  assert.ok(doc.elements.some(e=>e.id==="diagram-panel-step-3"));
});

test("dense flow stays within slide bounds",()=>{
  const many=Array.from({length:16},(_,i)=>({id:"item-"+i,label:"Point "+i}));
  const doc=composeDiagram(DiagramSchema.parse({kind:"flow",title:"Seize étapes",nodes:many}));
  for(const e of doc.elements.filter(e=>e.id.startsWith("diagram-panel-"))){
    const y=Number.parseFloat(String(e.styles.top)),h=Number.parseFloat(String(e.styles.height));
    assert.ok(y>=0&&y+h<=1080,"panel must remain in canvas");
  }
});
test("hierarchy without explicit edges creates more than one level",()=>{
  const many=Array.from({length:10},(_,i)=>({id:"node-"+i,label:"Nœud "+i}));
  const doc=composeDiagram(DiagramSchema.parse({kind:"hierarchy",title:"Structure",nodes:many}));
  const positions=doc.elements.filter(e=>e.id.startsWith("diagram-panel-")).map(e=>e.styles.top);
  assert.ok(new Set(positions).size>=3);
});
test("excessively dense radial maps are rejected explicitly",()=>{
  const many=Array.from({length:15},(_,i)=>({id:"node-"+i,label:"Sujet "+i}));
  assert.equal(DiagramSchema.safeParse({kind:"mindmap",title:"Carte",nodes:many}).success,false);
});
