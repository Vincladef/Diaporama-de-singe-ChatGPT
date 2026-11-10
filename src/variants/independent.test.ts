import {test} from "node:test";
import assert from "node:assert/strict";
import {createEmptySlideDocument,type SlideDocument} from "../domain/slide.ts";
import {layoutSignature,prepareIndependentVariants,type IndependentVariantInput} from "./independent.ts";

function made(html:string,css:string,animation=false):SlideDocument{
  const doc=createEmptySlideDocument();
  doc.mode="freeform";
  doc.freeform={html,css};
  if(animation)doc.animations=[
    {id:"reveal-1",targetSelector:".fact",order:0,trigger:"click",effect:"appear",durationMs:350}
  ];
  return doc;
}
function triplet(text:string,firstCss="body{display:grid;grid-template-columns:2fr 1fr}"):IndependentVariantInput[]{
  return [
    {name:"Grande photo",designIntent:"Une photographie principale occupe le côté gauche tandis que le titre est isolé à droite.",
      referenceObservation:"La photographie de référence remplit la moitié de la page.",
      slide:{document:made('<main><img src="https://example.com/a.jpg"/><article><h1>'+text+'</h1></article></main>',firstCss)}},
    {name:"Planche manuscrite",designIntent:"Une succession de figures causales à l'encre relie les étapes dans un sens de lecture vertical.",
      slide:{document:made('<section><h1>'+text+'</h1><svg></svg><p>Étapes</p></section>',
        'section{display:flex;flex-direction:column;gap:24px;padding:80px}')} },
    {name:"Diagramme en constellation",designIntent:"Un schéma radial met l'idée centrale en évidence puis déploie ses relations en périphérie.",
      slide:{document:made('<div class="map"><header>'+text+'</header><svg></svg></div>',
        '.map{position:relative;width:100%;height:100%}header{position:absolute;top:45%;left:42%}')} },
  ];
}
test("accepts independently authored layouts and preserves scientific notes",()=>{
  const source=made("<h1>Relations sociales</h1>","h1{color:red}",true);
  const options=triplet("Relations sociales");
  for(const candidate of options) candidate.slide.document!.animations=[
    {id:"reveal-new",targetSelector:"h1",order:0,trigger:"click",effect:"appear",durationMs:250}
  ];
  const checked=prepareIndependentVariants({document:source,notes:"Source : article scientifique.\nEffet original."},options);
  assert.equal(checked.report.independent,true);
  assert.equal(checked.variants.length,3);
  assert.ok(checked.variants.every(x=>x.slide.notes?.includes("Source : article scientifique.")));
  assert.equal(checked.report.findings.some(x=>x.code==="animations_not_preserved"),false);
  assert.equal(new Set(checked.variants.map(x=>layoutSignature(x.slide.document!))).size,3);
});
test("rejects losing the source's click animations",()=>{
  const source=made("<h1>Modèle de maintien</h1>","h1{padding:100px}",true);
  const result=prepareIndependentVariants({document:source,notes:""},triplet("Modèle de maintien"));
  assert.equal(result.report.independent,false);
  assert.equal(result.report.findings.filter(x=>x.code==="animations_not_preserved").length,3);
});
test("rejects palette/font-only restyling with the exact same geometry",()=>{
  const variants=triplet("Anxiété sociale");
  const a=made("<main><h1>Anxiété sociale</h1></main>","main{display:flex;padding:70px;background:#ffffee;color:red;font-family:Georgia}");
  const b=made("<main><h1>Anxiété sociale</h1></main>","main{display:flex;padding:70px;background:#ff0000;color:blue;font-family:Arial}");
  variants[0]!.slide.document=a;variants[1]!.slide.document=b;
  const result=prepareIndependentVariants({document:made("<p>Source</p>","p{margin:5px}"),notes:"Référence"},variants);
  assert.equal(result.report.independent,false);
  assert.ok(result.report.findings.some(x=>x.code==="only_cosmetic_difference"));
});
test("recognises a genuine inline-layout difference",()=>{
  const a=made('<main style="display:grid;grid-template-columns:50% 50%;color:red"><h1>Titre</h1></main>',"h1{color:red}");
  const b=made('<main style="display:flex;flex-direction:column;color:blue"><h1>Titre</h1></main>',"h1{color:blue}");
  assert.notEqual(layoutSignature(a),layoutSignature(b));
});
test("rejects duplicate concepts, missing authored HTML and altered format",()=>{
  const original=made("<h1>Résultats</h1>","h1{font-size:40px}");
  const options=triplet("Résultats");
  options[1]!.designIntent=options[0]!.designIntent;
  options[2]!.slide.document!.canvas={width:1000,height:1000};
  options[2]!.slide.document!.freeform={html:"",css:""};
  const result=prepareIndependentVariants({document:original,notes:""},options);
  assert.equal(result.report.independent,false);
  assert.ok(result.report.findings.some(x=>x.code==="duplicate_design_intent"));
  assert.ok(result.report.findings.some(x=>x.code==="missing_authored_document"));
  assert.ok(result.report.findings.some(x=>x.code==="aspect_ratio_changed"));
  assert.throws(()=>prepareIndependentVariants({document:original,notes:""},options.slice(0,2)),/requires_three/);
});
test("retains the original citation exactly once if repeated in supplied notes",()=>{
  const base=made("<h1>Conditions expérimentales</h1>","h1{font-size:50px}");
  const variants=triplet("Conditions expérimentales");
  variants[0]!.slide.notes="Original study, DOI 123.\nConseil de narration";
  const result=prepareIndependentVariants({document:base,notes:"Original study, DOI 123."},variants);
  assert.equal(result.variants[0]?.slide.notes?.match(/Original study, DOI 123/g)?.length,1);
});
