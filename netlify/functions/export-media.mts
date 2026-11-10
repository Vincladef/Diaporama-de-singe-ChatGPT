/**
 * Same-origin relay for PPTX media when third-party image hosts reject CORS.
 * Public GET is restricted to established image CDNs; no arbitrary URL fetch.
 */
const allowedHosts = new Set([
  "images.unsplash.com",
  "commons.wikimedia.org",
  "upload.wikimedia.org",
  "images.pexels.com",
  "images.pixabay.com",
  "cdn.pixabay.com",
  "live.staticflickr.com",
  "www.berry.edu",
]);
const responseHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "public, max-age=3600",
};
function checkedUrl(candidate:string):URL {
  const parsed=new URL(candidate);
  if(parsed.protocol!=="https:"||!allowedHosts.has(parsed.hostname.toLowerCase())||
    (parsed.port&&parsed.port!=="443")||parsed.username||parsed.password)
    throw new Error("image_host_not_allowed");
  return parsed;
}
async function retrieveImage(initial:URL):Promise<Response> {
  let current=initial;
  for(let hop=0;hop<5;hop++) {
    const response=await fetch(current, {
      redirect:"manual", signal:AbortSignal.timeout(18000),
      headers:{"Accept":"image/avif,image/webp,image/jpeg,image/png,image/gif,*/*;q=0.6"},
    });
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get("location");
      if(!location)throw new Error("redirect_without_location");
      current=checkedUrl(new URL(location,current).href);
      continue;
    }
    return response;
  }
  throw new Error("too_many_redirects");
}
export default async function exportMedia(request:Request):Promise<Response> {
  if(request.method!=="GET")return Response.json({error:"method_not_allowed"},{status:405,headers:responseHeaders});
  const raw=new URL(request.url).searchParams.get("url")??"";
  if(raw.length>2500)return Response.json({error:"url_too_long"},{status:400,headers:responseHeaders});
  let url:URL;
  try{url=checkedUrl(raw);}catch{
    return Response.json({error:"unsupported_image_host"},{status:403,headers:responseHeaders});
  }
  try{
    const source=await retrieveImage(url);
    if(!source.ok)return Response.json({error:"image_source_unavailable",status:source.status},{status:502,headers:responseHeaders});
    const mime=(source.headers.get("content-type")??"").split(";")[0]!.trim().toLowerCase();
    if(!["image/jpeg","image/png","image/webp","image/gif"].includes(mime))
      return Response.json({error:"unsupported_media_type"},{status:415,headers:responseHeaders});
    if(Number(source.headers.get("content-length")??0)>18_000_000)
      return Response.json({error:"image_too_large"},{status:413,headers:responseHeaders});
    const buffer=await source.arrayBuffer();
    if(buffer.byteLength>18_000_000)
      return Response.json({error:"image_too_large"},{status:413,headers:responseHeaders});
    return new Response(buffer,{status:200,headers:{...responseHeaders,"Content-Type":mime}});
  }catch(error){
    console.error("Export media relay unavailable",error instanceof Error?error.message:"unknown");
    return Response.json({error:"image_relay_unavailable"},{status:502,headers:{...responseHeaders,"Cache-Control":"no-store"}});
  }
}
export const config={rateLimit:{windowSize:60,windowLimit:50,aggregateBy:"ip" as const}};
