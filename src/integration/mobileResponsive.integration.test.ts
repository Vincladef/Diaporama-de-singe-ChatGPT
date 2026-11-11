import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
import {preview} from "vite";
import {chromium,type Page} from "playwright-core";
import {clarkWellsDemonstration} from "./clarkWellsDemonstration.ts";

const deckId="f193e336-3328-4679-8227-9bd5561d5c95";
const source=Array.from({length:3},(_,i)=>clarkWellsDemonstration.find(v=>
  v.slide_index===i&&v.name.startsWith("A ·"))!);
const now="2026-11-11T09:20:00.000Z";
const presentation={id:deckId,title:"Clark et Wells : une présentation scientifique au titre volontairement très long",
  description:"Test adaptatif sur téléphone",format:"16:9",folder_id:null,updated_at:now};
const slides=source.map((s,i)=>({
  id:s.slide_id,presentation_id:deckId,position:i,revision:2,updated_at:now,
  document:s.document,notes:s.notes,
}));
const summary={...presentation,slide_count:3};
const alternatives=source.map(s=>clarkWellsDemonstration
  .filter(v=>v.slide_index===s.slide_index)
  .map(v=>({
    id:v.variant_id,name:v.name,document:v.document,notes:v.notes,created_at:now,
  })));
async function mockPrivateWorkspace(page:Page){
 await page.addInitScript(()=>{
   // Playwright injects into nested sandboxed slide-preview iframes too.
   // Only the top-level app owns a session; sandboxed frames must not touch storage.
   if(window.top===window){
     sessionStorage.setItem("diaporama-chatgpt-owner-token","ci-mobile-test-token");
   }
 });
 await page.route("**/.netlify/functions/workspace**",async route=>{
   const req=route.request();
   const url=new URL(req.url()),op=url.searchParams.get("op");
   const json=(value:unknown,status=200)=>route.fulfill({
     status,contentType:"application/json",body:JSON.stringify(value)
   });
   if(req.method()==="GET"){
     switch(op){
      case "list":return json({ok:true,presentations:[summary]});
      case "folders":return json({ok:true,folders:[]});
      case "presentation":return json({presentation,slides});
      case "revisions":return json({id:deckId,title:presentation.title,
         slides:slides.map(s=>({id:s.id,revision:s.revision,position:s.position}))});
      case "cover":return json({document:slides[0]!.document});
      case "variantPreferences":return json({ok:true,preferences:[]});
      case "creationInstructions":return json({ok:true,global:"",presentation:"",effective:"",references:[]});
      case "promptLibrary":return json({ok:true,items:[
       {id:"11111111-1111-4111-8111-111111111111",category:"styles",title:"Éditorial suisse",
        description:"Grilles typographiques lisibles et contrastes précis.",prompt:"Règles graphiques",
        previewUrl:"/prompt-examples/suisse-01.svg",
        exampleImages:["/prompt-examples/suisse-01.svg","/prompt-examples/suisse-02.svg"],
        status:"active",version:1,createdAt:now,updatedAt:now},
       {id:"22222222-2222-4222-8222-222222222222",category:"styles",title:"Rétro éditorial",
        description:"Palette chaude, surfaces et caractères expressifs.",prompt:"Magazine",
        previewUrl:"/prompt-examples/retro-01.svg",
        exampleImages:["/prompt-examples/retro-01.svg","/prompt-examples/retro-02.svg"],
        status:"active",version:1,createdAt:now,updatedAt:now}
      ]});
      default:return json({ok:true,items:[],variants:[]});
     }
   }
   const data=JSON.parse(req.postData()||"{}") as {action?:string;slideId?:string};
   if(data.action==="listVariants"){
     const index=slides.findIndex(s=>s.id===data.slideId);
     return json({ok:true,variants:alternatives[index]??[]});
   }
   if(data.action==="switchVariant")return json({ok:true,slide:slides[0]});
   return json({ok:true});
 });
 await page.route("**/.netlify/functions/health",route=>route.fulfill({
   status:200,contentType:"application/json",
   body:JSON.stringify({ok:true,database:"connected",schema:"ready",service:"diaporama-de-singe-chatgpt"})
 }));
}

