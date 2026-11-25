import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import sharp from "sharp";
import {createEmptySlideDocument} from "../domain/slide.ts";
import {buildServerNativePptx} from "./serverNative.ts";

test("server exports one native slide with editable text, shapes and embedded media",async()=>{
  const image=await sharp({create:{width:4,height:4,channels:4,
    background:{r:30,g:80,b:100,alpha:1}}}).png().toBuffer();
  const document=createEmptySlideDocument();
  document.elements=[
    {id:"title",type:"text",text:"Texte clinique intact ; accents et ponctuation !",
      styles:{left:"30px",top:"40px",width:"1400px",height:"160px",fontSize:"48px"}},
    {id:"photo",type:"image",src:"data:image/png;base64,"+image.toString("base64"),
      styles:{left:"200px",top:"300px",width:"600px",height:"390px"}},
    {id:"rectangle",type:"shape",styles:{left:"900px",top:"400px",
      width:"400px",height:"160px",backgroundColor:"#234557"}},
    {id:"native-question",type:"shape",text:"57. Une question préservée mot pour mot ?",
      styles:{left:"90px",top:"700px",width:"1600px",height:"115px",fontSize:"39px",color:"#234557"}}
  ];
  const row={id:"slide",position:0,
    revision:1,presentation_id:"deck",document,notes:"Notes originales",
    updated_at:""} as import("../mcp/store.ts").DbSlide;
  const bytes=await buildServerNativePptx("Vérification",[row]);
  const zip=await JSZip.loadAsync(bytes);
  const slide=await zip.file("ppt/slides/slide1.xml")?.async("string");
  assert.ok(slide?.includes("Texte clinique intact"));
  assert.ok(slide?.includes("accents et ponctuation"));
  assert.ok(slide?.includes("57. Une question préservée mot pour mot ?"),"Editable shape text must survive export");
  assert.ok(zip.file("ppt/media/image1.png")||Object.keys(zip.files).some(p=>p.startsWith("ppt/media/")));
  assert.ok(!zip.file("ppt/slides/slide2.xml"),"Animations must not create fake screenshot slides");
});
