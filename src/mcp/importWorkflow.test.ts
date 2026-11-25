import test from "node:test";
import assert from "node:assert/strict";
import {createEmptySlideDocument} from "../domain/slide.ts";
import {sourceContentSignature,compareContentSignatures,compareLockedDeck,
  checkLockedChanges,type LockedBaseline} from "./contentFingerprint.ts";

function sample(){
  const document=createEmptySlideDocument();
  document.elements=[
    {id:"title",type:"text",text:"Question clinique, exactement.",
      styles:{left:"50px",top:"50px",fontSize:"64px"}},
    {id:"original",type:"image",src:"data:image/png;base64,aGVsbG8=",
      styles:{left:"10px",width:"100px"}}
  ];
  return document;
}
test("restyling geometry and palette preserves original locked content",()=>{
  const original=sample();
  const baseline=sourceContentSignature(original,"Notes à conserver");
  const styled=structuredClone(original);
  styled.elements[0]!.styles={left:"300px",color:"#234557",fontSize:"72px"};
  styled.elements[1]!.styles={left:"800px",width:"650px",objectFit:"contain"};
  styled.animations.push({id:"reveal",order:0,trigger:"click",effect:"fade",
    targetElementId:"title",durationMs:350});
  assert.deepEqual(compareContentSignatures(baseline,sourceContentSignature(styled,"Notes à conserver")),[]);
});
test("even punctuation changes are blocked, as are image substitutions or notes loss",()=>{
  const original=sample();
  const baseline=sourceContentSignature(original,"Préparation clinique");
  const altered=structuredClone(original);
  altered.elements[0]!.text="Question clinique exactement.";
  assert.ok(compareContentSignatures(baseline,sourceContentSignature(altered,"Préparation clinique"))
    .includes("content_changed:texts"));
  altered.elements[0]!.text=original.elements[0]!.text;
  altered.elements[1]!.src="data:image/png;base64,d29ybGQ=";
  assert.ok(compareContentSignatures(baseline,sourceContentSignature(altered,"Préparation clinique"))
    .includes("content_changed:images"));
  altered.elements[1]!.src=original.elements[1]!.src;
  assert.ok(compareContentSignatures(baseline,sourceContentSignature(altered,"Notes effacées"))
    .includes("content_changed:notes"));
});
test("a missing original slide is reported and editing protected text is rejected",()=>{
  const original=sample();
  const baseline:LockedBaseline={version:1,slides:[
    {id:"source-slide",signature:sourceContentSignature(original,"Original notes")}]};
  const missing=compareLockedDeck(baseline,[]);
  assert.equal(missing.ok,false);
  assert.deepEqual(missing.slides[0]!.issues,["slide_missing"]);
  const altered=structuredClone(original);
  altered.elements[0]!.text="Texte inventé";
  assert.throws(()=>checkLockedChanges(baseline,[
    {id:"source-slide",document:altered,notes:"Original notes"}]),/locked_content_changed/);
});

test("image fingerprints survive jsonb key reordering on import locks",()=>{
  const original=sample();
  const signature=sourceContentSignature(original,"Notes sources");
  const reordered=structuredClone(signature);
  reordered.images=reordered.images.map(x=>({hash:x.hash,index:x.index,kind:x.kind}));
  const restored=JSON.parse(JSON.stringify(reordered));
  assert.deepEqual(compareContentSignatures(restored,signature),[]);
  const modified=structuredClone(signature);
  modified.images[0]!.hash="changed";
  assert.ok(compareContentSignatures(restored,modified).includes("content_changed:images"));
});
