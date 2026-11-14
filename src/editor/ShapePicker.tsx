import type {CSSProperties} from "react";
import type {SlideElement} from "../domain/slide";
export type ShapePreset={id:string;name:string;clipPath?:string;radius?:string;width?:number;height?:number};
export const SHAPES:ShapePreset[]=[
 {id:"rectangle",name:"Rectangle"},
 {id:"rounded",name:"Arrondi",radius:"28px"},
 {id:"circle",name:"Cercle",radius:"50%",width:260,height:260},
 {id:"ellipse",name:"Ellipse",radius:"50%",width:420,height:240},
 {id:"pill",name:"Capsule",radius:"999px",width:480,height:180},
 {id:"triangle",name:"Triangle",clipPath:"polygon(50% 0%,0% 100%,100% 100%)"},
 {id:"diamond",name:"Losange",clipPath:"polygon(50% 0%,100% 50%,50% 100%,0% 50%)"},
 {id:"hexagon",name:"Hexagone",clipPath:"polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%)"},
 {id:"pentagon",name:"Pentagone",clipPath:"polygon(50% 0%,100% 38%,82% 100%,18% 100%,0% 38%)"},
 {id:"star",name:"Étoile",clipPath:"polygon(50% 0%,62% 35%,98% 35%,69% 57%,79% 92%,50% 71%,21% 92%,31% 57%,2% 35%,38% 35%)"},
 {id:"arrow",name:"Flèche",clipPath:"polygon(0% 25%,65% 25%,65% 0%,100% 50%,65% 100%,65% 75%,0% 75%)"},
 {id:"chevron",name:"Chevron",clipPath:"polygon(0% 0%,65% 0%,100% 50%,65% 100%,0% 100%,35% 50%)"},
 {id:"parallelogram",name:"Parallélogramme",clipPath:"polygon(25% 0%,100% 0%,75% 100%,0% 100%)"},
 {id:"cross",name:"Croix",clipPath:"polygon(35% 0%,65% 0%,65% 35%,100% 35%,100% 65%,65% 65%,65% 100%,35% 100%,35% 65%,0% 65%,0% 35%,35% 35%)"},
 {id:"speech",name:"Bulle",clipPath:"polygon(0% 0%,100% 0%,100% 75%,60% 75%,45% 100%,45% 75%,0% 75%)"},
 {id:"line",name:"Trait",width:520,height:12,radius:"999px"},
];
export function shapeStyles(preset:ShapePreset,color="#a4bdac"):SlideElement["styles"]{
 return {left:"200px",top:"260px",width:(preset.width??520)+"px",height:(preset.height??260)+"px",
   backgroundColor:color,borderRadius:preset.radius??"0px",...(preset.clipPath?{clipPath:preset.clipPath}:{})};
}
export function ShapePicker({onPick,label="+ Forme"}:{onPick:(preset:ShapePreset)=>void;label?:string}){
 return <details className="shape-picker">
  <summary>{label} <span aria-hidden="true">▾</span></summary>
  <div className="shape-picker-menu" role="group" aria-label="Formes disponibles">
   {SHAPES.map(preset=><button type="button" key={preset.id} title={preset.name}
     onClick={event=>{onPick(preset);event.currentTarget.closest("details")?.removeAttribute("open");}}>
      <span className="shape-preview" style={{
       background:"#49785f",borderRadius:preset.radius??"0",
       clipPath:preset.clipPath??"none",
       ...(preset.id==="line"?{height:"5px"}:{}),
      } as CSSProperties}/><small>{preset.name}</small>
   </button>)}
  </div>
 </details>;
}
