import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {inspectPhotoBuffer,safePhotoHost} from "./inspection.ts";

test("Sharp validates real picture pixels and generates three WebP crops",async()=>{
 const input=await sharp({create:{width:1680,height:1040,channels:3,background:{r:88,g:125,b:103}}})
   .png().toBuffer();
 const result=await inspectPhotoBuffer(input,{width:1280,height:720});
 assert.equal(result.width,1680);
 assert.equal(result.height,1040);
 assert.equal(result.resolution,"adequate");
 assert.deepEqual(result.crops.map(c=>c.id),["center","attention","entropy"]);
 for(const item of result.crops){
   const buf=Buffer.from(item.previewBase64,"base64");
   const metadata=await sharp(buf).metadata();
   assert.equal(metadata.format,"webp");
   assert.equal(metadata.width,800);
   assert.equal(metadata.height,450);
   assert.ok(item.focalX>=0&&item.focalX<=100);
   assert.ok(item.focalY>=0&&item.focalY<=100);
 }
});
test("Sharp flags insufficient resolution without inventing pixels",async()=>{
 const input=await sharp({create:{width:320,height:220,channels:3,background:"#957650"}}).png().toBuffer();
 const result=await inspectPhotoBuffer(input,{width:1500,height:850});
 assert.equal(result.resolution,"insufficient");
 assert.ok(result.warning);
});
test("remote inspection rejects arbitrary and private hosts",()=>{
 assert.equal(safePhotoHost("https://images.unsplash.com/photo-abc"),true);
 assert.equal(safePhotoHost("http://images.unsplash.com/photo-abc"),false);
 assert.equal(safePhotoHost("https://localhost/secret"),false);
 assert.equal(safePhotoHost("https://10.2.3.4/internal"),false);
 assert.equal(safePhotoHost("https://evil.example/portrait"),false);
});
