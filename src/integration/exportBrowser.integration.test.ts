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
   page.on("pageerror",error=>console.log("CHROME_PAGEERROR",error.message.slice(0,420)));
   page.on("console",message=>{
     if(message.type()==="error")console.log("CHROME_CONSOLE_ERROR",message.text().slice(0,420));
   });
   await page.goto("http://127.0.0.1:"+port+"/",{waitUntil:"domcontentloaded"});
   for(const path of ["/src/animation/runtime.ts","/src/engine/render.ts","/src/export/pptx.ts"]){
     const response=await page.request.get("http://127.0.0.1:"+port+path);
     if(response.status()!==200){
       const body=await response.text();
       throw Error("vite_module_http_"+response.status()+": "+path+" "+body.slice(0,650));
     }
     console.log("VITE_MODULE_OK",path,(await response.body()).byteLength);
   }
   const animationChecks=await page.evaluate(async(docs)=>{
     const runtimeUrl="/src/animation/runtime.ts";
     const {SlideAnimationPlayer}=await import(runtimeUrl);
     const renderUrl="/src/engine/render.ts";
     const {renderSlideHtml}=await import(renderUrl);
     const results=[];
     for(const doc of docs){
       const frame=document.createElement("iframe");
       frame.setAttribute("sandbox","allow-same-origin");
       frame.style.cssText="position:absolute;top:-2000px;left:0;width:1920px;height:1080px";
       frame.srcdoc=renderSlideHtml(doc as any);
       document.body.appendChild(frame);
       await new Promise<void>((resolve,reject)=>{
         frame.addEventListener("load",()=>resolve(),{once:true});
         setTimeout(()=>reject(new Error("animation_iframe_load_timeout")),8000);
       });
       const nested=frame.contentDocument;
       if(!nested)throw new Error("sandbox_document_unavailable");
       const player=new SlideAnimationPlayer(nested,doc as any);
       const missing=player.missingTargets();
       const clicks=player.plan.clicks.length;
       await player.seek(0,{animate:false});
       const selector=doc.animations[0]?.targetSelector;
       const first=selector?nested.querySelector(selector) as HTMLElement|null:null;
       const initialVisibility=first?.style.visibility??"";
       await player.seek(1,{animate:false});
       const firstVisibility=first?.style.visibility??"";
       results.push({missing,clicks,initialVisibility,firstVisibility});
       player.dispose();frame.remove();
     }
     return results;
   },slides.map(s=>s.document));
   for(const [index,c] of animationChecks.entries()){
     assert.deepEqual(c.missing,[],"every SVG/HTML reveal cue points to a real element on slide "+index);
     assert.ok(c.clicks>=1,"click progression has one or more steps");
     assert.equal(c.initialVisibility,"hidden","initial reveal is not already visible");
     assert.equal(c.firstVisibility,"visible","first click reveals its target");
   }
   await mkdir("artifacts/integration",{recursive:true});
   for(const mode of ["editable","faithful"] as const){
     const result=await page.evaluate(async({inputDeck,exportMode})=>{
       const exporterUrl="/src/export/pptx.ts";
       const exporter=await import(exporterUrl);
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
