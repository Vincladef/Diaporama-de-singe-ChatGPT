import test from "node:test";
import assert from "node:assert/strict";
import { createEmptySlideDocument } from "../domain/slide.ts";
import { decodeSourceImage, inventorySourceVisuals, SourceImagePlacementSchema } from "./sourceImages.ts";

const smallPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAOa9tKsAAAAASUVORK5CYII=";
test("direct image input validates PNG content and returns a reusable private data URI", async()=>{
  const image=await decodeSourceImage(smallPng);
  assert.equal(image.mimeType,"image/png");
  assert.equal(image.width,1);
  assert.equal(image.height,1);
  assert.equal(image.sizeBytes,Buffer.from(smallPng,"base64").length);
  assert.ok(image.src.startsWith("data:image/png;base64,"));
  const fromWrapped=await decodeSourceImage("data:image/png;base64,"+smallPng.slice(0,32)+"\n"+smallPng.slice(32));
  assert.equal(fromWrapped.src,image.src);
});
test("base64 rejects malformed, oversized and HTML disguised as images", async()=>{
  await assert.rejects(decodeSourceImage("hello"),/invalid_image_base64/);
  await assert.rejects(decodeSourceImage(Buffer.from("<svg onload=alert(1)>").toString("base64")),/unsupported_image_format/);
  await assert.rejects(decodeSourceImage("A".repeat(4_100_000)),/invalid_image_base64/);
});
test("source selection requires precisely one input and a checked slide revision",()=>{
  const base={presentationId:"11111111-1111-4111-8111-111111111111",
    slideId:"22222222-2222-4222-8222-222222222222",revision:5};
  assert.equal(SourceImagePlacementSchema.safeParse({...base,imageBase64:smallPng}).success,true);
  assert.equal(SourceImagePlacementSchema.safeParse({...base}).success,false);
  assert.equal(SourceImagePlacementSchema.safeParse({...base,imageBase64:smallPng,
    referenceId:"33333333-3333-4333-8333-333333333333"}).success,false);
  assert.equal(SourceImagePlacementSchema.safeParse({...base,imageBase64:smallPng,revision:0}).success,false);
});
test("inventories original images in native layers, HTML and CSS without exposing binary data",()=>{
  const doc=createEmptySlideDocument();
  doc.mode="hybrid";
  doc.elements=[{id:"diagram",type:"image",src:"data:image/png;base64,"+smallPng,styles:{}},
    {id:"vector",type:"svg",text:"<svg></svg>",styles:{}}];
  doc.freeform={html:'<div><img src="https://example.org/figure.jpg" alt="Figure"/><svg></svg></div>',
    css:'.bg{background-image:url("https://example.org/blueprint.webp")}'};
  const result=inventorySourceVisuals(doc);
  assert.equal(result.count,3);
  assert.deepEqual(result.images.map(x=>x.kind),["element","html-image","css-background"]);
  assert.equal(result.svgCount,2);
  assert.ok(result.images[0]!.fingerprint.length===64);
  assert.equal(JSON.stringify(result).includes(smallPng),false);
});