function fitCheck(page:Page,label:string){
 return page.evaluate((name)=>{
   const width=window.innerWidth;
   const doc=document.documentElement;
   const root=document.querySelector("#root") as HTMLElement|null;
   const over=[doc.scrollWidth,document.body.scrollWidth,root?.scrollWidth??0];
   return {label:name,width,maxScrollWidth:Math.max(...over),
     navVisible:!!document.querySelector(".mobile-editor-navigation"),
     viewportHeight:window.innerHeight};
 },label);
}
const sizes=[
 {name:"small-320",width:320,height:680},
 {name:"iphone-360",width:360,height:740},
 {name:"mobile-390",width:390,height:844},
 {name:"large-phone-430",width:430,height:932},
 {name:"landscape-667",width:667,height:375},
 {name:"tablet-768",width:768,height:1024},
];
test("real built React app is usable on phones: library, editor, tabs, tools, variants",
 {timeout:180_000},async()=>{
 const server=await preview({preview:{port:5189,host:"127.0.0.1",strictPort:true},logLevel:"error"});
 const browser=await chromium.launch({headless:true});
 await mkdir("artifacts/mobile",{recursive:true});
 try{
  for(const size of sizes){
   const page=await browser.newPage({viewport:{width:size.width,height:size.height},deviceScaleFactor:1,
     isMobile:size.width<=430,hasTouch:size.width<=430});
   const exceptions:string[]=[];
   page.on("pageerror",e=>exceptions.push(e.message));
   await mockPrivateWorkspace(page);
   await page.goto("http://127.0.0.1:5189/",{waitUntil:"domcontentloaded",timeout:15000});
   await page.locator(".library-deck-card").first().waitFor({timeout:10000});
   const home=await fitCheck(page,"library-"+size.name);
   assert.ok(home.maxScrollWidth<=size.width+2,
     "library horizontal page overflow at "+size.width+": "+JSON.stringify(home));
   await page.screenshot({path:"artifacts/mobile/"+size.name+"-library.png",fullPage:true});
   await page.locator(".library-deck-open").first().click();
   await page.locator(".app-slides-style.is-editing .visual-viewport").waitFor({timeout:14000});
   const layout=await fitCheck(page,"editor-"+size.name);
   assert.ok(layout.maxScrollWidth<=size.width+2,
     "editor horizontal page overflow at "+size.width+": "+JSON.stringify(layout));
   const mobile=size.width<=760;
   const nav=page.getByRole("navigation",{name:"Navigation de l'éditeur sur téléphone"});
   if(mobile){
     assert.ok(await nav.isVisible(),"mobile tabs must be visible at "+size.width);
     assert.equal(await page.locator(".slide-rail").count(),0,
       "phone should prioritize the canvas with collapsed slide rail");
     const box=await page.locator(".canvas-stage-shell").boundingBox();
     assert.ok(box&&box.width>=size.width-35&&box.height>=90,
       "usable phone canvas dimensions "+size.width+": "+JSON.stringify(box));
     const buttons=nav.locator("button");
     await buttons.nth(0).click();
     await page.locator(".slide-rail").waitFor({timeout:5000});
     assert.ok(await page.locator(".slide-list").isVisible());
     await buttons.nth(2).click();
     await page.locator(".editor-sidebar .variant-gallery").waitFor({timeout:5000});
     await page.getByRole("button",{name:"Je n'aime pas"}).first().waitFor({timeout:6000});
     assert.equal(await page.locator(".slide-rail").count(),0,
       "choosing variants should restore canvas space");
     await page.screenshot({path:"artifacts/mobile/"+size.name+"-variants.png"});
     await page.getByRole("button",{name:"Fermer les variantes ou les outils"}).click();
     assert.equal(await page.locator(".editor-sidebar").count(),0,"drawer closes visibly");
     await buttons.nth(3).click();
     await page.locator(".editor-sidebar .property-panel").waitFor({timeout:5000});
     await page.locator(".mobile-sheet-scrim").click({position:{x:12,y:12}});
     assert.equal(await page.locator(".editor-sidebar").count(),0,"scrim closes tools");
     await buttons.nth(1).click();
     const end=await fitCheck(page,"closed-"+size.name);
     assert.ok(end.maxScrollWidth<=size.width+2,"no overflow after interactions");
     await page.locator(".slides-extra-actions summary").click();
     await page.getByRole("button",{name:"Bibliothèque de prompts"}).waitFor({timeout:5000});
     await page.getByRole("button",{name:"Quitter"}).waitFor({timeout:5000});
     await page.getByRole("button",{name:"Bibliothèque de prompts"}).click();
     await page.getByRole("heading",{name:"Socle général"}).waitFor({timeout:5000});
     await page.getByRole("button",{name:/Styles graphiques/}).click();
     await page.getByRole("button",{name:/Voir l.exemple 2 de Éditorial suisse/}).click();
     await page.getByRole("button",{name:/Agrandir l.exemple 2 de Éditorial suisse/}).click();
     await page.getByRole("dialog",{name:/Galerie agrandie/}).waitFor({timeout:5000});
     await page.getByRole("button",{name:"Fermer l’image"}).click();
     const promptFit=await fitCheck(page,"prompt-library-"+size.name);
     assert.ok(promptFit.maxScrollWidth<=size.width+2,
       "prompt library horizontal overflow at "+size.width+": "+JSON.stringify(promptFit));
     await page.getByRole("button",{name:"Fermer les instructions"}).click();
   }else{
     assert.equal(await nav.isVisible(),false,"desktop/tablet should hide mobile nav");
   }
   await page.screenshot({path:"artifacts/mobile/"+size.name+"-editor.png"});
   assert.equal(exceptions.length,0,"uncaught errors at "+size.width+": "+exceptions.join("; "));
   console.log("MOBILE_LAYOUT_OK",size.name,JSON.stringify(layout));
   await page.close();
  }
 }finally{
   await browser.close();
   await new Promise<void>((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));
 }
});

