import { randomUUID } from "node:crypto";
import { getSlide } from "../../src/mcp/store";
import { ORIGIN, safeEqual, sign } from "../../src/mcp/security";
import { renderSlideHtml } from "../../src/engine/render";

const escapeHtml=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/'/g,"&#39;");

/** Time-limited, read-only preview intended for the AI's browser/screenshot tool. */
export default async function handler(request:Request):Promise<Response>{
  if(request.method!=="GET")return new Response(null,{status:405,headers:{Allow:"GET"}});
  const token=new URL(request.url).searchParams.get("ticket")??"";
  const parts=token.split(".");
  if(parts.length!==2)return Response.json({error:"invalid_ticket"},{status:403});
  let payload="";
  try{payload=Buffer.from(parts[0]!,"base64url").toString("utf8");}
  catch{return Response.json({error:"invalid_ticket"},{status:403});}
  const [id,kind,expires]=payload.split(":");
  const now=Date.now();
  if(!id||kind!=="preview"||!expires||!Number.isFinite(Number(expires))||
    now>Number(expires)||Number(expires)-now>610000||
    !safeEqual(sign(payload),parts[1]??""))
    return Response.json({error:"invalid_or_expired_ticket"},{status:403});
  try{
    const slide=await getSlide(id,"full");
    if(!("document" in slide))return Response.json({error:"not_found"},{status:404});
    const width=slide.document.canvas.width,height=slide.document.canvas.height;
    const doc=renderSlideHtml(slide.document);
    const nonce=randomUUID().replace(/-/g,"");
    const body='<!doctype html><html lang="fr"><head><meta charset="utf-8">'+
      '<meta name="viewport" content="width=device-width, initial-scale=1">'+
      '<title>Aperçu de diapositive</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#17201b}'+
      '#slide{position:absolute;border:0;background:white;transform-origin:top left}</style></head><body>'+
      '<iframe id="slide" title="Aperçu" referrerpolicy="no-referrer" sandbox=""'+
      ' width="'+width+'" height="'+height+'" srcdoc="'+escapeHtml(doc)+'"></iframe>'+
      '<script nonce="'+nonce+'">const f=document.getElementById("slide"),w='+width+',h='+height+';'+
      'function fit(){const s=Math.min(innerWidth/w,innerHeight/h);f.style.width=w+"px";f.style.height=h+"px";'+
      'f.style.transform="scale("+s+")";f.style.left=(innerWidth-w*s)/2+"px";f.style.top=(innerHeight-h*s)/2+"px"}'+
      'addEventListener("resize",fit);fit();</script></body></html>';
    return new Response(body,{headers:{
      "Content-Type":"text/html; charset=utf-8",
      "Content-Security-Policy":"default-src 'none'; frame-src 'self' about:; style-src 'unsafe-inline'; script-src 'nonce-"+nonce+"'; base-uri 'none'; form-action 'none'; object-src 'none'",
      "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
      "Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow",
      "Access-Control-Allow-Origin":ORIGIN
    }});
  }catch(e){
    console.error("Preview failed",e instanceof Error?e.message:String(e));
    return Response.json({error:"preview_unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
export const config={path:"/previews/slide",rateLimit:{windowSize:60,windowLimit:50,aggregateBy:"ip" as const}};
