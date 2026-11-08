/** Unsplash requires a download-endpoint call when an API photo is selected.
 * Only the published Unsplash API hostname and /photos/:id/download path are allowed.
 * This is never a generic URL fetcher.
 */
export async function trackUnsplashDownload(value:string):Promise<{tracked:boolean;reason?:string}> {
  const key=process.env.UNSPLASH_ACCESS_KEY;
  if(!key)return {tracked:false,reason:"unsplash_not_configured"};
  let url:URL;
  try{url=new URL(value);}catch{return {tracked:false,reason:"invalid_download_url"};}
  if(url.protocol!=="https:"||url.hostname!=="api.unsplash.com"||
    !/^\/photos\/[a-zA-Z0-9_-]+\/download\/?$/.test(url.pathname))
    return {tracked:false,reason:"invalid_download_url"};
  try{
    const response=await fetch(url,{headers:{Authorization:"Client-ID "+key},signal:AbortSignal.timeout(5500),redirect:"manual"});
    return {tracked:response.ok||response.status===302||response.status===301,
      ...(!response.ok&&response.status!==301&&response.status!==302?{reason:"upstream_"+response.status}:{})};
  }catch{return {tracked:false,reason:"tracking_unavailable"};}
}
