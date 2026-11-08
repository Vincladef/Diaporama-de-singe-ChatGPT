import { z } from "zod";

/** A normalized, copyright-aware asset candidate. Images are never proxied or cached. */
export const ImageSourceSchema=z.enum(["openverse","wikimedia","pexels","unsplash","google"]);
export type ImageSource=z.infer<typeof ImageSourceSchema>;
export interface ImageCandidate {
  id:string; provider:ImageSource; title:string; alt:string; previewUrl:string; imageUrl:string;
  pageUrl:string; creator:string; license:string; attribution:string; width:number; height:number;
  downloadLocation?:string; // Unsplash API requires a download-tracking request when selected.
}
export interface ImageSearchRequest {
  query:string; sources:ImageSource[]; page:number; perSource:number; orientation:"any"|"landscape"|"portrait"|"square";
}
export interface ImageSearchResult {
  query:string; page:number; images:ImageCandidate[];
  providers:Record<ImageSource,{enabled:boolean;status:"ok"|"unavailable"|"error"|"not_requested";count:number;reason?:string}>;
  googleSearchUrl:string;
}
export const imageRequestSchema=z.object({
  query:z.string().trim().min(2).max(160),
  sources:z.array(ImageSourceSchema).min(1).max(5).default(["openverse","wikimedia"]),
  page:z.number().int().min(1).max(15).default(1),
  perSource:z.number().int().min(1).max(30).default(20),
  orientation:z.enum(["any","landscape","portrait","square"]).default("any"),
});
const allowedHttps=(value:unknown):string=>{
  if(typeof value!=="string"||value.length>2500)return "";
  try{return new URL(value).protocol==="https:" ? value : ""}catch{return ""}
};
const asString=(x:unknown,max=250)=>typeof x==="string"?x.slice(0,max):"";
const asNumber=(x:unknown)=>typeof x==="number"&&Number.isFinite(x)?x:0;
const asRecord=(x:unknown):Record<string,unknown>=>x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};
const asArray=(x:unknown):unknown[]=>Array.isArray(x)?x:[];

