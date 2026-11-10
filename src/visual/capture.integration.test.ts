import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {createEmptySlideDocument} from "../domain/slide.ts";
import {captureSlidePixels} from "./capture.ts";
import {DiagramSchema} from "../graphics/diagrams.ts";
import {composeElkDiagram} from "../graphics/elkLayout.ts";

// This test really launches a Chromium browser in GitHub Actions (not a static audit).
process.env.VISUAL_USE_LOCAL_CHROMIUM="1";
test("captures actual Chromium pixels from two independent presentation compositions",{timeout:120_000},async()=>{
  const base=createEmptySlideDocument();
  base.mode="freeform";
  base.freeform={
    html:'<main class="stage"><div class="eyebrow">MODÈLE COGNITIF</div><h1>Ce qui entretient la peur</h1><p>Attention sur soi · sécurité · rumination</p><svg viewBox="0 0 600 350"><circle cx="260" cy="180" r="105" fill="#c8ac87"/><circle cx="260" cy="180" r="170" stroke="#6f846f" stroke-width="5" fill="none"/><text x="260" y="188" text-anchor="middle" font-size="30" fill="#152a25">Anxiété</text></svg></main>',
    css:"html,body{background:#ecebe3;color:#162a24;font-family:Georgia,serif}.stage{padding:90px;position:relative;width:100%;height:100%}.eyebrow{font:20px Arial;letter-spacing:4px}h1{font-size:115px;width:900px;line-height:1.05;margin:90px 0 40px}p{font-size:36px}svg{position:absolute;right:80px;bottom:80px;width:720px;height:500px}",
  };
  console.log("REAL_CHROMIUM_TEST: starting first capture");
  const first=await captureSlidePixels(base);
  console.log("REAL_CHROMIUM_TEST: first capture bytes",first.png.byteLength);
  assert.equal(first.diagnostics.browser,"Chromium");
  assert.equal(first.diagnostics.pixelWidth,1920);
  assert.equal(first.diagnostics.pixelHeight,1080);
  assert.equal(first.diagnostics.canvas.ratio,1.778);
  assert.ok(first.png.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex")));
  assert.ok(first.png.byteLength>8000);
  assert.equal(first.diagnostics.missingImages,0);
  const alternate=structuredClone(base);
  alternate.freeform={
    html:'<main class="editorial"><aside><h1>Une boucle<br>qui se répète</h1></aside><section><h2>Attention sur soi</h2><p>Les protections empêchent de constater que la conversation se déroule autrement.</p><div class="rule"></div></section></main>',
    css:"html,body{background:#203d35;color:#f0ece1;font-family:Georgia,serif}.editorial{display:grid;grid-template-columns:52% 48%;height:100%;width:100%}.editorial aside{padding:150px 80px}h1{font-size:105px;line-height:1.02;font-weight:normal}.editorial section{background:#e7cdb0;color:#283930;padding:200px 90px}h2{font-size:66px}p{font-size:36px;line-height:1.4}.rule{border-top:5px solid #5d7866;margin-top:90px}",
  };
  console.log("REAL_CHROMIUM_TEST: starting second capture");
  const second=await captureSlidePixels(alternate);
  console.log("REAL_CHROMIUM_TEST: second capture bytes",second.png.byteLength);
  assert.ok(second.png.byteLength>8000);
  assert.notDeepEqual(first.png,second.png);
  assert.equal(second.diagnostics.missingImages,0);
  await mkdir("artifacts",{recursive:true});
  await Promise.all([
    writeFile("artifacts/visual-cognitive-loop.png",first.png),
    writeFile("artifacts/visual-two-column.png",second.png),
    writeFile("artifacts/visual-capture-diagnostics.json",JSON.stringify({
      cognitive:first.diagnostics,editorial:second.diagnostics},null,2)),
  ]);
});

test("captures actual scientific causal network with ELK via Chromium",{timeout:120_000},async()=>{
 const spec=DiagramSchema.parse({
   kind:"causal",title:"Maintien de l'anxiété sociale",
   subtitle:"Modèle conceptuel de Clark et Wells (1995)",
   nodes:[
     {id:"attention",label:"Attention centrée sur soi"},
     {id:"images",label:"Image négative de soi"},
     {id:"securite",label:"Comportements de sécurité"},
     {id:"peur",label:"Maintien de la peur",emphasis:true}
   ],
   edges:[
     {from:"attention",to:"images",label:"renforce"},
     {from:"images",to:"securite"},
     {from:"securite",to:"peur"},
     {from:"peur",to:"attention"}
   ],notes:"Schéma de concepts théoriques, pas preuve causale."
 });
 const document=await composeElkDiagram(spec);
 const rendered=await captureSlidePixels(document);
 assert.equal(rendered.diagnostics.pixelWidth,1920);
 assert.equal(rendered.diagnostics.pixelHeight,1080);
 assert.equal(rendered.diagnostics.missingImages,0);
 assert.ok(rendered.png.length>9000);
 assert.equal(document.elements.filter(e=>e.type==="text"&&e.id.startsWith("diagram-node-")).length,4);
 await mkdir("artifacts",{recursive:true});
 await writeFile("artifacts/visual-elk-clark-wells.png",rendered.png);
});
