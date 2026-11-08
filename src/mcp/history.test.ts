import test from "node:test";
import assert from "node:assert/strict";
import { checkpointName,HISTORY_PREFIX } from "./history.ts";
import {importNativeJson} from "../import/parse.ts";
import {createEmptySlideDocument} from "../domain/slide.ts";
test("history labels carry the saved revision and source",()=>{
 assert.equal(checkpointName(5,"MCP"),"Historique r5 · MCP");
 assert.ok(checkpointName(5,"éditeur").startsWith(HISTORY_PREFIX));
 assert.throws(()=>checkpointName(-1,"éditeur"),/invalid_revision/);
});
test("emergency local backup is directly importable as a one-slide deck",()=>{
 const document=createEmptySlideDocument();
 document.elements=[{id:"title",type:"text",text:"Brouillon important",styles:{}}];
 const backup=JSON.stringify({presentation:{title:"Brouillon local"},
   slides:[{document,notes:"Conserver ces notes"}],
   backup:{sourceRevision:11,sourceDeckId:"example"}});
 const parsed=importNativeJson(backup,"brouillon.json");
 assert.equal(parsed.title,"Brouillon local");
 assert.equal(parsed.slides[0]?.document.elements[0]?.text,"Brouillon important");
 assert.equal(parsed.slides[0]?.notes,"Conserver ces notes");
});
