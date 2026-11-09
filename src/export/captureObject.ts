import { toPng } from "html-to-image";
import type { SlideDocument,SlideElement } from "../domain/slide.ts";
import { renderSlideHtml } from "../engine/render.ts";

/**
 * Rasterize a *single* incompatible structured object on transparent pixels.
 * All of its siblings remain native PowerPoint text, images or shapes.
 * Only root objects without child objects are eligible for this fallback.
 */
export async function captureObject(document:SlideDocument,element:SlideElement):Promise<string>{
  if(element.parentId||element.type==="group"||
    document.elements.some(child=>child.parentId===element.id))
    throw new Error("Un groupe imbriqué doit être exporté comme composition entière.");
  const {width,height}=document.canvas;
  const frame=window.document.createElement("iframe");
  frame.sandbox.add("allow-same-origin");
  frame.referrerPolicy="no-referrer";
  frame.title="Capture isolée d'un élément";
  frame.setAttribute("aria-hidden","true");
  Object.assign(frame.style,{position:"fixed",left:"-20000px",top:"0",
    width:width+"px",height:height+"px",border:"0",pointerEvents:"none"});
  try{
    const ready=new Promise<void>((resolve,reject)=>{
      const timeout=window.setTimeout(()=>reject(new Error("Délai de capture dépassé.")),14000);
      frame.addEventListener("load",()=>{clearTimeout(timeout);resolve();},{once:true});
      frame.addEventListener("error",()=>{clearTimeout(timeout);reject(new Error("Capture d'objet impossible."));},{once:true});
    });
    frame.srcdoc=renderSlideHtml({
      ...document,mode:"structured",freeform:undefined,elements:[element],animations:[],
    });
    window.document.body.appendChild(frame);
    await ready;
    const inner=frame.contentDocument;
    if(!inner)throw new Error("Accès au rendu impossible.");
    await Promise.race([inner.fonts.ready,
      new Promise<void>(resolve=>window.setTimeout(resolve,3500))]);
    const node=inner.querySelector<HTMLElement>("[data-id]");
    if(!node)throw new Error("Objet introuvable pour la capture.");
    if(node instanceof HTMLImageElement && !node.complete){
      await Promise.race([
        new Promise<void>(resolve=>{
          node.addEventListener("load",()=>resolve(),{once:true});
          node.addEventListener("error",()=>resolve(),{once:true});
        }),
        new Promise<void>(resolve=>window.setTimeout(resolve,5000)),
      ]);
    }
    if(node instanceof HTMLImageElement && !node.naturalWidth)
      throw new Error("Cette photographie n'est pas accessible pour l'export.");
    const rect=node.getBoundingClientRect();
    const w=Math.max(1,Math.ceil(rect.width)),h=Math.max(1,Math.ceil(rect.height));
    return await toPng(node,{width:w,height:h,pixelRatio:1,
      cacheBust:false,backgroundColor:"transparent"});
  }finally{frame.remove();}
}
