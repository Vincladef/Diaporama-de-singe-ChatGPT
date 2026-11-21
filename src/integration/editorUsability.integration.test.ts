import test from "node:test";
import assert from "node:assert/strict";
import {preview} from "vite";
import {chromium} from "playwright-core";
import type {SlideDocument} from "../domain/slide.ts";

const id="11111111-1111-4111-8111-111111111111";
const slideId="22222222-2222-4222-8222-222222222222";
const now="2026-11-21T17:00:00.000Z";

test("editing gestures work outside the slide, close menus, and keep foregrounds above the master",
{timeout:100_000},async()=>{
  const server=await preview({preview:{port:5198,host:"127.0.0.1",strictPort:true},logLevel:"error"});
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1536,height:768}});
    await context.addInitScript(()=>{
      if(window.top===window)sessionStorage.setItem("diaporama-chatgpt-owner-token","ci-ux-token");
    });
    const doc:SlideDocument={schemaVersion:1,mode:"hybrid",canvas:{width:1920,height:1080},
      animations:[],themeId:"blanc",freeform:{
        html:'<div style="position:absolute;inset:0;background:#173431"></div>'+
        '<h1 style="position:absolute;left:150px;top:145px;width:1060px;height:160px;font-size:78px;color:white">Titre du protocole</h1>'+
        '<p style="position:absolute;left:280px;top:430px;width:600px;height:120px;font-size:46px;color:white">Texte HTML</p>',
        css:""},
      elements:[
        {id:"native-shape",name:"Carré",type:"shape",text:"",styles:{left:"1080px",top:"425px",width:"390px",height:"240px",backgroundColor:"#96b2bb"}},
        {id:"native-text",name:"Zone",type:"text",text:"Salut le monde",styles:{left:"440px",top:"670px",width:"900px",height:"110px",fontSize:"65px",color:"#ffffff"}}
      ]
    };
    const pres={id,title:"Test ergonomique",description:"",format:"16:9",folder_id:null,updated_at:now};
    const slides=[{id:slideId,presentation_id:id,position:0,revision:1,updated_at:now,document:doc,notes:""}];
    await context.route("**/.netlify/functions/workspace**",async route=>{
      const req=route.request(),op=new URL(req.url()).searchParams.get("op");
      let body:{action?:string;id?:string;document?:SlideDocument}={};
      try{body=JSON.parse(req.postData()??"{}")}catch{/* GET */}
      let response:unknown={ok:true,items:[],variants:[]};
      if(req.method()==="GET"){
        if(op==="list")response={presentations:[{...pres,slide_count:slides.length}]};
        if(op==="folders")response={folders:[]};
        if(op==="presentation")response={presentation:pres,slides};
        if(op==="revisions")response={id,title:pres.title,slides:slides.map(s=>({id:s.id,position:s.position,revision:s.revision}))};
      }else if(body.action==="saveSlide"){
        const slide=slides.find(s=>s.id===body.id);
        if(slide&&body.document){slide.document=body.document;slide.revision++;}
        response={slide:{revision:slide?.revision??2,updated_at:now}};
      }else if(body.action==="addSlide"){
        const slide={id:crypto.randomUUID(),presentation_id:id,position:slides.length,revision:1,
          updated_at:now,document:{...structuredClone(doc),mode:"structured" as const,freeform:undefined,elements:[]},
          notes:""};
        slides.push(slide);response={slide:{id:slide.id}};
      }
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(response)});
    });
    const page=await context.newPage();
    const errors:string[]=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.goto("http://127.0.0.1:5198/?deck="+id,{waitUntil:"domcontentloaded"});
    await page.locator(".visual-artboard iframe").waitFor();
    assert.equal(await page.locator(".singe-menubar").count(),0);

    // "Reculer" and "arrière-plan" always stay above the HTML master.
    await page.locator('[data-visual-id="native-shape"]').click({button:"right"});
    await page.getByRole("menuitem",{name:"Reculer d’un niveau"}).click();
    await page.locator('[data-visual-id="native-shape"]').click({button:"right"});
    await page.getByRole("menuitem",{name:"Mettre à l’arrière-plan"}).click();
    await page.waitForFunction(()=>Number(document.querySelector<HTMLIFrameElement>(
      ".visual-artboard iframe")?.contentDocument?.querySelector<HTMLElement>(
      '[data-id="native-shape"]')?.style.zIndex)>0);
    assert.deepEqual(await page.locator(".visual-artboard iframe").evaluate(f=>{
      const d=(f as HTMLIFrameElement).contentDocument!;
      return {background:d.body.firstElementChild?.getAttribute("style")?.includes("z-index: 0"),
        visible:d.elementFromPoint(1200,520)?.getAttribute("data-id")==="native-shape"};
    }),{background:true,visible:true});

    // Marquee can begin on the gray pasteboard, before reaching the slide.
    const art=await page.locator(".visual-artboard").boundingBox();
    assert.ok(art);
    const at=(x:number,y:number)=>({x:art.x+x*art.width/1920,y:art.y+y*art.height/1080});
    await page.mouse.move(art.x-25,art.y+40);await page.mouse.down();
    await page.mouse.move(art.x+art.width*.85,art.y+art.height*.9,{steps:15});
    assert.equal(await page.locator(".visual-marquee").count(),1);
    await page.mouse.up();
    assert.equal(await page.locator(".visual-object-hit.is-selected").count(),2);
    assert.equal(await page.locator(".freeform-selection").count(),1);

    // Native word selection persists when focusing the size field.
    await page.locator('[data-visual-id="native-text"]').dblclick();
    const textarea=page.locator('textarea[data-testid="canvas-inline-text"]');
    await textarea.focus();await textarea.press("Home");
    for(let n=0;n<5;n++)await textarea.press("Shift+ArrowRight");
    const font=page.locator('input[aria-label="Taille de police"]');
    await font.fill("104");await font.press("Enter");
    await page.waitForFunction(()=>document.querySelector<HTMLIFrameElement>(
      ".visual-artboard iframe")?.contentDocument?.querySelector(
      '[data-id="native-text"]')?.innerHTML.includes("font-size:104px"));
    const nativeHtml=await page.locator(".visual-artboard iframe").evaluate(f=>
      (f as HTMLIFrameElement).contentDocument?.querySelector('[data-id="native-text"]')?.innerHTML);
    assert.match(nativeHtml??"",/font-size:104px">Salut<\/span>/);
    assert.doesNotMatch(nativeHtml??"",/font-size:104px"> le monde/);

    // The redundant freeform quickbar is removed, while top-bar toggles work.
    await page.mouse.click(at(320,220).x,at(320,220).y);
    await page.locator(".freeform-selection").waitFor();
    assert.equal(await page.locator(".freeform-quickbar").count(),0);
    const boldButton=page.locator('.singe-formatbar button[title="Gras"]');
    const first=await page.locator(".visual-artboard iframe").evaluate(f=>
      (f as HTMLIFrameElement).contentDocument!.defaultView!.getComputedStyle(
      (f as HTMLIFrameElement).contentDocument!.querySelector("h1")!).fontWeight);
    await boldButton.click();
    const second=await page.locator(".visual-artboard iframe").evaluate(f=>
      (f as HTMLIFrameElement).contentDocument!.defaultView!.getComputedStyle(
      (f as HTMLIFrameElement).contentDocument!.querySelector("h1")!).fontWeight);
    await boldButton.click();
    const third=await page.locator(".visual-artboard iframe").evaluate(f=>
      (f as HTMLIFrameElement).contentDocument!.defaultView!.getComputedStyle(
      (f as HTMLIFrameElement).contentDocument!.querySelector("h1")!).fontWeight);
    assert.notEqual(second,first);
    assert.equal(third,first);

    // Dropdowns close on outside clicks and are exclusive.
    await page.locator(".singe-layout-picker summary").click();
    assert.equal(await page.locator(".singe-layout-picker").getAttribute("open"),"");
    await page.locator(".visual-viewport").click({position:{x:15,y:15}});
    assert.equal(await page.locator(".singe-layout-picker").getAttribute("open"),null);
    await page.locator(".singe-layout-picker summary").click();
    await page.locator(".singe-formatbar .shape-picker summary").click();
    await page.waitForTimeout(50);
    assert.equal(await page.locator(".singe-layout-picker").getAttribute("open"),null);
    assert.equal(await page.locator(".singe-formatbar .shape-picker").getAttribute("open"),"");
    await page.locator(".visual-viewport").click({position:{x:15,y:15}});

    // The layout mini is generated from the actual four objects: title + cards.
    await page.locator(".singe-layout-picker summary").click();
    const layoutButton=page.locator('.singe-layout-picker button[title="Un titre et trois cartes avec fond"]');
    assert.equal(await layoutButton.locator(".singe-layout-mini-slot").count(),4);
    assert.equal(await layoutButton.locator(".is-card").count(),3);
    await layoutButton.click();
    await page.locator(".slide-tile").nth(1).waitFor({timeout:8000});
    const cards=await page.locator(".visual-artboard iframe").evaluate(f=>
      Array.from((f as HTMLIFrameElement).contentDocument!.querySelectorAll<HTMLElement>("[data-id]"))
        .filter(e=>e.style.backgroundColor==="rgb(237, 242, 247)").length);
    assert.equal(cards,3);
    assert.deepEqual(errors,[]);
    await context.close();
  }finally{
    await browser.close();
    await new Promise<void>((resolve,reject)=>server.httpServer.close(error=>error?reject(error):resolve()));
  }
});
