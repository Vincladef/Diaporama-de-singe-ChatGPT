import type {SlideDocument,SlideElement} from "../domain/slide.ts";
import {worldBox} from "../editor/geometry.ts";

type Point={x:number;y:number};
type Area={x:number;y:number;w:number;h:number};
function anchors(a:Area,b:Area):[Point,Point]{
  const cx=a.x+a.w/2,cy=a.y+a.h/2,dx=b.x+b.w/2-cx,dy=b.y+b.h/2-cy;
  if(Math.abs(dx)>=Math.abs(dy))
    return [{x:a.x+(dx>=0?a.w:0),y:cy},
      {x:b.x+(dx>=0?0:b.w),y:b.y+b.h/2}];
  return [{x:cx,y:a.y+(dy>=0?a.h:0)},
    {x:b.x+b.w/2,y:b.y+(dy>=0?0:b.h)}];
}
const n=(v:number)=>Math.round(v*10)/10;
/** Make an individually editable SVG connector that follows linked objects. */
export function connectorGeometry(doc:SlideDocument,connector:SlideElement):SlideElement{
  if(!connector.linkFrom||!connector.linkTo)return connector;
  const from=doc.elements.find(e=>e.id===connector.linkFrom&&!e.hidden);
  const to=doc.elements.find(e=>e.id===connector.linkTo&&!e.hidden);
  if(!from||!to||from.id===to.id)return connector;
  const [p,q]=anchors(worldBox(from,doc),worldBox(to,doc));
  const x=Math.min(p.x,q.x)-22,y=Math.min(p.y,q.y)-22;
  const w=Math.max(44,Math.abs(q.x-p.x)+44),h=Math.max(44,Math.abs(q.y-p.y)+44);
  const x1=n(p.x-x),y1=n(p.y-y),x2=n(q.x-x),y2=n(q.y-y);
  const angle=Math.atan2(y2-y1,x2-x1),size=16;
  const backX=x2-Math.cos(angle)*size,backY=y2-Math.sin(angle)*size;
  const ox=Math.sin(angle)*size*.5,oy=Math.cos(angle)*size*.5;
  const points=[x2+","+y2,n(backX+ox)+","+n(backY-oy),n(backX-ox)+","+n(backY+oy)].join(" ");
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 '+
    n(w)+' '+n(h)+'"><path d="M '+x1+' '+y1+' L '+x2+' '+y2+
    '" stroke="#CE9B62" stroke-width="5" stroke-linecap="round" fill="none"/>'+
    '<polygon points="'+points+'" fill="#CE9B62"/></svg>';
  return {...connector,text:svg,styles:{...connector.styles,left:n(x)+"px",top:n(y)+"px",
    width:n(w)+"px",height:n(h)+"px"}};
}
export function refreshSmartConnectors(doc:SlideDocument):SlideDocument{
  if(!doc.elements.some(e=>e.linkFrom&&e.linkTo))return doc;
  return {...doc,elements:doc.elements.map(el=>el.linkFrom&&el.linkTo?connectorGeometry(doc,el):el)};
}
export function makeSmartConnector(doc:SlideDocument,fromId:string,toId:string,id:string):SlideElement{
  if(fromId===toId||!doc.elements.some(e=>e.id===fromId)||!doc.elements.some(e=>e.id===toId))
    throw new Error("Sélectionnez deux objets différents à relier.");
  const source=doc.elements.find(e=>e.id===fromId)!;
  const target=doc.elements.find(e=>e.id===toId)!;
  return connectorGeometry(doc,{
    id,type:"svg",linkFrom:fromId,linkTo:toId,
    name:"Flèche · "+(source.name??source.type)+" → "+(target.name??target.type),
    text:"",styles:{},
  });
}
