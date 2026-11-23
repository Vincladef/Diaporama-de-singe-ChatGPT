import test from "node:test";
import assert from "node:assert/strict";
import { createEmptySlideDocument } from "../domain/slide.ts";
import { compareOneVariant } from "./compare.ts";
import { fingerprint } from "../mcp/fingerprint.ts";
test("variant report preserves source text, image urls and notes",()=>{
  const doc=createEmptySlideDocument();
  doc.elements=[{id:"headline",type:"text",text:"La connaissance",styles:{fontFamily:"Georgia",color:"#332A24"}},
    {id:"photo",type:"image",src:"https://example.org/photo.jpg",styles:{width:"700px",height:"450px"}}];
  const base={name:"Actuelle",document:doc,notes:"Ne pas modifier"};
  const variant={name:"Archive",document:structuredClone(doc),notes:"Ne pas modifier"};
  variant.document.elements[0]!.styles.fontFamily="Arial";
  const comparison=compareOneVariant(base,variant);
  assert.equal(comparison.preserves.text,true);
  assert.equal(comparison.preserves.imageUrls,true);
  assert.equal(comparison.preserves.notes,true);
  assert.equal(comparison.indicators.imageCount,1);
  assert.equal(fingerprint(variant),fingerprint(variant));
});
test("modified intellectual content is signaled without inventing a score",()=>{
  const doc=createEmptySlideDocument();
  doc.elements=[{id:"text",type:"text",text:"Étude initiale",styles:{}}];
  const altered=structuredClone(doc);
  altered.elements[0]!.text="Autre contenu";
  const result=compareOneVariant({name:"Origine",document:doc,notes:""},
    {name:"Version",document:altered,notes:""});
  assert.equal(result.preserves.text,false);
  assert.ok(!("qualityScore" in result));
});

test("existing HTML figure cannot disappear unnoticed in a graphic variant",()=>{
  const source=createEmptySlideDocument();
  source.mode="freeform";
  source.freeform={html:'<h1>Le modèle</h1><figure><img src="data:image/png;base64,AA=="></figure>',
    css:'.background{background-image:url("https://example.org/diagram.png")}'};
  const altered=structuredClone(source);
  altered.freeform!.html='<h1>Le modèle</h1><section>Autre composition</section>';
  altered.freeform!.css="";
  const result=compareOneVariant({name:"Original",document:source,notes:""},
    {name:"Recomposition",document:altered,notes:""});
  assert.equal(result.preserves.imageUrls,false);
  assert.equal(result.preserves.sourceVisuals,false);
  assert.equal(result.indicators.missingSourceImages,2);
  assert.equal(result.importantFindings[0]?.code,"source_images_missing");
});
test("same original figure remains preserved after moving from HTML to an editable image object",()=>{
  const src="data:image/png;base64,AA==";
  const source=createEmptySlideDocument();
  source.mode="freeform";
  source.freeform={html:'<img src="'+src+'">',css:""};
  const target=createEmptySlideDocument();
  target.elements=[{id:"original-diagram",type:"image",src,styles:{objectFit:"contain"}}];
  const result=compareOneVariant({name:"Original",document:source,notes:""},
    {name:"Restylage",document:target,notes:""});
  assert.equal(result.preserves.imageUrls,true);
  assert.equal(result.preserves.sourceVisuals,true);
  assert.equal(result.indicators.missingSourceImages,0);
});
test("original SVG diagrams disappearing are flagged even when the text is unchanged",()=>{
  const source=createEmptySlideDocument();
  source.mode="freeform";
  source.freeform={html:"<h1>Modèle</h1><svg viewBox='0 0 10 10'></svg>",css:""};
  const target=structuredClone(source);
  target.freeform!.html="<h1>Modèle</h1>";
  const result=compareOneVariant({name:"Original",document:source,notes:""},
    {name:"Sans diagramme",document:target,notes:""});
  assert.equal(result.indicators.missingSourceDiagrams,1);
  assert.ok(result.importantFindings.some(f=>f.code==="source_diagrams_missing"));
});
