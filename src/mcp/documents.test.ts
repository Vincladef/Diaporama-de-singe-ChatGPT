import test from "node:test";
import assert from "node:assert/strict";
import { createEmptySlideDocument } from "../domain/slide.ts";
import { editSlide, initialSlide, summarizeSlide } from "./documents.ts";

test("one request creates a complete freeform slide without template dependency",()=>{
 const slide=initialSlide({html:"<h1>Libre</h1>",css:"h1{font-size:90px}",notes:"Étape 1"});
 assert.equal(slide.document.mode,"freeform");
 assert.equal(slide.document.freeform?.html,"<h1>Libre</h1>");
 assert.equal(slide.notes,"Étape 1");
});
test("multiple operations preserve unrelated HTML and update one object",()=>{
 const original=initialSlide({html:"<h1>Couverture</h1>",css:"body{background:white}",elements:[
  {id:"t",type:"text",text:"Avant",styles:{top:"60px",left:"90px",color:"#123456"}}
 ]});
 const result=editSlide(original.document,"",[
  {op:"edit_element",id:"t",text:"Après",styles:{top:"95px"}},
  {op:"append_css",css:"\nh1{font-size:90px}"},
  {op:"set_notes",notes:"Notes"},
  {op:"append_animation",animation:{id:"a1",targetElementId:"t",order:0,trigger:"click",effect:"appear",durationMs:300}}
 ]);
 assert.equal(result.document.elements[0]?.text,"Après");
 assert.equal(result.document.elements[0]?.styles.left,"90px");
 assert.equal(result.document.elements[0]?.styles.top,"95px");
 assert.equal(result.notes,"Notes");
 assert.equal(result.document.animations.length,1);
 assert.match(result.document.freeform?.css??"",/font-size/);
});
test("deleting an object also deletes its dependent animations",()=>{
 const document=createEmptySlideDocument();
 document.elements=[{id:"t",type:"text",text:"title",styles:{}}];
 document.animations=[{id:"a1",targetElementId:"t",order:0,trigger:"click",effect:"appear",durationMs:200}];
 const result=editSlide(document,"",[{op:"remove_element",id:"t"}]);
 assert.equal(result.document.elements.length,0);
 assert.equal(result.document.animations.length,0);
});
test("invalid duplicate IDs reject the entire edit before persistence",()=>{
 const doc=createEmptySlideDocument();
 assert.throws(()=>editSlide(doc,"",[
  {op:"upsert_element",element:{id:"same",type:"text",styles:{}}},
  {op:"set_elements",elements:[
   {id:"same",type:"text",styles:{}},{id:"same",type:"text",styles:{}}
  ]}
 ]),/duplicate_element_id/);
});
test("short summary avoids transferring the full HTML and CSS",()=>{
 const d=initialSlide({html:"<h1>Un titre</h1>"});
 const result=summarizeSlide({id:"s",position:0,revision:1,document:d.document});
 assert.equal(result.excerpt,"Un titre");
 assert.equal("freeform" in result,false);
});

test("hybrid synopsis retains structured captions even when freeform HTML is empty",()=>{
 const d=createEmptySlideDocument();
 d.mode="hybrid";
 d.freeform={html:"",css:"body{background:#EEE}"};
 d.elements=[{id:"title",type:"text",text:"Message scientifique",styles:{}}];
 const result=summarizeSlide({id:"s",position:0,revision:1,document:d});
 assert.equal(result.excerpt,"Message scientifique");
});
test("hybrid synopsis combines HTML and editable text but omits scripts and styles",()=>{
 const d=createEmptySlideDocument();
 d.mode="hybrid";
 d.freeform={html:"<style>ghost{display:block}</style><script>alert(123)</script><h1>Contexte</h1>",css:""};
 d.elements=[{id:"title",type:"text",text:"Titre utile",styles:{}}];
 const result=summarizeSlide({id:"s",position:0,revision:1,document:d});
 assert.equal(result.excerpt,"Titre utile Contexte");
});
