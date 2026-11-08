import test from "node:test";
import assert from "node:assert/strict";
import { googleImagesUrl, normalizeOpenverse, normalizeWikimedia, normalizePexels, normalizeUnsplash, imageRequestSchema } from "./search.ts";

test("Openverse metadata keeps image, attribution and rights",()=>{
 const result=normalizeOpenverse({results:[{id:"photo-1",title:"Landscape",url:"https://example.org/image.jpg",
   thumbnail:"https://example.org/thumb.jpg",creator:"Ada",license:"by",license_version:"4.0",width:1920,height:1080}]});
 assert.equal(result.length,1);
 assert.equal(result[0]?.license,"by 4.0");
 assert.equal(result[0]?.creator,"Ada");
 assert.equal(result[0]?.imageUrl,"https://example.org/image.jpg");
});
test("unsafe image URLs are discarded",()=>{
 const result=normalizeOpenverse({results:[{id:"one",url:"javascript:alert(1)",thumbnail:"https://example.org/a.jpg"}]});
 assert.equal(result.length,0);
});
test("Wikimedia rights data and thumbnail are normalized",()=>{
 const result=normalizeWikimedia({query:{pages:[{pageid:99,title:"File:Test.png",imageinfo:[{
   url:"https://upload.wikimedia.org/wikipedia/commons/test.png",thumburl:"https://upload.wikimedia.org/thumb.png",
   descriptionurl:"https://commons.wikimedia.org/wiki/File:Test.png",
   width:100,height:200,extmetadata:{Artist:{value:"<a>Auteur</a>"},LicenseShortName:{value:"CC BY-SA 4.0"}}
 }]}]}});
 assert.equal(result[0]?.creator,"Auteur");
 assert.equal(result[0]?.license,"CC BY-SA 4.0");
});
test("Pexels and Unsplash preserve origin",()=>{
 const p=normalizePexels({photos:[{id:123,photographer:"Sam",src:{original:"https://images.pexels.com/a.jpeg"}}]});
 assert.equal(p[0]?.provider,"pexels");
 const u=normalizeUnsplash({results:[{id:"ABC",urls:{regular:"https://images.unsplash.com/a.jpg"},
   links:{download_location:"https://api.unsplash.com/photos/ABC/download"},user:{name:"Jo"}}]});
 assert.equal(u[0]?.downloadLocation,"https://api.unsplash.com/photos/ABC/download");
});
test("query validation bounds source fanout",()=>{
 assert.equal(imageRequestSchema.safeParse({query:"a",sources:["openverse"]}).success,false);
 assert.equal(imageRequestSchema.parse({query:"design",sources:["openverse"]}).perSource,20);
 assert.ok(googleImagesUrl("social anxiety").includes("social%20anxiety"));
});
