import type { AnimationStep, SlideDocument } from "../domain/slide.ts";

export type PlaybackPlan = {
  intro: AnimationStep[];
  clicks: AnimationStep[][];
  all: AnimationStep[];
};
export type PlaybackPosition = { slide: number; reveal: number };

/** A click starts one cue; trailing after-previous cues run automatically in sequence. */
export function buildPlaybackPlan(animations: AnimationStep[]): PlaybackPlan {
  const all = animations.map((step,index)=>({...step,_index:index}))
    .sort((a,b)=>a.order-b.order||a._index-b._index)
    .map(({_index,...cue})=>cue);
  const intro: AnimationStep[] = [];
  const clicks: AnimationStep[][] = [];
  for(const cue of all){
    if(cue.trigger==="click")clicks.push([cue]);
    else if(clicks.length)clicks[clicks.length-1]!.push(cue);
    else intro.push(cue);
  }
  return {all,intro,clicks};
}
export function initialPlaybackPosition():PlaybackPosition {
  return {slide:0,reveal:0};
}
export function nextPosition(documents:Pick<SlideDocument,"animations">[],pos:PlaybackPosition):PlaybackPosition {
  if(!documents.length)return {slide:0,reveal:0};
  const slide=Math.min(Math.max(0,pos.slide),documents.length-1);
  const count=buildPlaybackPlan(documents[slide]!.animations).clicks.length;
  if(pos.reveal<count)return {slide,reveal:pos.reveal+1};
  if(slide===documents.length-1)return {slide,reveal:Math.min(pos.reveal,count)};
  return {slide:slide+1,reveal:0};
}
export function previousPosition(documents:Pick<SlideDocument,"animations">[],pos:PlaybackPosition):PlaybackPosition {
  if(!documents.length)return {slide:0,reveal:0};
  const slide=Math.min(Math.max(0,pos.slide),documents.length-1);
  if(pos.reveal>0)return {slide,reveal:pos.reveal-1};
  const previous=Math.max(0,slide-1);
  return {slide:previous,reveal:previous===slide?0:buildPlaybackPlan(documents[previous]!.animations).clicks.length};
}
export function gotoSlide(documents:Pick<SlideDocument,"animations">[],index:number):PlaybackPosition {
  return {slide:Math.max(0,Math.min(documents.length-1,index)),reveal:0};
}
export function timelineTarget(step:AnimationStep,document:SlideDocument):string{
  if(step.targetElementId){
    const e=document.elements.find(x=>x.id===step.targetElementId);
    if(!e)return "Élément introuvable";
    if(e.type==="text")return "Texte : "+(e.text??"").replace(/\s+/g," ").slice(0,37);
    return ({image:"Image",shape:"Forme",group:"Groupe",svg:"SVG"} as Record<string,string>)[e.type]??e.type;
  }
  return step.targetSelector ?? "Cible non définie";
}
