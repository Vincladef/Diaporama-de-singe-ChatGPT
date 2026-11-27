import {useEffect,useMemo,useRef,useState} from "react";
import type {SlideDocument} from "../domain/slide.ts";

type Props={
  slide:{id:string;document:SlideDocument}; onReady?:()=>void;
  onBusyChange?:(busy:boolean)=>void; title?:string;
};

/** The imported page owns its DOM and runs with a unique, opaque origin.
 * Do NOT add allow-same-origin or access frame.contentDocument here.
 * Navigation is a narrow postMessage bridge; the page cannot access Neon or the editor.
 */
const BRIDGE=`<script>
(function(){
"use strict";
window.addEventListener("message",function(event){
  if(event.source!==window.parent||!event.data||event.data.type!=="singe-web-command")return;
  var action=event.data.action;
  if(action!=="next"&&action!=="previous")return;
  try {
    if(window.Reveal && typeof window.Reveal[action]==="function"){
      window.Reveal[action]();return;
    }
  }catch(e){}
  var key=action==="next"?"ArrowRight":"ArrowLeft";
  document.dispatchEvent(new KeyboardEvent("keydown",{key:key,code:key,bubbles:true,cancelable:true}));
});
})();
</script>`;

function bridgeHtml(html:string):string{
  return /<\/body\s*>/i.test(html)
    ? html.replace(/<\/body\s*>/i,BRIDGE+"</body>")
    : html+BRIDGE;
}

export function WebProjectionStage({slide,onReady,onBusyChange,title}:Props){
  const host=useRef<HTMLDivElement>(null);
  const frame=useRef<HTMLIFrameElement>(null);
  const [size,setSize]=useState({width:800,height:450});
  const html=useMemo(()=>bridgeHtml(slide.document.webPage?.html??""),[slide.document]);
  const {width,height}=slide.document.canvas;
  const scale=Math.max(.02,Math.min(size.width/width,size.height/height));
  useEffect(()=>{
    const target=host.current;if(!target)return;
    const update=()=>setSize({width:target.clientWidth,height:target.clientHeight});
    update();const observer=new ResizeObserver(update);observer.observe(target);
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    const command=(event:Event)=>{
      const action=(event as CustomEvent<string>).detail;
      if(action==="next"||action==="previous"){
        frame.current?.contentWindow?.postMessage({type:"singe-web-command",action},"*");
      }
    };
    window.addEventListener("singe-web-command",command);
    return()=>window.removeEventListener("singe-web-command",command);
  },[]);
  return <div ref={host} className="projection-stage" data-testid="web-projection-stage"
    aria-label={title??"Présentation HTML interactive"}>
    <div className="projection-artboard" style={{
      width:width*scale,height:height*scale,position:"absolute",left:"50%",top:"50%",
      transform:"translate(-50%,-50%)",overflow:"hidden",background:"#fff",
    }}>
      <iframe ref={frame} title={title??"Présentation HTML"}
        srcDoc={html} sandbox="allow-scripts" referrerPolicy="no-referrer"
        onLoad={()=>{onBusyChange?.(false);onReady?.();}}
        style={{display:"block",width,height,position:"absolute",inset:0,border:0,
          transform:"scale("+scale+")",transformOrigin:"top left",pointerEvents:"auto",background:"#fff"}}
      />
    </div>
  </div>;
}
