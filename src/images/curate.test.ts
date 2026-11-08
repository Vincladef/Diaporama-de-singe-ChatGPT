import test from "node:test";
import assert from "node:assert/strict";
import { candidateScore,curateCandidates } from "./curate.ts";
import type { ImageCandidate } from "./search.ts";
const image=(id:string,provider:ImageCandidate["provider"],width:number,height:number,title:string):ImageCandidate=>({
  id,provider,title,alt:title,imageUrl:"https://example.com/"+id+".jpg",
  previewUrl:"https://example.com/"+id+"-preview.jpg",pageUrl:"https://example.com/source/"+id,
  creator:"Author",license:"CC BY",attribution:"Author · CC BY",width,height
});
test("prefers relevant large landscape images",()=>{
  const options={query:"nature mountain",orientation:"landscape" as const,preferLarge:true,minWidth:1000,minHeight:600};
  const large=image("large","wikimedia",2400,1400,"nature mountain");
  const small=image("small","openverse",400,800,"unrelated");
  assert.ok(candidateScore(large,options)>candidateScore(small,options));
});
test("deduplicates sources and balances the shortlist",()=>{
  const photos=[
    image("a","wikimedia",2400,1600,"mountain lake"),
    image("b","wikimedia",2200,1600,"mountain"),
    image("c","wikimedia",2100,1500,"mountain"),
    image("d","pexels",2000,1300,"mountain"),
    image("e","unsplash",2400,1600,"mountain"),
  ];
  const out=curateCandidates([{query:"mountain",images:[...photos,photos[0]!]}],
    {orientation:"landscape",minWidth:1000,minHeight:600,preferLarge:true},4);
  assert.equal(out.length,4);
  assert.ok(new Set(out.map(p=>p.provider)).size>1);
  assert.equal(new Set(out.map(p=>p.id)).size,4);
});
