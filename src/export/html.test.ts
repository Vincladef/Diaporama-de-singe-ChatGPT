import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {createEmptySlideDocument} from "../domain/slide.ts";
import {buildHtmlArchive} from "./html.ts";
import type {PresentationDetail} from "../lib/api.ts";

test("HTML/CSS export preserves three editable representations and click sequence",async()=>{
 const doc=createEmptySlideDocument();
 doc.elements=[{id:"title",type:"text",text:"Ergonomie",styles:{left:"100px",top:"120px"}}];
 doc.animations=[{id:"fade",targetElementId:"title",order:0,trigger:"click",effect:"fade",durationMs:350}];
 const deck:PresentationDetail={
   presentation:{id:"abc",title:"Histoire de l’ergonomie",description:"",format:"16:9",folder_id:null,updated_at:new Date().toISOString()},
   slides:[{id:"slide-1",presentation_id:"abc",position:0,document:doc,
     notes:"Notes",revision:1,updated_at:new Date().toISOString()}],
 };
 const archive=await buildHtmlArchive(deck);
 assert.match(archive.fileName,/\.zip$/);
 assert.equal(archive.slideCount,1);
 const zip=await JSZip.loadAsync(archive.blob);
 assert.ok(zip.file("index.html"));
 assert.ok(zip.file("slides/diapositive-01.html"));
 assert.ok(zip.file("presentation.json"));
 const html=await zip.file("index.html")!.async("string");
 assert.match(html,/Espace ou clic/);
 assert.match(html,/const pages=/);
 assert.match(html,/fade/);
 assert.match(html,/Diaporama de singe|Histoire de l.ergonomie/);
 const source=JSON.parse(await zip.file("presentation.json")!.async("string"));
 assert.equal(source.slides[0].document.elements[0].text,"Ergonomie");
 assert.equal(source.slides[0].document.animations[0].trigger,"click");
});