test("on small phones the non-authenticated login stays fully visible",
 {timeout:45_000},async()=>{
 const server=await preview({preview:{port:5190,host:"127.0.0.1",strictPort:true},logLevel:"error"});
 const browser=await chromium.launch({headless:true});
 try{
   const page=await browser.newPage({viewport:{width:320,height:568},isMobile:true,hasTouch:true});
   await page.goto("http://127.0.0.1:5190/",{waitUntil:"domcontentloaded"});
   await page.getByLabel("Code d'accès privé").waitFor();
   const box=await page.locator(".login-card").boundingBox();
   assert.ok(box&&box.x>=0&&box.x+box.width<=320);
   assert.ok((await fitCheck(page,"login")).maxScrollWidth<=322);
   await page.close();
 }finally{
   await browser.close();
   await new Promise<void>((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));
 }
});

test("prompt gallery uses exactly two columns on desktop and loads its SVG examples",
 {timeout:45000},async()=>{
 const server=await preview({preview:{port:5194,host:"127.0.0.1",strictPort:true},logLevel:"error"});
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1540,height:900}});
  await mockPrivateWorkspace(page);
  await page.goto("http://127.0.0.1:5194/",{waitUntil:"domcontentloaded"});
  await page.getByRole("button",{name:"Bibliothèque de prompts"}).click();
  await page.getByRole("button",{name:/Styles graphiques/}).click();
  const grid=page.locator(".prompt-card-grid");
  await grid.waitFor();
  const columns=await grid.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length);
  assert.equal(columns,2,"style cards should use two spacious columns on desktop");
  const image=page.locator(".prompt-gallery-cover img").first();
  await image.waitFor();
  await assert.doesNotReject(async()=>{
   await image.evaluate(async (node:HTMLImageElement)=>{
    if(node.complete)return;
    await new Promise<void>((resolve,reject)=>{
     node.addEventListener("load",()=>resolve(),{once:true});
     node.addEventListener("error",()=>reject(new Error("example image missing")),{once:true});
    });
   });
  });
  assert.ok(await image.evaluate((node:HTMLImageElement)=>node.naturalWidth>0),
    "original SVG sample should load");
  await page.screenshot({path:"artifacts/mobile/prompt-library-desktop.png"});
  await page.close();
 }finally{
  await browser.close();
  await new Promise<void>((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));
 }
});
