import { z } from "zod";
import { createEmptySlideDocument, SlideDocumentSchema, type SlideDocument, type SlideElement } from "../domain/slide.ts";

const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const nodeSchema=z.object({
  id:z.string().regex(/^[a-zA-Z0-9_-]{1,36}$/),
  label:z.string().trim().min(1).max(110),
  detail:z.string().max(180).optional(),
  emphasis:z.boolean().optional(),
}).strict();
const edgeSchema=z.object({
  from:z.string().regex(/^[a-zA-Z0-9_-]{1,36}$/),
  to:z.string().regex(/^[a-zA-Z0-9_-]{1,36}$/),
  label:z.string().max(80).optional(),
}).strict();
export const DiagramSchema=z.object({
  kind:z.enum(["mindmap","flow","cycle","hierarchy","causal","matrix"]),
  title:z.string().trim().min(1).max(175),
  subtitle:z.string().max(250).optional(),
  nodes:z.array(nodeSchema).min(2).max(16),
  edges:z.array(edgeSchema).max(32).default([]),
  focus:z.string().optional(),
  theme:z.enum(["ink","paper","marine","chalk","warm"]).default("paper"),
  accent:color.optional(),
  notes:z.string().max(30000).optional(),
}).strict().superRefine((s,ctx)=>{
  const ids=new Set(s.nodes.map(n=>n.id));
  if(ids.size!==s.nodes.length)ctx.addIssue({code:"custom",message:"duplicate_diagram_node_id"});
  for(const e of s.edges)if(!ids.has(e.from)||!ids.has(e.to)||e.from===e.to)
    ctx.addIssue({code:"custom",message:"invalid_diagram_edge"});
  if(s.focus&&!ids.has(s.focus))ctx.addIssue({code:"custom",message:"invalid_diagram_focus"});
  const limits:Record<string,number>={mindmap:12,cycle:10,causal:12};
  if(s.nodes.length>(limits[s.kind]??16))
    ctx.addIssue({code:"custom",message:"diagram_too_dense_split_across_slides"});
});
export type Diagram=z.infer<typeof DiagramSchema>;
type Point={x:number;y:number};
type Box={x:number;y:number;w:number;h:number};
const themes={
  ink:{background:"#141F1D",surface:"#263633",text:"#F5F2E8",secondary:"#D4E1D9",line:"#7C9E90",accent:"#D8C38C"},
  paper:{background:"#F7F5EF",surface:"#FFFFFF",text:"#202A25",secondary:"#43564E",line:"#819489",accent:"#2E725E"},
  marine:{background:"#11283A",surface:"#19384B",text:"#F8F7F1",secondary:"#DAE6EB",line:"#6A9AAE",accent:"#F4BA8D"},
  chalk:{background:"#1D3530",surface:"#294C42",text:"#F6F5E8",secondary:"#DAE7D9",line:"#83AD9A",accent:"#F2CF8D"},
  warm:{background:"#F9F1E4",surface:"#FFFFFF",text:"#3D3029",secondary:"#765A48",line:"#BFA28E",accent:"#A94D35"},
} as const;