async function retrieve(url:string, headers:Record<string,string>={},maxWait=6500):Promise<Record<string,unknown>>{
  const response=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"DiaporamaDeSingeChatGPT/0.6 (personal presentation editor)",...headers},signal:AbortSignal.timeout(maxWait)});
  if(!response.ok)throw new Error("upstream_http_"+response.status);
  if(Number(response.headers.get("content-length")||0)>1_800_000)throw new Error("oversize_api_response");
  return asRecord(await response.json());
}
export function googleImagesUrl(query:string):string{
  return "https://www.google.com/search?tbm=isch&q="+encodeURIComponent(query.trim());
}
export function normalizeOpenverse(json:Record<string,unknown>):ImageCandidate[]{
  return asArray(json.results).flatMap(value=>{
    const row=asRecord(value), imageUrl=allowedHttps(row.url),previewUrl=allowedHttps(row.thumbnail)||imageUrl;
    if(!imageUrl||!previewUrl)return [];
    const creator=asString(row.creator,140),title=asString(row.title,180)||"Image Openverse",license=asString(row.license,60);
    return [{
      id:"openverse:"+asString(row.id,110),provider:"openverse" as const,title,alt:title,previewUrl,imageUrl,
      pageUrl:allowedHttps(row.foreign_landing_url)||allowedHttps(row.detail_url)||"https://openverse.org/",
      creator,license:license ? license+(row.license_version ? " "+row.license_version : "") : "Licence non précisée",
      attribution:creator ? creator+" · "+license : license,
      width:asNumber(row.width),height:asNumber(row.height),
    }];
  });
}
export function normalizeWikimedia(json:Record<string,unknown>):ImageCandidate[]{
  const pages=asArray(asRecord(json.query).pages);
  return pages.flatMap(value=>{
    const row=asRecord(value),info=asRecord(asArray(row.imageinfo)[0]),meta=asRecord(info.extmetadata);
    const raw=allowedHttps(info.url),thumb=allowedHttps(info.thumburl)||raw;
    if(!raw||!thumb)return [];
    const title=asString(row.title,180).replace(/^File:/,"");
    const attribution=asString(asRecord(meta.Artist).value,300).replace(/<[^>]*>/g," ").trim();
    const license=asString(asRecord(meta.LicenseShortName).value,140)||"Voir la fiche Wikimedia";
    return [{id:"wikimedia:"+asString(row.pageid,80),provider:"wikimedia" as const,title,alt:title,
      previewUrl:thumb,imageUrl:raw,pageUrl:allowedHttps(info.descriptionurl)||"https://commons.wikimedia.org/",
      creator:attribution,license,attribution:(attribution||"Wikimedia Commons")+" · "+license,
      width:asNumber(info.width),height:asNumber(info.height)}];
  });
}
export function normalizePexels(json:Record<string,unknown>):ImageCandidate[]{
  return asArray(json.photos).flatMap(value=>{
    const row=asRecord(value),src=asRecord(row.src);
    const raw=allowedHttps(src.large2x)||allowedHttps(src.original),thumb=allowedHttps(src.medium)||raw;
    if(!raw||!thumb)return [];
    const creator=asString(row.photographer,140),title=asString(row.alt,160)||"Photo Pexels";
    return [{id:"pexels:"+asString(row.id,80),provider:"pexels" as const,title,alt:title,imageUrl:raw,previewUrl:thumb,
      pageUrl:allowedHttps(row.url)||"https://www.pexels.com/",creator,license:"Licence Pexels",
      attribution:(creator||"Photographe")+" · Pexels",width:asNumber(row.width),height:asNumber(row.height)}];
  });
}
export function normalizeGoogleImages(json:Record<string,unknown>):ImageCandidate[]{
  return asArray(json.images_results).flatMap(value=>{
    const row=asRecord(value),raw=allowedHttps(row.original),thumb=allowedHttps(row.thumbnail)||raw;
    if(!raw||!thumb)return [];
    const title=asString(row.title,160)||"Image Google",creator=asString(row.source,140);
    return [{id:"google:"+asString(row.position,60)+":"+raw.slice(0,80),provider:"google" as const,
      title,alt:title,previewUrl:thumb,imageUrl:raw,
      pageUrl:allowedHttps(row.link)||"https://www.google.com/imghp",
      creator,license:"Droits à vérifier sur le site source",attribution:creator||"Site source",
      width:asNumber(row.original_width),height:asNumber(row.original_height)}];
  });
}
export function normalizeUnsplash(json:Record<string,unknown>):ImageCandidate[]{
  return asArray(json.results).flatMap(value=>{
    const row=asRecord(value),urls=asRecord(row.urls),links=asRecord(row.links),user=asRecord(row.user);
    const raw=allowedHttps(urls.regular)||allowedHttps(urls.full),thumb=allowedHttps(urls.small)||raw;
    if(!raw||!thumb)return [];
    const title=asString(row.alt_description,160)||asString(row.description,160)||"Photo Unsplash";
    const creator=asString(user.name,140);
    return [{id:"unsplash:"+asString(row.id,100),provider:"unsplash" as const,title,alt:title,
      imageUrl:raw,previewUrl:thumb,pageUrl:allowedHttps(links.html)||"https://unsplash.com/",
      creator,license:"Licence Unsplash",attribution:(creator||"Photographe")+" · Unsplash",
      width:asNumber(row.width),height:asNumber(row.height),downloadLocation:allowedHttps(links.download_location)}];
  });
}
const enabled=(s:ImageSource)=>s==="openverse"||s==="wikimedia"||
  (s==="google"&&!!process.env.SERPAPI_API_KEY)||
  (s==="pexels"&&!!process.env.PEXELS_API_KEY)||
  (s==="unsplash"&&!!process.env.UNSPLASH_ACCESS_KEY);
