import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import {archiveBudget,localPath} from "./webBundle.ts";

test("HTML ZIP local resources resolve from the entry or nested CSS file",()=>{
  assert.equal(localPath("slides/index.html","assets/photo.png"),"slides/assets/photo.png");
  assert.equal(localPath("slides/css/app.css","../images/figure.svg"),"slides/images/figure.svg");
  assert.equal(localPath("slides/index.html","/assets/logo.png"),"assets/logo.png");
  assert.equal(localPath("slides/index.html","https://example.com/a.png"),null);
  assert.equal(localPath("slides/index.html","../../secret.js"),null);
  assert.equal(localPath("slides/index.html","%2fother.js"),null);
  assert.equal(localPath("slides/index.html","..\\secret.js"),null);
});
test("HTML ZIP rejects oversized inflated members before extracting them",async()=>{
  const zip=new JSZip();
  zip.file("index.html","<html></html>");
  zip.file("assets/huge.png",new Uint8Array(8_000_001));
  const loaded=await JSZip.loadAsync(await zip.generateAsync({type:"uint8array",compression:"DEFLATE"}));
  assert.throws(()=>archiveBudget(loaded),/dépasse 8 Mo/);
});
test("HTML ZIP rejects archives with excessive files",async()=>{
  const zip=new JSZip();
  for(let i=0;i<302;i++)zip.file("f"+i+".txt","x");
  const loaded=await JSZip.loadAsync(await zip.generateAsync({type:"uint8array",compression:"DEFLATE"}));
  assert.throws(()=>archiveBudget(loaded),/trop de fichiers/);
});
