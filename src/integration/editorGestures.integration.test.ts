import test from "node:test";
import assert from "node:assert/strict";
import { preview } from "vite";
import { chromium } from "playwright-core";
import type { SlideDocument } from "../domain/slide.ts";

const deckId="11111111-1111-4111-8111-111111111111";
const now="2026-11-21T14:00:00.000Z";
const presentation={id:deckId,title:"Audit des interactions",description:"",
  format:"16:9",folder_id:null,updated_at:now};
const htmlSlide:SlideDocument={
  schemaVersion:1,mode:"freeform",canvas:{width:1920,height:1080},elements:[],
  animations:[],themeId:"blanc",freeform:{html:
    '<h1 style="position:absolute;left:180px;top:160px;width:1100px;height:160px;font-size:80px;font-family:Georgia,serif;color:#333">Titre IA modifiable</h1>'+
    '<p style="position:absolute;left:270px;top:520px;width:1100px;height:160px;font-size:50px">Second texte HTML</p>'+
    '<img style="position:absolute;left:1650px;top:900px;width:70px;height:70px" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL6GQAAAABJRU5ErkJggg==">',css:""}
};
const nativeSlide:SlideDocument={
  schemaVersion:1,mode:"structured",canvas:{width:1920,height:1080},animations:[],themeId:"blanc",
  elements:[{id:"native-text",type:"text",name:"Titre",text:"Bonjour monde",styles:{
    left:"180px",top:"160px",width:"850px",height:"220px",fontSize:"82px",fontFamily:"Georgia,serif"}}]
};

