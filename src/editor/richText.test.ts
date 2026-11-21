import test from "node:test";
import assert from "node:assert/strict";
import { applyTextRange, updateTextContent } from "./richText.ts";
import { renderSlideHtml } from "../engine/render.ts";
import { createEmptySlideDocument, SlideDocumentSchema, type SlideElement } from "../domain/slide.ts";

const example:SlideElement={id:"title",type:"text",text:"Bonjour monde",styles:{
  left:"50px",top:"50px",width:"600px",height:"80px",fontSize:"48px"}};

test("a selected word receives its own format without affecting surrounding characters",()=>{
  const styled=applyTextRange(example,0,7,"fontWeight","bold");
  assert.deepEqual(styled.textRuns?.map(r=>({text:r.text,bold:r.styles.fontWeight})),[
    {text:"Bonjour",bold:"bold"},{text:" monde",bold:undefined}
  ]);
  assert.equal(styled.text,"Bonjour monde");
  assert.ok(SlideDocumentSchema.safeParse({...createEmptySlideDocument(),elements:[styled]}).success);
});

test("partial colors produce safe editable inline spans",()=>{
  const styled=applyTextRange(example,8,13,"color","#cc0000");
  const html=renderSlideHtml({...createEmptySlideDocument(),elements:[styled]});
  assert.match(html,/<span style="color:#cc0000">monde<\/span>/);
  assert.doesNotMatch(html,/<span style="position:absolute/);
});

test("editing a formatted title preserves unaffected runs",()=>{
  const styled=applyTextRange(example,0,7,"fontWeight","bold");
  const edited=updateTextContent(styled,"Bonjour beau monde");
  assert.equal(edited.text,"Bonjour beau monde");
  assert.equal(edited.textRuns?.map(r=>r.text).join(""),edited.text);
  assert.equal(edited.textRuns?.[0]?.styles.fontWeight,"bold");
});

test("formatting the same text range twice merges adjacent equal styles",()=>{
  let styled=applyTextRange(example,0,4,"color","#cc0000");
  styled=applyTextRange(styled,4,7,"color","#cc0000");
  assert.equal(styled.textRuns?.length,2);
  assert.equal(styled.textRuns?.[0]?.text,"Bonjour");
});