function round(n:number){return Math.round(n)}
function px(n:number){return round(n)+"px"}
function safe(s:string){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}
function center(b:Box):Point{return{x:b.x+b.w/2,y:b.y+b.h/2}}
function linePath(from:Point,to:Point,kind:Diagram["kind"]):string {
  if(kind==="flow"||kind==="causal"||kind==="hierarchy"){
    const vertical=kind==="hierarchy";
    if(vertical){const mid=(from.y+to.y)/2;return "M "+round(from.x)+" "+round(from.y)+" C "+round(from.x)+" "+round(mid)+" "+round(to.x)+" "+round(mid)+" "+round(to.x)+" "+round(to.y)}
    const mid=(from.x+to.x)/2;
    return "M "+round(from.x)+" "+round(from.y)+" C "+round(mid)+" "+round(from.y)+" "+round(mid)+" "+round(to.y)+" "+round(to.x)+" "+round(to.y);
  }
  return "M "+round(from.x)+" "+round(from.y)+" L "+round(to.x)+" "+round(to.y);
}
function nearBoundary(a:Box,b:Box):[Point,Point]{
  const ca=center(a),cb=center(b),dx=cb.x-ca.x,dy=cb.y-ca.y;
  const reach=(box:Box,dx:number,dy:number)=>{
    const tx=dx===0?Number.POSITIVE_INFINITY:(box.w*.48)/Math.abs(dx);
    const ty=dy===0?Number.POSITIVE_INFINITY:(box.h*.48)/Math.abs(dy);
    const t=Math.min(tx,ty);
    return {x:round(center(box).x+dx*t),y:round(center(box).y+dy*t)};
  };
  return [reach(a,dx,dy),reach(b,-dx,-dy)];
}
export function composeDiagram(raw:Diagram):SlideDocument{
  const spec=DiagramSchema.parse(raw);
  const theme=themes[spec.theme],accent=spec.accent??theme.accent;
  const d=createEmptySlideDocument(),W=d.canvas.width,H=d.canvas.height;
  const boxes=new Map<string,Box>(), els:SlideElement[]=[];
  const add=(id:string,type:SlideElement["type"],styles:SlideElement["styles"],text?:string)=>{
    els.push({id,type,styles:{position:"absolute",...styles},...(text!==undefined?{text}:{})});
  };
  const label=(id:string,value:string,x:number,y:number,w:number,h:number,font:number,color:string,extra:SlideElement["styles"]={})=>{
    add(id,"text",{left:px(x),top:px(y),width:px(w),height:px(h),
      color,fontFamily:"Arial, Helvetica, sans-serif",fontSize:px(font),
      lineHeight:"1.14",whiteSpace:"pre-wrap",overflow:"hidden",...extra},value);
  };
  const bg=(id:string,x:number,y:number,w:number,h:number,color:string,extra:SlideElement["styles"]={})=>
    add(id,"shape",{left:px(x),top:px(y),width:px(w),height:px(h),background:color,...extra});
  bg("diagram-background",0,0,W,H,theme.background);
  bg("diagram-rule",100,101,74,7,accent);
  label("diagram-title",spec.title,100,137,1710,128,spec.title.length>95?63:82,theme.text,{fontWeight:700});
  if(spec.subtitle)label("diagram-subtitle",spec.subtitle,105,280,1670,90,34,theme.secondary);
  const area={left:112,top:spec.subtitle?440:392,width:1696,height:540};
  const n=spec.nodes.length;
  switch(spec.kind){
    case "mindmap":{
      const focus=spec.focus??spec.nodes[0]!.id;
      const centerNode=spec.nodes.find(a=>a.id===focus)!;
      boxes.set(centerNode.id,{x:755,y:557,w:410,h:176});
      const outer=spec.nodes.filter(a=>a.id!==focus);
      outer.forEach((node,i)=>{
        const angle=-Math.PI/2+Math.PI*2*i/outer.length;
        const rX=outer.length>9?665:608,rY=outer.length>9?246:231;
        const w=outer.length>9?248:285,h=outer.length>9?106:130;
        boxes.set(node.id,{x:round(960+Math.cos(angle)*rX-w/2),y:round(640+Math.sin(angle)*rY-h/2),w,h});
      });
      break;
    }
    case "flow":{
      const cols=n<=5?n:Math.min(6,Math.ceil(n/3)),rows=Math.ceil(n/cols);
      const gapX=26,gapY=26,w=(area.width-(cols-1)*gapX)/cols;
      const h=rows===1?250:Math.floor((area.height-(rows-1)*gapY)/rows);
      const firstY=area.top+Math.max(0,(area.height-(rows*h+(rows-1)*gapY))/2);
      spec.nodes.forEach((node,i)=>{const r=Math.floor(i/cols),col=i%cols;
        boxes.set(node.id,{x:round(area.left+col*(w+gapX)),y:round(firstY+r*(h+gapY)),w:round(w),h});
      });
      break;
    }
    case "cycle":{
      const cx=960,cy=676,rX=610,rY=n>8?225:235;
      const w=n>8?255:304,h=n>8?110:135;
      spec.nodes.forEach((node,i)=>{const angle=-Math.PI/2+i*2*Math.PI/n;
        boxes.set(node.id,{x:round(cx+rX*Math.cos(angle)-w/2),y:round(cy+rY*Math.sin(angle)-h/2),w,h});
      });
      break;
    }
    case "hierarchy":{
      // Without explicit links, build a 3-branch hierarchy instead of crowding every node into one row.
      const links=spec.edges.length?spec.edges:spec.nodes.slice(1).map((node,i)=>({
        from:spec.nodes[Math.floor(i/3)]!.id,to:node.id
      }));
      const incoming=new Map(spec.nodes.map(node=>[node.id,0]));
      for(const e of links)incoming.set(e.to,(incoming.get(e.to)??0)+1);
      const roots=spec.nodes.filter(s=>(incoming.get(s.id)??0)===0);
      const levels=new Map<string,number>();
      const queue=(roots.length?roots:[spec.nodes[0]!]).map(n=>n.id);
      queue.forEach(id=>levels.set(id,0));
      while(queue.length){const id=queue.shift()!,level=levels.get(id)!;
        for(const edge of links.filter(e=>e.from===id)){
          if(levels.has(edge.to))continue;
          levels.set(edge.to,Math.min(3,level+1));queue.push(edge.to);
        }
      }
      spec.nodes.forEach((node,i)=>{if(!levels.has(node.id))levels.set(node.id,spec.edges.length?2:i===0?0:1)});
      const groups=[0,1,2,3].map(level=>spec.nodes.filter(node=>levels.get(node.id)===level));
      groups.forEach((group,level)=>group.forEach((node,j)=>{
        const w=Math.min(335,(area.width-24*Math.max(0,group.length-1))/group.length);
        const step=area.width/group.length;
        boxes.set(node.id,{x:round(area.left+j*step+(step-w)/2),y:round(410+level*156),w:round(w),h:122});
      }));
      break;
    }
    case "causal":{
      const focus=spec.focus??spec.nodes[n-1]!.id;
      const sources=spec.nodes.filter(a=>a.id!==focus);
      const cols=sources.length>6?2:1,rows=Math.ceil(sources.length/cols);
      const h=Math.min(168,Math.floor((515-(rows-1)*15)/rows));
      sources.forEach((node,i)=>{const col=Math.floor(i/rows),row=i%rows;
        boxes.set(node.id,{x:130+col*375,y:round(430+row*(h+15)),w:330,h:round(h)});
      });
      boxes.set(focus,{x:1232,y:552,w:490,h:210});
      break;
    }
    case "matrix":{
      const cols=n<=4?n:n<=9?3:4,rows=Math.ceil(n/cols);
      const gap=24,w=(area.width-(cols-1)*gap)/cols;
      const h=Math.min(240,(610-(rows-1)*gap)/rows);
      spec.nodes.forEach((node,i)=>{const row=Math.floor(i/cols),col=i%cols;
        boxes.set(node.id,{x:round(area.left+col*(w+gap)),y:round(423+row*(h+gap)),w:round(w),h:round(h)});
      });
      break;
    }
  }
  const generated=spec.edges.length?spec.edges:spec.kind==="cycle"
    ?spec.nodes.map((node,i)=>({from:node.id,to:spec.nodes[(i+1)%n]!.id}))
    :spec.kind==="mindmap"
      ?spec.nodes.filter(node=>node.id!==(spec.focus??spec.nodes[0]!.id))
        .map(node=>({from:spec.focus??spec.nodes[0]!.id,to:node.id}))
      :spec.kind==="causal"
        ?spec.nodes.filter(node=>node.id!==(spec.focus??spec.nodes[n-1]!.id))
          .map(node=>({from:node.id,to:spec.focus??spec.nodes[n-1]!.id}))
        :spec.kind==="hierarchy"
          ?spec.nodes.slice(1).map((node,i)=>({from:spec.nodes[Math.floor(i/3)]!.id,to:node.id}))
        :spec.kind==="flow"
          ?spec.nodes.slice(0,-1).map((node,i)=>({from:node.id,to:spec.nodes[i+1]!.id}))
          :[];
  const paths=generated.map(e=>{
    const a=boxes.get(e.from),b=boxes.get(e.to);
    if(!a||!b)return "";
    const [first,last]=nearBoundary(a,b);
    const d=linePath(first,last,spec.kind);
    return '<path d="'+safe(d)+'" fill="none" stroke="'+accent+'" stroke-width="4" stroke-linecap="round"'+
      (spec.kind==="flow"||spec.kind==="causal"||spec.kind==="hierarchy"?' marker-end="url(#arrow)"':"")+'/>';
  }).join("");
  if(paths)add("diagram-connectors","svg",{left:"0px",top:"0px",width:px(W),height:px(H),pointerEvents:"none"},
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">'+
    '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">'+
    '<path d="M0 0 L8 3 L0 6 Z" fill="'+accent+'"/></marker></defs>'+paths+'</svg>');
  spec.nodes.forEach((node,index)=>{
    const b=boxes.get(node.id)!;
    const emph=node.emphasis||node.id===spec.focus||(spec.kind==="mindmap"&&index===0);
    bg("diagram-panel-"+node.id,b.x,b.y,b.w,b.h,emph?accent:theme.surface,
      {borderRadius:spec.kind==="mindmap"?"18px":"8px",
        boxShadow:"0 8px 25px rgba(0,0,0,.11)",border:emph?"none":"1px solid "+theme.line});
    const fg=emph?(spec.theme==="warm"||spec.theme==="paper"?"#FFFFFF":"#192620"):theme.text;
    const pad=b.w<300?15:25;
    label("diagram-node-"+node.id,node.label,b.x+pad,b.y+20,b.w-pad*2,node.detail?b.h*.52:b.h-35,
      node.label.length>70||b.w<270?25:node.label.length>43?30:36,fg,{fontWeight:700});
    if(node.detail)label("diagram-detail-"+node.id,node.detail,b.x+pad,b.y+b.h*.60,b.w-pad*2,b.h*.33,
      b.w<300?20:24,emph?fg:theme.secondary);
  });
  d.elements=els;
  return SlideDocumentSchema.parse(d);
}