// Google Images does not offer a generally available REST image search for new API users in 2026.
export function getSourceStatuses(){
  return (["openverse","wikimedia","pexels","unsplash","google"] as ImageSource[]).map(s=>({
    source:s,enabled:enabled(s),mode:s==="google"?"external":enabled(s)?"integrated":"requires_api_key",
  }));
}
async function fromSource(source:ImageSource,req:ImageSearchRequest):Promise<ImageCandidate[]> {
  if(source==="google"){
    const key=process.env.SERPAPI_API_KEY;if(!key)return [];
    const p=new URLSearchParams({engine:"google_images",q:query,ijn:String(page-1),api_key:key,hl:"fr",safe:"active"});
    const images=normalizeGoogleImages(await retrieve("https://serpapi.com/search.json?"+p));
    return images.slice(0,perSource);
  }
  const {query,page,perSource,orientation}=req;
  if(source==="openverse"){
    const params=new URLSearchParams({q:query,page:String(page),page_size:String(perSource),mature:"false"});
    if(orientation!=="any")params.set("aspect_ratio",orientation==="square"?"square":orientation==="landscape"?"wide":"tall");
    return normalizeOpenverse(await retrieve("https://api.openverse.org/v1/images/?"+params));
  }
  if(source==="wikimedia"){
    const params=new URLSearchParams({action:"query",format:"json",formatversion:"2",generator:"search",
      gsrsearch:query+" filetype:bitmap",gsrnamespace:"6",gsrlimit:String(perSource),gsroffset:String((page-1)*perSource),
      prop:"imageinfo",iiprop:"url|size|extmetadata",iiurlwidth:"540",origin:"*"});
    return normalizeWikimedia(await retrieve("https://commons.wikimedia.org/w/api.php?"+params));
  }
  if(source==="pexels"){
    const key=process.env.PEXELS_API_KEY;
    if(!key)return [];
    const p=new URLSearchParams({query,page:String(page),per_page:String(perSource)});
    if(orientation!=="any")p.set("orientation",orientation);
    return normalizePexels(await retrieve("https://api.pexels.com/v1/search?"+p,{"Authorization":key}));
  }
  const key=process.env.UNSPLASH_ACCESS_KEY;
  if(!key)return [];
  const p=new URLSearchParams({query,page:String(page),per_page:String(perSource),content_filter:"high"});
  if(orientation!=="any")p.set("orientation",orientation==="square"?"squarish":orientation);
  return normalizeUnsplash(await retrieve("https://api.unsplash.com/search/photos?"+p,{"Authorization":"Client-ID "+key}));
}

export async function searchImages(input:ImageSearchRequest):Promise<ImageSearchResult> {
  const args=imageRequestSchema.parse(input);
  const statuses=Object.fromEntries((["openverse","wikimedia","pexels","unsplash","google"] as ImageSource[])
    .map(x=>[x,{enabled:enabled(x),status:"not_requested" as const,count:0}])) as ImageSearchResult["providers"];
  const sources=[...new Set(args.sources)];
  const found=await Promise.all(sources.map(async source=>{
    if(!enabled(source)){statuses[source]={enabled:false,status:"unavailable",count:0,reason:"Clé API non configurée sur Netlify."};return [];}
    try{
      const images=await fromSource(source,args);
      statuses[source]={enabled:true,status:"ok",count:images.length};
      return images;
    }catch(error){
      statuses[source]={enabled:true,status:"error",count:0,reason:error instanceof Error?error.message.slice(0,100):"search_failed"};
      return [];
    }
  }));
  const all=found.flat();
  const seen=new Set<string>();
  return {query:args.query,page:args.page,images:all.filter(img=>{
    if(!img.imageUrl||seen.has(img.imageUrl))return false;
    seen.add(img.imageUrl);return true;
  }),providers:statuses,googleSearchUrl:googleImagesUrl(args.query)};
}
