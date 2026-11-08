import type { ImageCandidate, ImageSource } from "./search.ts";

export type CurationOptions={
  query:string;orientation:"any"|"landscape"|"portrait"|"square";
  preferLarge:boolean; minWidth:number; minHeight:number;
};
const words=(s:string)=>new Set(s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .split(/[^a-z0-9]+/).filter(w=>w.length>2));
const stops=new Set(["les","des","une","dans","avec","pour","sur","the","and","photo","image","from","about"]);
function relevance(query:string,title:string):number {
  const q=[...words(query)].filter(w=>!stops.has(w)),t=words(title);
  return q.length?q.filter(w=>t.has(w)).length/q.length:0;
}
export function candidateScore(photo:ImageCandidate,options:CurationOptions):number {
  const {width:w,height:h}=photo;
  const ratio=w>0&&h>0?w/h:0;
  let score=relevance(options.query,photo.title)*6;
  if(options.orientation==="landscape")score+=ratio>=1.35?4:ratio>1?1:-3;
  if(options.orientation==="portrait")score+=ratio>0&&ratio<=.82?4:ratio>0&&ratio<1?1:-3;
  if(options.orientation==="square")score+=ratio>0&&Math.abs(ratio-1)<.17?4:-2;
  if(w&&h){
    score+=w>=options.minWidth&&h>=options.minHeight?4:-3;
    if(options.preferLarge)score+=Math.min(4,(w*h)/1_000_000);
  } else score-=2;
  if(photo.license.toLowerCase().includes("non précisée")||
    photo.license.toLowerCase().includes("à vérifier"))score-=1;
  return score;
}
/** Balanced ranking: prefer relevant high-resolution images without letting one provider monopolize a short list. */
export function curateCandidates(
  entries:{query:string;images:ImageCandidate[]}[],options:Omit<CurationOptions,"query">,
  limit:number
):Array<ImageCandidate&{score:number;matchedQuery:string}>{
  const seen=new Set<string>();
  const scored=entries.flatMap(row=>row.images.map(img=>({
    ...img,score:candidateScore(img,{...options,query:row.query}),matchedQuery:row.query,
  }))).filter(img=>{
    // External image links may contain signed query parameters: preserve them in the displayed URL.
    const key=img.provider+":"+img.id;
    if(seen.has(img.imageUrl)||seen.has(key))return false;
    seen.add(img.imageUrl);seen.add(key);return true;
  }).sort((a,b)=>b.score-a.score);
  const out:typeof scored=[],providerCount=new Map<ImageSource,number>();
  const maxPerProvider=Math.max(2,Math.ceil(limit/2));
  for(const image of scored){
    if(out.length>=limit)break;
    if((providerCount.get(image.provider)??0)>=maxPerProvider)continue;
    out.push(image);providerCount.set(image.provider,(providerCount.get(image.provider)??0)+1);
  }
  if(out.length<limit)for(const image of scored){
    if(out.length>=limit)break;
    if(!out.some(candidate=>candidate.provider===image.provider&&candidate.id===image.id))out.push(image);
  }
  return out;
}
