import {chromium as playwright,type Browser} from "playwright-core";
import {randomUUID} from "node:crypto";
import {rm} from "node:fs/promises";
import type {SlideDocument} from "../domain/slide.ts";
import {renderSlideHtml} from "../engine/render.ts";
import {canFetchVisualResource} from "./safety.ts";

export type VisualIssue={kind:"clipping"|"off_canvas"|"missing_image"|"network";selector:string;detail:string};
export type CaptureDiagnostics={
  browser:"Chromium";capturedAt:string;canvas:{width:number;height:number;ratio:number};
  pixelWidth:number;pixelHeight:number;fontsReady:boolean;
  imageCount:number;loadedImages:number;missingImages:number;backgroundImageCount:number;
  failedRequests:number;issues:VisualIssue[];
  warnings:string[];
};
export type CapturedSlide={png:Buffer;diagnostics:CaptureDiagnostics};

const MAX_SIDE=2560;
const MAX_TOTAL_PIXELS=3_700_000;
const MAX_PNG_BYTES=3_500_000;
const LOAD_LIMIT_MS=18_000;
const screenshotOptions={type:"png" as const,animations:"disabled" as const};

async function createBrowser():Promise<{browser:Browser;userDataDir?:string}>{
  // CI provides an installed Playwright Chromium; Netlify bundles Sparticuz Chromium.
  if(process.env.VISUAL_USE_LOCAL_CHROMIUM==="1"){
    const browser=await playwright.launch({headless:true,timeout:20_000});
    return {browser};
  }
  const chromium=(await import("@sparticuz/chromium")).default;
  const userDataDir="/tmp/singe-capture-"+randomUUID();
  const browser=await playwright.launch({
    args:[...chromium.args,"--user-data-dir="+userDataDir],
    executablePath:await chromium.executablePath(),
    headless:true,timeout:24_000,
  });
  return {browser,userDataDir};
}

