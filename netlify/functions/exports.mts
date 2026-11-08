import { getDeck } from "../../src/mcp/store";
import { ORIGIN, safeEqual, sign } from "../../src/mcp/security";
import { renderSlideHtml } from "../../src/engine/render";
import type { SlideDocument } from "../../src/domain/slide";

const esc = (s:string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
function viewer(title:string, slides:{document:SlideDocument;notes:string}[]):string {
  const frames=slides.map((s,i)=>{
    const html=renderSlideHtml(s.document);
    return '<section class="page'+(i===0?' selected':'')+'" aria-label="Diapositive '+(i+1)+'"><iframe sandbox="" referrerpolicy="no-referrer" title="Diapositive '+(i+1)+'" srcdoc="'+esc(html)+'" data-w="'+s.document.canvas.width+'" data-h="'+s.document.canvas.height+'"></iframe></section>';
  }).join("");
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>'+esc(title)+'</title><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:#141c19;color:#fff;font:15px system-ui;overflow:hidden}' +
    '.page{display:none;position:absolute;inset:0 0 50px}.page.selected{display:block}.page iframe{border:0;position:absolute;top:50%;left:50%;transform-origin:top left;background:#fff}' +
    '.controls{position:fixed;bottom:0;height:50px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:24px;background:#202c26}' +
    'button{background:#395d45;color:white;border:0;border-radius:5px;padding:7px 19px;cursor:pointer}small{color:#a9c0b2}</style></head><body>' +
    frames+'<nav class="controls"><button id="prev" aria-label="Précédent">←</button><small id="counter">1 / '+slides.length+'</small><button id="next" aria-label="Suivant">→</button></nav>'+
    '<script>const pages=[...document.querySelectorAll(".page")];let active=0;function draw(){pages.forEach((p,i)=>{p.classList.toggle("selected",i===active);'+
    'const f=p.querySelector("iframe");const w=+f.dataset.w,h=+f.dataset.h,scale=Math.min(innerWidth/w,(innerHeight-50)/h);f.style.width=w+"px";f.style.height=h+"px";'+
    'f.style.transform="translate(-50%,-50%) scale("+scale+")";f.style.left=(innerWidth-w*scale)/2+"px";f.style.top=(innerHeight-50-h*scale)/2+"px";'+
    'f.style.transformOrigin="top left";f.style.transform="scale("+scale+")";});document.getElementById("counter").textContent=(active+1)+" / "+pages.length}' +
    'document.getElementById("prev").onclick=()=>{active=Math.max(0,active-1);draw()};document.getElementById("next").onclick=()=>{active=Math.min(pages.length-1,active+1);draw()};'+
    'onkeydown=e=>{if(e.key==="ArrowRight"||e.key===" "){active=Math.min(pages.length-1,active+1);draw()}if(e.key==="ArrowLeft"){active=Math.max(0,active-1);draw()}};onresize=draw;draw();</script></body></html>';
}
export default async function handler(request:Request):Promise<Response> {
  if(request.method!=="GET")return new Response(null,{status:405});
  const url=new URL(request.url);
  const format=url.pathname.endsWith("/html")?"html":url.pathname.endsWith("/json")?"json":null;
  const ticket=url.searchParams.get("ticket")??"";
  const pieces=ticket.split(".");
  if(!format||pieces.length!==2)return Response.json({error:"invalid_ticket"},{status:403});
  let payload="";
  try{payload=Buffer.from(pieces[0]!,"base64url").toString("utf8");}catch{return Response.json({error:"invalid_ticket"},{status:403})}
  const [id,issuedFormat,expires]=payload.split(":");
  if(!id||issuedFormat!==format||!expires||!Number.isFinite(Number(expires))||
    Date.now()>Number(expires)||Number(expires)-Date.now()>610000||
    !safeEqual(sign(payload),pieces[1]??""))
    return Response.json({error:"invalid_or_expired_ticket"},{status:403});
  try {
    const deck=await getDeck(id,"full",0,100);
    if(deck.nextOffset!==null)return Response.json({error:"export_limit_100_slides"},{status:413});
    const name=(String(deck.presentation.title??"presentation").replace(/[^a-z0-9_-]/gi,"_").slice(0,75)||"presentation");
    const text=format==="json"
      ?JSON.stringify({presentation:deck.presentation,slides:deck.slides},null,2)
      :viewer(String(deck.presentation.title),deck.slides as {document:SlideDocument;notes:string}[]);
    return new Response(text,{headers:{
      "Content-Type":format==="json"?"application/json; charset=utf-8":"text/html; charset=utf-8",
      "Content-Disposition":'attachment; filename="'+name+"."+format+'"',
      "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
      "Access-Control-Allow-Origin":ORIGIN
    }});
  } catch(e) {
    console.error("Signed export failed",e instanceof Error?e.message:String(e));
    return Response.json({error:"export_failed"},{status:500,headers:{"Cache-Control":"no-store"}});
  }
}
export const config={path:["/exports/html","/exports/json"],rateLimit:{windowSize:60,windowLimit:40,aggregateBy:"ip" as const}};
