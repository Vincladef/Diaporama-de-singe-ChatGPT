import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {createServer} from "vite";
import {chromium} from "playwright-core";

test("HTML ZIP preserves local CSS, images, JS and runs only in an opaque sandbox",
 {timeout:80_000},async()=>{
 const zip=new JSZip();
 zip.file("deck/index.html",`<!doctype html><html><head><title>Page HTML originale</title>
 <link rel="stylesheet" href="../assets/main.css"></head><body>
 <h1 id="heading">Page originale</h1><img id="icon" src="../assets/logo.svg">
 <section data-slide><p>Un</p></section><section data-slide><p>Deux</p></section>
 <div id="counter">0</div><script src="../assets/nav.js"></script>
 </body></html>`);
 zip.file("assets/main.css","#heading{color:#123456}body{background:#eee}");
 zip.file("assets/logo.svg",'<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><circle cx="4" cy="4" r="3" fill="red"/></svg>');
 zip.file("assets/nav.js",`document.addEventListener("keydown",event=>{
 if(event.key==="ArrowRight"){
 const node=document.getElementById("counter");node.textContent=String(Number(node.textContent)+1);
 }
});`);
 const bytes=[...await zip.generateAsync({type:"uint8array",compression:"DEFLATE"})];
 const server=await createServer({server:{port:5195,host:"127.0.0.1",strictPort:true},logLevel:"error"});
 await server.listen();
 const browser=await chromium.launch({headless:true});
 try {
   const page=await browser.newPage({viewport:{width:1300,height:800}});
   await page.goto("http://127.0.0.1:5195/",{waitUntil:"domcontentloaded"});
   const result=await page.evaluate(async (byteArray:number[])=>{
     const modulePath="/src/import/parse.ts";
     const {importFile}=await import(modulePath);
     const file=new File([new Uint8Array(byteArray)],"presentation.zip",{type:"application/zip"});
     const faithful=await importFile(file,undefined,{htmlMode:"web"});
     const converted=await importFile(file,undefined,{htmlMode:"convert"});
     const doc=faithful.slides[0].document;
     const iframe=document.createElement("iframe");
     iframe.id="web-test";
     iframe.setAttribute("sandbox","allow-scripts");
     iframe.style.cssText="width:900px;height:550px;";
     iframe.srcdoc=doc.webPage.html;
     document.body.appendChild(iframe);
     return {title:faithful.title,convertedCount:converted.slides.length,
       safePreview:!doc.freeform.html.includes("nav.js"),
       webPayload:doc.webPage.html,entry:doc.webPage.entry};
   },bytes);
   assert.equal(result.title,"Page HTML originale");
   assert.equal(result.convertedCount,2);
   assert.equal(result.entry,"presentation.zip");
   assert.ok(result.safePreview);
   assert.ok(result.webPayload.includes("data:image/svg+xml;base64,"));
   assert.ok(result.webPayload.includes('document.addEventListener("keydown"'));
   const frame=page.frameLocator("#web-test");
   await frame.locator("#heading").waitFor();
   assert.equal(await frame.locator("#heading").evaluate(el=>getComputedStyle(el).color),"rgb(18, 52, 86)");
   assert.match(await frame.locator("#icon").getAttribute("src")??"",/^data:image\/svg\+xml;base64,/);
   assert.equal(await page.evaluate(()=>document.querySelector<HTMLIFrameElement>("#web-test")!.contentDocument),null);
   await frame.locator("body").click();
   await page.keyboard.press("ArrowRight");
   await frame.locator("#counter").getByText("1").waitFor();
 } finally {
   await browser.close();
   await server.close();
 }
});