export async function captureSlidePixels(document:SlideDocument):Promise<CapturedSlide>{
  const width=document.canvas.width,height=document.canvas.height;
  if(width>MAX_SIDE||height>MAX_SIDE||width*height>MAX_TOTAL_PIXELS)
    throw Error("capture_canvas_too_large");
  const html=renderSlideHtml(document);
  const {browser,userDataDir}=await createBrowser();
  try{
    const context=await browser.newContext({
      viewport:{width,height},deviceScaleFactor:1,
      javaScriptEnabled:false,acceptDownloads:false,
      serviceWorkers:"block",colorScheme:"light",
    });
    const page=await context.newPage();
    const failed:string[]=[];
    const allowed=new Map<string,boolean>();
    await page.route("**/*",async route=>{
      const request=route.request();
      const url=request.url();
      const kind=request.resourceType();
      if(url.startsWith("data:")||url.startsWith("about:")||url.startsWith("blob:")){
        await route.continue().catch(()=>{});
        return;
      }
      if(!["image","font","stylesheet"].includes(kind)){
        failed.push("Blocked resource type: "+kind);
        await route.abort().catch(()=>{});return;
      }
      let safe=allowed.get(url);
      if(safe===undefined){
        safe=await canFetchVisualResource(url);
        allowed.set(url,safe);
      }
      if(!safe){
        failed.push("Blocked external resource: "+new URL(url).hostname);
        await route.abort().catch(()=>{});return;
      }
      await route.continue().catch(()=>{});
    });
    page.on("requestfailed",request=>{
      if(failed.length<20)failed.push(request.resourceType()+": "+request.url().slice(0,180));
    });
    page.on("response",response=>{
      if(response.status()>=400&&failed.length<20)
        failed.push("HTTP "+response.status()+": "+response.url().slice(0,180));
    });
    await page.setContent(html,{waitUntil:"domcontentloaded",timeout:LOAD_LIMIT_MS});
    const resources=await page.evaluate(async()=>{
      const timeout=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
      const fonts=await Promise.race([
        document.fonts.ready.then(()=>true).catch(()=>false),
        timeout(7_000).then(()=>false),
      ]);
      const images=Array.from(document.images);
      await Promise.race([
        Promise.allSettled(images.map(image=>image.decode().catch(()=>{}))),
        timeout(7_000),
      ]);
      const failures=images.filter(image=>!image.complete||image.naturalWidth===0);
      const bgs=Array.from(document.querySelectorAll("*")).filter(el=>
        getComputedStyle(el).backgroundImage!=="none").length;
      const candidates=Array.from(document.querySelectorAll("h1,h2,h3,h4,p,li,blockquote,figure,figcaption,span,div,section,article"));
      const issues:VisualIssue[]=[];
      for(const el of candidates){
        const rect=el.getBoundingClientRect();
        const style=getComputedStyle(el);
        if(rect.width<10||rect.height<10||style.visibility==="hidden"||style.display==="none")continue;
        const ownText=Array.from(el.childNodes).some(node=>node.nodeType===Node.TEXT_NODE&&!!node.textContent?.trim());
        const key=el.tagName.toLowerCase()+
          (el.id?"#"+el.id:"")+
          (el.className&&typeof el.className==="string"?"."+el.className.split(/\s+/)[0]:"");
        if(ownText && (el.scrollWidth>el.clientWidth+5||el.scrollHeight>el.clientHeight+5)){
          issues.push({kind:"clipping",selector:key,detail:"Le contenu peut dépasser son bloc ("+
            el.scrollWidth+"×"+el.scrollHeight+" pour "+el.clientWidth+"×"+el.clientHeight+")."});
        }
        if(ownText&&(rect.right<-5||rect.bottom<-5||rect.left>innerWidth+5||rect.top>innerHeight+5)){
          issues.push({kind:"off_canvas",selector:key,detail:"Texte entièrement hors du cadre."});
        }
      }
      for(const image of failures.slice(0,8))issues.push({
        kind:"missing_image",selector:"img",detail:"Image non chargée : "+(image.currentSrc||image.src).slice(0,170),
      });
      return {
        fontsReady:fonts,imageCount:images.length,
        loadedImages:images.length-failures.length,
        missingImages:failures.length,
        backgroundImageCount:bgs,issues:issues.slice(0,32),
      };
    });
    // CSS transitions and animation are disabled in the capture, not in the actual slide.
    await page.addStyleTag({content:"*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important}"});
    const png=await page.screenshot(screenshotOptions);
    if(png.length>MAX_PNG_BYTES)throw Error("capture_png_too_large");
    const ratio=width/height;
    const warnings=[
      ...(Math.abs(ratio-16/9)>.02?["La diapositive n'est pas au format 16:9 : le ratio d'origine est conservé."]:[]),
      ...(!resources.fontsReady?["Certaines polices n'étaient pas prêtes avant la capture."]:[]),
      ...(failed.length?["Des ressources externes ont échoué ou été bloquées ; vérifier le cadrage et les fonds CSS."]:[]),
    ];
    return {png:Buffer.from(png),diagnostics:{
      browser:"Chromium",capturedAt:new Date().toISOString(),
      canvas:{width,height,ratio:Math.round(ratio*1000)/1000},
      pixelWidth:width,pixelHeight:height,fontsReady:resources.fontsReady,
      imageCount:resources.imageCount,loadedImages:resources.loadedImages,
      missingImages:resources.missingImages,backgroundImageCount:resources.backgroundImageCount,
      failedRequests:failed.length,
      issues:[
        ...resources.issues,
        ...failed.slice(0,8).map(detail=>({kind:"network" as const,selector:"resource",detail})),
      ],warnings,
    }};
  }finally{
    await browser.close().catch(()=>{});
    if(userDataDir)await rm(userDataDir,{recursive:true,force:true}).catch(()=>{});
  }
}
