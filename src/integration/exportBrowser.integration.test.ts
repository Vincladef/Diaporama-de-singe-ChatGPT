import {test} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {chromium} from "playwright-core";
import JSZip from "jszip";
import {clarkWellsDemonstration} from "./clarkWellsDemonstration.ts";

const slides=[0,1,2].map(i=>{
  // Prefer the three original independent, typographic/vector versions
  // to test export without relying on the current CDN's CORS behavior.
  const candidate=clarkWellsDemonstration.find(v=>v.slide_index===i&&v.name.startsWith("B"));
  if(!candidate)throw Error("missing_browser_export_sample_"+i);
  return {
    id:candidate.slide_id,presentation_id:"f193e336-3328-4679-8227-9bd5561d5c95",
    position:i,revision:1,notes:candidate.notes,
    document:candidate.document,updated_at:new Date().toISOString(),
  };
});
const deck={
  presentation:{id:"f193e336-3328-4679-8227-9bd5561d5c95",
    title:"Clark et Wells : étude de démonstration",description:"",
    folder_id:null,format:"16:9",updated_at:new Date().toISOString()},
  slides,
};
async function waitForPort(port:number,ms=15_000){
 const end=Date.now()+ms;
 while(Date.now()<end){
   try{
     const response=await fetch("http://127.0.0.1:"+port+"/src/export/pptx.ts",
       {signal:AbortSignal.timeout(1000)});
     if(response.ok)return;
   }catch{}
   await new Promise(resolve=>setTimeout(resolve,200));
 }
 throw Error("vite_not_ready");
}

test("real Chromium browser exports actual editable and faithful PPTX from real demo",{timeout:180_000},async()=>{
 const port=5183;
 const server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port",String(port)],{
   stdio:["ignore","pipe","pipe"],env:{...process.env,CI:"1"},
 });
 let browser:Awaited<ReturnType<typeof chromium.launch>>|null=null;
 try{
   await waitForPort(port);
   browser=await chromium.launch({headless:true,timeout:20_000});
   const page=await browser.newPage({viewport:{width:1920,height:1080}});
   await page.goto("http://127.0.0.1:"+port+"/",{waitUntil:"domcontentloaded"});
   await mkdir("artifacts/integration",{recursive:true});
   for(const mode of ["editable","faithful"] as const){
     const result=await page.evaluate(async({inputDeck,exportMode})=>{
       const exporter=await import("/src/export/pptx.ts");
       const output=await exporter.buildPowerPoint(inputDeck as any,exportMode,undefined,"static");
       const buf=await output.blob.arrayBuffer();
       const bytes=new Uint8Array(buf);
       let binary="";
       for(let i=0;i<bytes.length;i+=8192)
         binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
       return {name:output.fileName,size:output.blob.size,slideCount:output.slideCount,
         sourceSlideCount:output.sourceSlideCount,warnings:output.warnings,
         base64:btoa(binary)};
     },{inputDeck:deck,exportMode:mode});
     assert.ok(result.size>5000,mode+": nonempty PPTX");
     assert.equal(result.sourceSlideCount,3);
     assert.equal(result.slideCount,3);
     const bytes=Buffer.from(result.base64,"base64");
     const zip=await JSZip.loadAsync(bytes);
     for(let i=1;i<=3;i++){
       assert.ok(zip.file("ppt/slides/slide"+i+".xml"),"actual slide "+i);
       assert.ok(zip.file("ppt/notesSlides/notesSlide"+i+".xml"),"speaker notes "+i);
     }
     await writeFile("artifacts/integration/clark-wells-"+mode+".pptx",bytes);
     console.log("REAL_PPTX_EXPORT",mode,bytes.length,result.warnings.length);
   }
 }finally{
   await browser?.close().catch(()=>{});
   server.kill("SIGTERM");
 }
});
