import test from "node:test";
import assert from "node:assert/strict";
import {DiagramSchema} from "./diagrams.ts";
import {composeElkDiagram} from "./elkLayout.ts";
import {renderSlideHtml} from "../engine/render.ts";
import {inspectExport} from "../export/preflight.ts";

test("ELK routes real cognitive feedback and keeps all node text editable",async()=>{
 const doc=await composeElkDiagram(DiagramSchema.parse({
   kind:"causal",title:"Maintien de l'anxiété sociale",
   nodes:[{id:"self",label:"Attention centrée sur soi"},
     {id:"safe",label:"Comportements de sécurité"},
     {id:"image",label:"Image négative de soi"},
     {id:"fear",label:"Anxiété maintenue",emphasis:true}],
   edges:[{from:"self",to:"image",label:"alimente"},
     {from:"image",to:"safe",label:"favorise"},
     {from:"safe",to:"fear",label:"entretient"},
     {from:"fear",to:"self",label:"renforce"}],
   notes:"Clark et Wells (1995), modèle proposé ; ne pas traiter les flèches comme preuve causale."
 }));
 assert.equal(doc.mode,"structured");
 assert.equal(doc.elements.filter(x=>x.id.startsWith("diagram-panel-")).length,4);
 assert.equal(doc.elements.filter(x=>x.id.startsWith("diagram-node-")&&x.type==="text").length,4);
 assert.ok(doc.elements.some(x=>x.id.startsWith("elk-route-")&&x.type==="svg"));
 assert.ok(doc.animations.some(x=>x.trigger==="click"));
 assert.ok(doc.elements.some(x=>x.id.startsWith("elk-edge-label-")));
 const html=renderSlideHtml(doc);
 assert.ok(html.includes("Attention centrée sur soi"));
 const exportInfo=inspectExport([{document:doc,notes:"Source bibliographique"}]);
 assert.equal(exportInfo.slides[0]!.mode,"native");
});
test("ELK hierarchy computes distinct layers while fitting presentation bounds",async()=>{
 const nodes=Array.from({length:9},(_,i)=>({id:"p"+i,label:"Concept "+i}));
 const doc=await composeElkDiagram(DiagramSchema.parse({kind:"hierarchy",
   title:"Structuration de neuf notions",nodes,
   edges:nodes.slice(1).map((n,i)=>({from:"p"+Math.floor(i/2),to:n.id}))}));
 const panels=doc.elements.filter(x=>x.id.startsWith("diagram-panel-"));
 assert.equal(panels.length,9);
 for(const el of panels){
   const y=Number.parseFloat(String(el.styles.top));
   const h=Number.parseFloat(String(el.styles.height));
   const x=Number.parseFloat(String(el.styles.left));
   const w=Number.parseFloat(String(el.styles.width));
   assert.ok(y>=0&&y+h<=1080,"panel within vertical bounds");
   assert.ok(x>=0&&x+w<=1920,"panel within horizontal bounds");
 }
 assert.ok(new Set(panels.map(x=>x.styles.top)).size>1);
});
