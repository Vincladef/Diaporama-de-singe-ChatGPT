import test from "node:test";
import assert from "node:assert/strict";
import {directImageUrl} from "./direct.ts";
test("accepts true HTTPS images, including signed query strings",()=>{
 assert.equal(directImageUrl("https://images.unsplash.com/photo.jpeg?auto=format"),
  "https://images.unsplash.com/photo.jpeg?auto=format");
});
test("extracts imgurl only from a Google Images link",()=>{
 const url="https://www.google.com/imgres?imgurl="+encodeURIComponent("https://example.org/picture.jpg")+"&imgrefurl=https://site.org";
 assert.equal(directImageUrl(url),"https://example.org/picture.jpg");
});
test("rejects search results and unsafe protocols",()=>{
 assert.throws(()=>directImageUrl("https://www.google.com/search?tbm=isch&q=paris"),/page Google/);
 assert.throws(()=>directImageUrl("javascript:alert(1)"),/HTTPS/);
 assert.throws(()=>directImageUrl("data:image/svg+xml;base64,ZnJh"),/HTTPS/);
 assert.throws(()=>directImageUrl("https://user:password@example.com/p.jpg"),/identifiants/);
});
