import JSZip from "jszip";
import type {PresentationDetail} from "../lib/api";
import {renderSlideHtml} from "../engine/render.ts";
import {safeDownloadName} from "./geometry.ts";
import {buildPlaybackPlan} from "../animation/timeline.ts";

/** Portable HTML deck; source HTML/CSS and the editable JSON are preserved. */
export async function buildHtmlArchive(deck:PresentationDetail){
  if(!deck.slides.length)throw new Error("Aucune diapositive à exporter.");
  const zip=new JSZip();
  const pages=deck.slides.map((slide,i)=>{
    const html=renderSlideHtml(slide.document);
    zip.file("slides/diapositive-"+String(i+1).padStart(2,"0")+".html",html);
    return {html,canvas:slide.document.canvas,plan:buildPlaybackPlan(slide.document.animations)};
  });
  zip.file("presentation.json",JSON.stringify({
    presentation:deck.presentation,
    slides:deck.slides.map(s=>({document:s.document,notes:s.notes})),
  },null,2));
  zip.file("LISEZ-MOI.txt","Diaporama de singe · export HTML/CSS\n"+
    "Ouvrez index.html dans un navigateur. Espace ou flèche droite : étape suivante.\n"+
    "Chaque diapositive possède son fichier HTML/CSS dans slides/.\n"+
    "Le document presentation.json conserve les objets et les animations pour réimportation.\n"+
    "Les photographies externes peuvent nécessiter Internet.\n");
  const payload=JSON.stringify(pages).replace(/</g,"\\u003c").replace(/>/g,"\\u003e")
    .replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
  const title=deck.presentation.title.replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const viewer=`<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#101715;color:#f4f5ee;font:15px system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column}
header{display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap;padding:10px 20px;background:#1c2923;border-bottom:1px solid #384d41}
header strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:65vw}
button{border:1px solid #5c7666;background:#283c31;color:white;border-radius:7px;padding:10px 14px;cursor:pointer;font:inherit}
button:hover{background:#385643}button:focus-visible{outline:2px solid #a6ddbb}
nav{display:flex;align-items:center;gap:8px}#counter{font-size:12px;color:#c6d5ca}
main{flex:1;display:grid;place-items:center;padding:20px;min-height:0}
#stage{position:relative;width:min(100%,calc((100vh - 155px)*16/9),1500px);aspect-ratio:16/9;background:#17221f;overflow:hidden;box-shadow:0 25px 70px #0008}
#frame{position:absolute;inset:0;border:0;transform-origin:top left}
footer{text-align:center;padding:12px;color:#92a798;font-size:12px}
@media(max-width:650px){header strong{max-width:100%}main{padding:8px}button{padding:8px}}
</style></head><body><header><strong>${title}</strong><nav>
<button id="prev" aria-label="Précédent">← Précédent</button><span id="counter"></span>
<button id="next" aria-label="Suivant">Suivant →</button>
<button id="fullscreen" aria-label="Plein écran">⛶</button></nav></header>
<main><div id="stage"><iframe id="frame" sandbox="allow-same-origin"
referrerpolicy="no-referrer" title="Diapositive"></iframe></div></main>
<footer>Espace ou clic : avancer · Flèche gauche : revenir · F : plein écran</footer>
<script>
"use strict";
const pages=${payload};
const stage=document.getElementById("stage"),frame=document.getElementById("frame");
const counter=document.getElementById("counter");
let slide=0,step=0,loading=false;
function resize(){
 const c=pages[slide].canvas;
 const scale=Math.min(stage.clientWidth/c.width,stage.clientHeight/c.height);
 frame.style.width=c.width+"px";frame.style.height=c.height+"px";
 frame.style.transform="scale("+scale+")";
}
function target(cue){
 const doc=frame.contentDocument;if(!doc)return null;
 if(cue.targetElementId)return [...doc.querySelectorAll("[data-id]")].find(
   el=>el.getAttribute("data-id")===cue.targetElementId)||null;
 try{return cue.targetSelector?doc.querySelector(cue.targetSelector):null;}catch{return null;}
}
function apply(cue,instant){
 const el=target(cue);if(!el)return;
 const duration=instant?0:(cue.durationMs||350);
 const execute=()=>{
 el.style.transition=duration+"ms opacity ease, "+duration+"ms transform ease, "+duration+"ms filter ease";
 if(cue.effect==="hide"){el.style.visibility="hidden";el.style.opacity="0";return;}
 if(cue.effect==="dim"){el.style.opacity=".35";return;}
 if(cue.effect==="highlight"){el.style.filter="brightness(1.3)";return;}
 el.style.visibility="visible";el.style.opacity="1";el.style.transform="";
 if(cue.effect==="custom"&&cue.keyframes&&el.animate)el.animate(cue.keyframes,{duration,fill:"forwards"});
 };
 if(!instant&&cue.delayMs)setTimeout(execute,cue.delayMs);else execute();
}
function hideEntrances(){
 const entrance=new Set(["appear","fade","move","scale","wipe","custom"]);
 for(const cue of [...pages[slide].plan.intro,...pages[slide].plan.clicks.flat()]){
   if(!entrance.has(cue.effect))continue;
   const el=target(cue);if(!el)continue;
   el.style.opacity="0";
   if(cue.effect==="appear")el.style.visibility="hidden";
   if(cue.effect==="move")el.style.transform="translateY(20px)";
   if(cue.effect==="scale")el.style.transform="scale(.94)";
 }
}
function count(){
 counter.textContent=(slide+1)+"/"+pages.length+" · clic "+step+"/"+pages[slide].plan.clicks.length;
 resize();
}
function load(number,clicked=0){
 slide=Math.max(0,Math.min(pages.length-1,number));step=0;loading=true;
 stage.style.aspectRatio=pages[slide].canvas.width+"/"+pages[slide].canvas.height;
 frame.onload=()=>{
   hideEntrances();
   for(const cue of pages[slide].plan.intro)apply(cue,true);
   for(let i=0;i<clicked;i++)for(const cue of pages[slide].plan.clicks[i]||[])apply(cue,true);
   step=clicked;loading=false;count();
   frame.contentDocument?.addEventListener("click",next);
   frame.contentDocument?.addEventListener("keydown",key);
 };
 frame.srcdoc=pages[slide].html;count();
}
function next(){
 if(loading)return;
 if(step<pages[slide].plan.clicks.length){
  for(const cue of pages[slide].plan.clicks[step])apply(cue,false);
  step++;count();
 }else if(slide<pages.length-1)load(slide+1);
}
function previous(){
 if(loading)return;
 if(step>0)load(slide,step-1);
 else if(slide>0)load(slide-1,pages[slide-1].plan.clicks.length);
}
function full(){
 if(!document.fullscreenElement)stage.requestFullscreen?.();else document.exitFullscreen?.();
}
function key(e){
 if(["ArrowRight","PageDown"," "].includes(e.key)){e.preventDefault();next();}
 else if(["ArrowLeft","PageUp"].includes(e.key)){e.preventDefault();previous();}
 else if(e.key.toLowerCase()==="f"){e.preventDefault();full();}
}
document.getElementById("next").addEventListener("click",next);
document.getElementById("prev").addEventListener("click",previous);
document.getElementById("fullscreen").addEventListener("click",full);
document.addEventListener("keydown",key);
new ResizeObserver(resize).observe(stage);window.addEventListener("resize",resize);
load(0);
</script></body></html>`;
  zip.file("index.html",viewer);
  const bytes=await zip.generateAsync({type:"uint8array",compression:"DEFLATE"});
  return {blob:new Blob([new Uint8Array(bytes)],{type:"application/zip"}),
    fileName:safeDownloadName(deck.presentation.title).replace(/\.pptx$/i,"")+".zip",
    slideCount:deck.slides.length};
}
