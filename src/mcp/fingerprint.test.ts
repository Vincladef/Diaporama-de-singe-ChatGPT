import assert from "node:assert/strict";
import {test} from "node:test";
import {fingerprint} from "./fingerprint.ts";
import {SlideDocumentSchema} from "../domain/slide.ts";

const raw={
  animations:[],
  freeform:{css:"h1{font-size:40px}",html:"<h1>Étude</h1>"},
  elements:[{styles:{width:"90%",left:"5%",fontFamily:"Georgia"},type:"text",text:"Étude",id:"titre"}],
  canvas:{height:1080,width:1920},mode:"hybrid",schemaVersion:1
};
test("revisions ignore jsonb and Zod object key ordering",()=>{
  const parsed=SlideDocumentSchema.parse(raw);
  const x=fingerprint({name:"Original",notes:"Notes sources",document:raw as typeof parsed});
  const y=fingerprint({name:"Original",notes:"Notes sources",document:parsed});
  assert.equal(x,y);
});
test("meaningful content and notes changes still invalidate a fingerprint",()=>{
  const document=SlideDocumentSchema.parse(raw);
  const a=fingerprint({name:"Original",notes:"Référence A",document});
  const b=fingerprint({name:"Original",notes:"Référence B",document});
  const changed=structuredClone(document);
  changed.freeform!.css="h1{font-size:41px}";
  assert.notEqual(a,b);
  assert.notEqual(a,fingerprint({name:"Original",notes:"Référence A",document:changed}));
});
