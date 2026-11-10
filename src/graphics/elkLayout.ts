import ELK from "elkjs";
import {DiagramSchema,composeDiagram,type Diagram} from "./diagrams.ts";
import {SlideDocumentSchema,type SlideDocument,type SlideElement} from "../domain/slide.ts";

type Point={x:number;y:number};
type Edge={id:string;sources:string[];targets:string[];sections?:Array<{
 startPoint:Point;endPoint:Point;bendPoints?:Point[]} >};
type Node={id:string;x?:number;y?:number;width?:number;height?:number};
const directed=new Set(["flow","hierarchy","causal"]);
const round=(n:number)=>Math.round(n);
const px=(n:number)=>round(n)+"px";
const safe=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
function graphEdges(spec:Diagram):Array<{from:string;to:string;label?:string}>{
 if(spec.edges.length)return spec.edges;
 if(spec.kind==="flow")return spec.nodes.slice(0,-1).map((n,i)=>({from:n.id,to:spec.nodes[i+1]!.id}));
 if(spec.kind==="causal")return spec.nodes.filter(n=>n.id!==(spec.focus??spec.nodes.at(-1)!.id))
   .map(n=>({from:n.id,to:spec.focus??spec.nodes.at(-1)!.id}));
 if(spec.kind==="hierarchy")return spec.nodes.slice(1).map((n,i)=>({
   from:spec.nodes[Math.floor(i/3)]!.id,to:n.id,
 }));
 return [];
}
function at(x:Point,scale:number,dx:number,dy:number):Point{
 return {x:round(dx+x.x*scale),y:round(dy+x.y*scale)};
}
const colorByTheme:Record<Diagram["theme"],string>={
 paper:"#2E725E",ink:"#D8C38C",marine:"#F4BA8D",chalk:"#F2CF8D",warm:"#A94D35",
};
/** Calculate proper node positions and routed edges; reuse the existing editable shapes and text. */
export async function composeElkDiagram(raw:Diagram):Promise<SlideDocument>{
 const spec=DiagramSchema.parse(raw);
 if(!directed.has(spec.kind))return composeDiagram(spec);
 const original=composeDiagram(spec);
 const edges=graphEdges(spec);
 // ELK is only a layout engine, never a generator of explanatory facts.
 const nodes=spec.nodes.map(n=>({
   id:n.id,width:n.detail?345:315,height:n.detail?164:145,
 }));
 const elk=new ELK();
 const result=(await elk.layout({
   id:"science",
   layoutOptions:{
     "elk.algorithm":"layered",
     "elk.direction":spec.kind==="hierarchy"?"DOWN":"RIGHT",
     "elk.edgeRouting":"ORTHOGONAL",
     "elk.spacing.nodeNode":"48",
     "elk.layered.spacing.nodeNodeBetweenLayers":"85",
     "elk.layered.crossingMinimization.strategy":"LAYER_SWEEP",
     "elk.layered.nodePlacement.strategy":"BRANDES_KOEPF",
     "elk.padding":"[left=12,top=12,right=12,bottom=12]",
   },
   children:nodes,
   edges:edges.map((e,i)=>({id:"e"+i,sources:[e.from],targets:[e.to]})),
 })) as unknown as {width:number;height:number;children?:Node[];edges?:Edge[]};
 if(!Number.isFinite(result.width)||!Number.isFinite(result.height)||
   !result.width||!result.height||!result.children?.length)
   throw Error("elk_invalid_layout");
 const area={x:111,y:spec.subtitle?443:393,w:1696,h:560};
 const scale=Math.min(area.w/result.width,area.h/result.height,1.5);
 const dx=area.x+(area.w-result.width*scale)/2;
 const dy=area.y+(area.h-result.height*scale)/2;
 const boxes=new Map((result.children as Node[]).map(n=>[n.id,{
   x:round(dx+(n.x??0)*scale),y:round(dy+(n.y??0)*scale),
   w:round((n.width??315)*scale),h:round((n.height??145)*scale),
 }]));
 const originalConnector=original.elements.find(e=>e.id==="diagram-connectors");
 const elements:SlideElement[]=original.elements.filter(e=>e.id!=="diagram-connectors").map(el=>{
   let id="";
   let role:"panel"|"node"|"detail"|null=null;
   for(const roleName of ["panel","node","detail"] as const){
     const prefix="diagram-"+roleName+"-";
     if(el.id.startsWith(prefix)){role=roleName;id=el.id.slice(prefix.length);break;}
   }
   if(!role)return el;
   const box=boxes.get(id);if(!box)return el;
   const pad=Math.min(26,Math.max(12,box.w*.08));
   if(role==="panel")return {...el,styles:{...el.styles,left:px(box.x),top:px(box.y),
     width:px(box.w),height:px(box.h),borderRadius:"3px",boxShadow:"none"}};
   const text=el.text??"";
   const nodeFont=Math.min(role==="node"?36:25,Math.max(role==="node"?19:17,
     (box.w-pad*2)/Math.max(8,Math.min(30,text.length*.45))));
   return {...el,styles:{...el.styles,
     left:px(box.x+pad),top:px(role==="node"?box.y+17:box.y+box.h*.65),
     width:px(box.w-2*pad),
     height:px(role==="node"?(spec.nodes.find(n=>n.id===id)?.detail?box.h*.54:box.h-25):box.h*.30),
     fontSize:px(nodeFont),overflow:"hidden"}};
 });
 const accent=spec.accent??colorByTheme[spec.theme];
 const root=result.edges??[];
 const usedLabels:Array<{x:number;y:number;w:number;h:number}>=[];
 root.forEach((edge,i)=>{
   const pathParts=(edge as Edge).sections??[];
   if(!pathParts.length)return;
   const svgPath=pathParts.map(section=>{
     const all=[section.startPoint,...(section.bendPoints??[]),section.endPoint]
       .map(p=>at(p,scale,dx,dy));
     return "M "+all.map((p,j)=>(j?"L ":"")+p.x+" "+p.y).join(" ");
   }).join(" ");
   elements.push({
     id:"elk-route-"+i,type:"svg",name:"Liaison "+(i+1),
     styles:{position:"absolute",left:"0px",top:"0px",width:"1920px",height:"1080px",
       pointerEvents:"none"},
     text:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">'+
       '<defs><marker id="elk-arrow-'+i+'" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto"><path d="M0 0L8 3L0 6Z" fill="'+accent+'"/></marker></defs>'+
       '<path d="'+safe(svgPath)+'" stroke="'+accent+'" stroke-width="4" fill="none" marker-end="url(#elk-arrow-'+i+')"/></svg>',
   });
   if(edges[i]?.label){
     const label=edges[i]!.label!;
     const width=Math.max(106,Math.min(240,label.length*13+28)),height=42;
     const segments=pathParts.flatMap(section=>{
       const pts=[section.startPoint,...(section.bendPoints??[]),section.endPoint]
         .map(p=>at(p,scale,dx,dy));
       return pts.slice(1).map((to,j)=>({from:pts[j]!,to}));
     }).sort((a,b)=>
       Math.hypot(b.to.x-b.from.x,b.to.y-b.from.y)-
       Math.hypot(a.to.x-a.from.x,a.to.y-a.from.y));
     const intersects=(one:{x:number;y:number;w:number;h:number},
       two:{x:number;y:number;w:number;h:number})=>
       Math.max(0,Math.min(one.x+one.w,two.x+two.w)-Math.max(one.x,two.x))*
       Math.max(0,Math.min(one.y+one.h,two.y+two.h)-Math.max(one.y,two.y));
     const candidates=segments.flatMap((seg,j)=>{
       const center={x:(seg.from.x+seg.to.x)/2,y:(seg.from.y+seg.to.y)/2};
       const horizontal=Math.abs(seg.to.x-seg.from.x)>=Math.abs(seg.to.y-seg.from.y);
       return [0,-54,54].map(shift=>{
         const box={x:Math.round(center.x-width/2+(horizontal?0:shift)),
           y:Math.round(center.y-height/2+(horizontal?shift:0)),w:width,h:height};
         let score=j*25;
         for(const nodeBox of boxes.values())score+=intersects(box,nodeBox)*4;
         for(const other of usedLabels)score+=intersects(box,other)*5;
         if(box.x<110||box.y<area.y-20||box.x+box.w>1810||box.y+box.h>1035)
           score+=10_000;
         return {box,score};
       });
     }).sort((a,b)=>a.score-b.score);
     const chosen=candidates[0]?.box;
     if(chosen){
       usedLabels.push(chosen);
       elements.push({id:"elk-edge-label-"+i,type:"text",text:label,
         name:"Étiquette de relation "+(i+1),styles:{position:"absolute",
           left:px(chosen.x),top:px(chosen.y),width:px(chosen.w),height:px(chosen.h),
           color:accent,fontSize:"22px",fontFamily:"Arial, sans-serif",
           background:"rgba(250,250,248,.96)",textAlign:"center"}});
     }
   }
 });
 if(originalConnector&&!root.length)elements.push(originalConnector);
 original.elements=elements;
 // Reveal each node's editable parts in the same click step.
 original.animations=spec.nodes.flatMap((n,i)=>{
   const ids=["diagram-panel-"+n.id,"diagram-node-"+n.id,
     ...(n.detail?["diagram-detail-"+n.id]:[])];
   const targets=ids.filter(id=>elements.some(el=>el.id===id));
   return targets.map((id,j)=>({
     id:"elk-click-"+i+"-"+j,targetElementId:id,order:i,trigger:"click" as const,
     effect:"fade" as const,durationMs:320,
   }));
 });
 return SlideDocumentSchema.parse(original);
}