test("AI HTML, native text, palettes, marquee, shapes and layouts behave as editable slide objects",
{timeout:120_000},async()=>{
  const server=await preview({preview:{port:5197,host:"127.0.0.1",strictPort:true},logLevel:"error"});
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1536,height:730}});
    await context.addInitScript(()=>{
      if(window.top===window)sessionStorage.setItem("diaporama-chatgpt-owner-token","ci-editor-token");
    });
    const slides=[
      {id:"22222222-2222-4222-8222-222222222222",presentation_id:deckId,
        position:0,revision:1,updated_at:now,document:structuredClone(htmlSlide),notes:""},
      {id:"33333333-3333-4333-8333-333333333333",presentation_id:deckId,
        position:1,revision:1,updated_at:now,document:structuredClone(nativeSlide),notes:""}
    ];
    await context.route("**/.netlify/functions/workspace**",async route=>{
      const req=route.request(),op=new URL(req.url()).searchParams.get("op");
      let payload:unknown={ok:true,items:[],variants:[]};
      if(req.method()==="GET"){
        if(op==="list")payload={presentations:[{...presentation,slide_count:slides.length}]};
        if(op==="folders")payload={folders:[]};
        if(op==="presentation")payload={presentation,slides};
        if(op==="revisions")payload={id:deckId,title:presentation.title,
          slides:slides.map(s=>({id:s.id,position:s.position,revision:s.revision}))};
      }else{
        const body=JSON.parse(req.postData()??"{}") as {
          action?:string;id?:string;document?:SlideDocument;notes?:string;
        };
        if(body.action==="saveSlide"){
          const slide=slides.find(s=>s.id===body.id);
          if(slide&&body.document){slide.document=body.document;slide.revision++;slide.notes=body.notes??"";}
          payload={slide:{revision:slide?.revision,updated_at:now}};
        }else if(body.action==="addSlide"){
          const slide={id:crypto.randomUUID(),presentation_id:deckId,position:slides.length,
            revision:1,updated_at:now,document:{...structuredClone(nativeSlide),elements:[]},notes:""};
          slides.push(slide);payload={slide:{id:slide.id}};
        }
      }
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(payload)});
    });
    const page=await context.newPage();
    const errors:string[]=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.goto("http://127.0.0.1:5197/?deck="+deckId,{waitUntil:"domcontentloaded"});
    await page.locator(".visual-hit-layer").waitFor();
    let art=await page.locator(".visual-artboard").boundingBox();
    assert.ok(art);
    // Match the requested Google Slides-sized editing canvas.
    assert.ok(art.width>850,"slide too narrow: "+art.width);
    assert.ok(art.height>480,"slide too short: "+art.height);
    await page.evaluate(()=>{
      const tracker=window as typeof window & {
        __frameDoc?:Document|null;__frameLoads?:number;__imageNode?:Element|null;
      };
      const frame=document.querySelector<HTMLIFrameElement>(".visual-artboard iframe")!;
      tracker.__frameDoc=frame.contentDocument;tracker.__frameLoads=0;
      tracker.__imageNode=frame.contentDocument?.querySelector("img");
      frame.addEventListener("load",()=>{tracker.__frameLoads=(tracker.__frameLoads??0)+1;});
    });
    const at=(x:number,y:number)=>({x:art!.x+x*art!.width/1920,y:art!.y+y*art!.height/1080});
    await page.mouse.click(...Object.values(at(250,300)) as [number,number]);
    await page.locator(".freeform-selection").waitFor();
    assert.equal(await page.locator("select[aria-label='Police']").isEnabled(),true);
    assert.equal(await page.locator("input[aria-label='Taille de police']").inputValue(),"80");
    await page.locator("select[aria-label='Police']").selectOption("Verdana, sans-serif");
    await page.locator("input[aria-label='Taille de police']").fill("101");
    await page.keyboard.press("Control+z");
    await page.waitForFunction(()=>document.querySelector<HTMLInputElement>(
      "input[aria-label='Taille de police']")?.value==="80");
    const h1Size=await page.locator(".visual-artboard iframe").evaluate(f=>
      (f as HTMLIFrameElement).contentDocument?.querySelector("h1")?.style.fontSize);
    assert.equal(h1Size,"80px");
    // A style change must not navigate the iframe or reload images.
    const stableHtml=await page.evaluate(()=>{
      const tracker=window as typeof window & {__frameDoc?:Document|null;__frameLoads?:number};
      const frame=document.querySelector<HTMLIFrameElement>(".visual-artboard iframe")!;
      return {sameDocument:tracker.__frameDoc===frame.contentDocument,loads:tracker.__frameLoads};
    });
    assert.deepEqual(stableHtml,{sameDocument:true,loads:0});
    assert.equal(await page.evaluate(()=>{
      const tracker=window as typeof window & {__imageNode?:Element|null};
      return tracker.__imageNode===document.querySelector<HTMLIFrameElement>(
        ".visual-artboard iframe")?.contentDocument?.querySelector("img");
    }),true,"the existing slide image must be reused, not recreated");

    await page.mouse.click(at(250,300).x,at(250,300).y,{button:"right"});
    const objectMenu=page.getByRole("menu",{name:"Actions sur l’élément"});
    assert.equal(await objectMenu.isVisible(),true);
    assert.match(await objectMenu.textContent()??"",/Élément HTML/);
    await objectMenu.getByRole("menuitem",{name:"Mettre au premier plan"}).click();
    const frontLevel=await page.locator(".visual-artboard iframe").evaluate(frame=>
      (frame as HTMLIFrameElement).contentDocument?.querySelector("h1")?.style.zIndex);
    assert.ok(Number(frontLevel)>0);
    await page.mouse.click(at(250,300).x,at(250,300).y,{button:"right"});
    await objectMenu.getByRole("menuitem",{name:"Dupliquer"}).click();
    await page.waitForFunction(()=>document.querySelector<HTMLIFrameElement>(
      ".visual-artboard iframe")?.contentDocument?.querySelectorAll("h1").length===2);
    await page.keyboard.press("Control+z");
    await page.waitForFunction(()=>document.querySelector<HTMLIFrameElement>(
      ".visual-artboard iframe")?.contentDocument?.querySelectorAll("h1").length===1);
    assert.deepEqual(await page.evaluate(()=>{
      const tracker=window as typeof window & {__frameDoc?:Document|null;__frameLoads?:number};
      const frame=document.querySelector<HTMLIFrameElement>(".visual-artboard iframe")!;
      return {sameDocument:tracker.__frameDoc===frame.contentDocument,loads:tracker.__frameLoads};
    }),{sameDocument:true,loads:0});

    await page.mouse.click(art!.x+5,art!.y+5);
    await page.mouse.move(at(90,105).x,at(90,105).y);
    await page.mouse.down();await page.mouse.move(at(1510,800).x,at(1510,800).y,{steps:12});
    await page.mouse.up();
    assert.equal(await page.locator(".freeform-multi-outline").count(),1);

    await page.locator(".slide-tile").nth(1).click();
    await page.locator('[data-visual-id="native-text"]').dblclick();
    const tx=page.locator("textarea[data-testid='canvas-inline-text']");
    await tx.focus();await tx.press("Home");
    for(let i=0;i<7;i++)await tx.press("Shift+ArrowRight");
    await page.locator(".singe-formatbar button[title='Gras']").click();
    await page.waitForFunction(()=>document.querySelector<HTMLIFrameElement>(".visual-artboard iframe")?.contentDocument?.querySelector('[data-id="native-text"]')?.innerHTML.includes("font-weight:bold"));
    const nativeHtml=await page.locator(".visual-artboard iframe").evaluate(f=>
      (f as HTMLIFrameElement).contentDocument?.querySelector('[data-id="native-text"]')?.innerHTML);
    assert.match(nativeHtml??"",/<span style="font-weight:bold">Bonjour<\/span>/);
    const palette=page.locator(".singe-palette").filter({has:page.locator("summary[aria-label='Couleur du texte']")});
    await palette.locator("summary").click();
    await palette.getByRole("button",{name:"Couleur #cc0000"}).click();
    await page.waitForFunction(()=>document.querySelector<HTMLIFrameElement>(".visual-artboard iframe")?.contentDocument?.querySelector('[data-id="native-text"]')?.innerHTML.includes("color:#cc0000"));
    const colored=await page.locator(".visual-artboard iframe").evaluate(f=>
      (f as HTMLIFrameElement).contentDocument?.querySelector('[data-id="native-text"]')?.innerHTML);
    assert.match(colored??"",/color:#cc0000/);
    await page.keyboard.press("Control+z");
    await page.waitForFunction(()=>!document.querySelector<HTMLIFrameElement>(".visual-artboard iframe")?.contentDocument?.querySelector('[data-id="native-text"]')?.innerHTML.includes("color:#cc0000"));
    const restored=await page.locator(".visual-artboard iframe").evaluate(f=>
      (f as HTMLIFrameElement).contentDocument?.querySelector('[data-id="native-text"]')?.innerHTML);
    assert.doesNotMatch(restored??"",/color:#cc0000/);

    // Native objects also use the context menu and targeted DOM updates.
    if(await page.locator("textarea[data-testid='canvas-inline-text']").count())
      await page.locator("textarea[data-testid='canvas-inline-text']").press("Enter");
    await page.locator('[data-visual-id="native-text"]').click({button:"right"});
    assert.equal(await page.getByRole("menu",{name:"Actions sur l’élément"}).isVisible(),true);
    await page.getByRole("menuitem",{name:"Mettre à l’arrière-plan"}).click();
    await page.waitForFunction(()=>document.querySelector<HTMLIFrameElement>(
      ".visual-artboard iframe")?.contentDocument?.querySelector('[data-id="native-text"]')
      ?.getAttribute("style")?.includes("z-index:10"));
    assert.equal(await page.locator(".visual-artboard iframe").count(),1);

    await page.locator(".singe-layout-picker summary").click();
    await page.locator(".singe-layout-grid button[title='Titre et deux zones de texte']").click();
    await page.locator(".slide-tile").nth(2).waitFor();
    assert.equal(await page.locator(".slide-tile").count(),3);
    assert.equal(await page.locator(".visual-object-hit").count(),3);
    await page.locator(".singe-formatbar .shape-picker summary").click();
    const rectangle=page.locator(".singe-formatbar .shape-picker-menu button[title='Rectangle']");
    assert.equal(await rectangle.isVisible(),true);
    await rectangle.click();
    const cursor=await page.locator(".visual-hit-layer").evaluate(el=>getComputedStyle(el).cursor);
    assert.equal(cursor,"crosshair");
    art=await page.locator(".visual-artboard").boundingBox();
    await page.mouse.move(at(200,700).x,at(200,700).y);await page.mouse.down();
    await page.mouse.move(at(700,880).x,at(700,880).y,{steps:9});await page.mouse.up();
    const shapes=page.locator(".visual-object-hit");
    assert.equal(await shapes.count(),4);
    await shapes.last().dblclick();
    await page.locator("textarea[data-testid='canvas-inline-text']").fill("Mon rectangle");
    const shapeSaved=page.waitForResponse(response=>{
      const req=response.request();
      if(req.method()!=="POST"||!req.url().includes("/.netlify/functions/workspace"))return false;
      try{
        const body=JSON.parse(req.postData()??"{}") as {action?:string;document?:SlideDocument};
        return body.action==="saveSlide"&&!!body.document?.elements.some(e=>e.text==="Mon rectangle");
      }catch{return false;}
    },{timeout:15000});
    await page.locator("textarea[data-testid='canvas-inline-text']").press("Enter");
    await page.waitForFunction(()=>Array.from(document.querySelector<HTMLIFrameElement>(".visual-artboard iframe")?.contentDocument?.querySelectorAll("[data-id]")??[]).some(n=>n.textContent==="Mon rectangle"));
    const formText=await page.locator(".visual-artboard iframe").evaluate(f=>
      Array.from((f as HTMLIFrameElement).contentDocument?.querySelectorAll("[data-id]")??[])
        .some(node=>node.textContent==="Mon rectangle"));
    assert.equal(formText,true);
    // CI runners can be slower than local Chromium; wait for the real save response.
    await shapeSaved;
    await page.getByText("✓ Enregistré",{exact:true}).waitFor({timeout:7000});
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator(".slide-tile").nth(2).click();
    await page.waitForFunction(()=>Array.from(document.querySelector<HTMLIFrameElement>(
      ".visual-artboard iframe")?.contentDocument?.querySelectorAll("[data-id]")??[])
      .some(node=>node.textContent==="Mon rectangle"),undefined,{timeout:9000});
    const persisted=await page.locator(".visual-artboard iframe").evaluate(f=>
      Array.from((f as HTMLIFrameElement).contentDocument?.querySelectorAll("[data-id]")??[])
        .some(node=>node.textContent==="Mon rectangle"));
    assert.equal(persisted,true);
    assert.deepEqual(errors,[]);
    await context.close();
  }finally{
    await browser.close();
    await new Promise<void>((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));
  }
});
