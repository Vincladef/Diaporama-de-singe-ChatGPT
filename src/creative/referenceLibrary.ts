import type {ReferenceSlideLayout,RelativeFrame} from "./referenceGeometry.ts";

export const VISUAL_KINDS = [
  "photographique","documentaire","graphique","schématique",
  "comparatif","typographique","mixte"
] as const;
export type VisualKind = typeof VISUAL_KINDS[number];

export interface VisualLayout {
  slideNumber:number;
  title:string;
  kind:VisualKind;
  imageCount:number;
  textCount:number;
  diagramCount:number;
  imageCoverage:number;
  density:number;
  imageFrames:RelativeFrame[];
  textFrames:RelativeFrame[];
  diagramFrames:RelativeFrame[];
  geometrySignature:number[];
  composition:string;
}

const round=(x:number)=>Math.round(x*100)/100;
const frames=(slide:ReferenceSlideLayout,kind:"image"|"text"|"diagram")=>
  slide.items.filter(item=>item.kind===kind&&item.frame).map(item=>item.frame!);
const coverage=(f:RelativeFrame)=>Math.max(0,Math.min(100,f.width))*Math.max(0,Math.min(100,f.height))/10000;

export function classifyReferenceSlide(slide:ReferenceSlideLayout):VisualLayout{
  const imageFrames=frames(slide,"image"),textFrames=frames(slide,"text"),diagramFrames=frames(slide,"diagram");
  const imageCoverage=Math.min(1,imageFrames.reduce((sum,f)=>sum+coverage(f),0));
  const connectionCount=slide.items.filter(item=>item.kind==="connector").length;
  const density=round(Math.min(1,(slide.textCount+slide.imageCount+slide.diagramCount)/12));
  const largePhoto=imageFrames.some(frame=>coverage(frame)>=.28);
  const columns=slide.items.filter(item=>item.kind==="text"&&item.frame)
    .map(item=>item.frame!.x).filter(x=>x>=0&&x<=95);
  const spread=columns.length>1&&Math.max(...columns)-Math.min(...columns)>25;
  let kind:VisualKind="mixte";
  if(slide.diagramCount>=1) kind="graphique";
  else if(connectionCount>=2)kind="schématique";
  else if(largePhoto && slide.textCount<=4) kind="photographique";
  else if(slide.imageCount>=2)kind="documentaire";
  else if(slide.textCount>=4&&spread)kind="comparatif";
  else if(slide.imageCount===0&&slide.diagramCount===0&&slide.textCount<=3)kind="typographique";
  const largestImage=[...imageFrames].sort((a,b)=>coverage(b)-coverage(a))[0];
  const signature=[
    Math.min(slide.imageCount,8)/8,Math.min(slide.textCount,12)/12,
    Math.min(slide.diagramCount+connectionCount,8)/8,imageCoverage,density,
    largestImage?largestImage.x/100:0,largestImage?largestImage.y/100:0,
    largestImage?largestImage.width/100:0,largestImage?largestImage.height/100:0,
    textFrames.length?textFrames.reduce((s,f)=>s+f.x,0)/textFrames.length/100:0,
    textFrames.length?textFrames.reduce((s,f)=>s+f.y,0)/textFrames.length/100:0,
  ].map(round);
  const composition=[
    largePhoto?"photographie dominante":slide.imageCount?"images intégrées":"sans photographie",
    slide.diagramCount?"diagramme":"",connectionCount>=2?"relations fléchées":"",
    spread?"répartition horizontale":"",imageCoverage>=.45?"grand visuel":""
  ].filter(Boolean).join(" ; ");
  return {
    slideNumber:slide.index,title:slide.title??"",kind,
    imageCount:slide.imageCount,textCount:slide.textCount,diagramCount:slide.diagramCount,
    imageCoverage:round(imageCoverage),density,imageFrames,textFrames,diagramFrames,
    geometrySignature:signature,composition
  };
}
export interface ReferencePageInfo {
  referenceId:string;slideNumber:number;visualKind:VisualKind;
  selected:boolean;layout:VisualLayout;renderWarning:string;
}
export function rankReferencePages(
  candidates:ReferencePageInfo[],
  input:{kind?:VisualKind;geometrySignature?:number[];imageDominant?:boolean;limit?:number}
):Array<ReferencePageInfo&{score:number}>{
  return candidates.filter(page=>page.selected).map(page=>{
    let score=0;
    if(input.kind)score+=page.visualKind===input.kind?50:page.visualKind==="mixte"?10:0;
    if(input.imageDominant!==undefined){
      const isDominant=page.layout.imageCoverage>=.28;
      score+=isDominant===input.imageDominant?15:0;
    }
    if(input.geometrySignature?.length){
      let difference=0,compared=0;
      for(let i=0;i<Math.min(page.layout.geometrySignature.length,input.geometrySignature.length);i++){
        const a=page.layout.geometrySignature[i],b=input.geometrySignature[i];
        if(Number.isFinite(a)&&Number.isFinite(b)){difference+=Math.abs(a-b);compared++;}
      }
      score+=compared?Math.max(0,35-(difference/compared*100)):0;
    }else score+=page.layout.imageCoverage*8;
    return {...page,score:round(score)};
  }).sort((a,b)=>b.score-a.score || a.referenceId.localeCompare(b.referenceId) || a.slideNumber-b.slideNumber)
    .slice(0,Math.max(1,Math.min(30,input.limit??8)));
}
