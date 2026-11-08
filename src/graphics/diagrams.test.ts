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
