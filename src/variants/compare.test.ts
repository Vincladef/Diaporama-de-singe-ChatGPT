import test from "node:test";
import assert from "node:assert/strict";
import { createEmptySlideDocument } from "../domain/slide.ts";
import { compareOneVariant,fingerprint } from "./compare.ts";
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
