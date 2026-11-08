import type { AnimationStep, SlideDocument } from "../domain/slide.ts";
import { buildPlaybackPlan } from "./timeline.ts";

type AnimatedTarget=HTMLElement|SVGElement;
type OriginalState={attribute:string|null;opacity:string;visibility:string};
type RunOptions={animate?:boolean;onBusy?:(busy:boolean)=>void};
const ENTER=new Set<AnimationStep["effect"]>(["appear","fade","move","scale","wipe","custom"]);
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));

/** Player code executes OUTSIDE the sandboxed slide. The slide itself cannot run JS. */
export class SlideAnimationPlayer {
  private original=new Map<AnimatedTarget,OriginalState>();
  private animations:Animation[]=[];
  private sequence=0;
  private disposed=false;
  readonly plan;
  constructor(private readonly dom:Document,readonly slide:SlideDocument){
    this.plan=buildPlaybackPlan(slide.animations);
    for(const cue of this.plan.all)for(const target of this.targets(cue)){
      if(this.original.has(target))continue;
      const view=dom.defaultView;
      this.original.set(target,{
        attribute:target.getAttribute("style"),
        opacity:view?.getComputedStyle(target).opacity??"1",
        visibility:view?.getComputedStyle(target).visibility??"visible",
      });
    }
  }
  private targets(cue:AnimationStep):AnimatedTarget[]{
    if(cue.targetElementId)
      return Array.from(this.dom.body?.querySelectorAll<AnimatedTarget>("[data-id]")??[])
        .filter(el=>el.dataset.id===cue.targetElementId).slice(0,100);
    if(!cue.targetSelector||cue.targetSelector.length>240)return [];
    try{return Array.from(this.dom.body?.querySelectorAll<AnimatedTarget>(cue.targetSelector)??[]).slice(0,100);}
    catch{return [];}
  }
  missingTargets():string[]{
    return this.plan.all.filter(c=>this.targets(c).length===0).map(c=>c.id);
  }
  private stopAnimations(){
    for(const running of this.animations){try{running.cancel();}catch{/* detached */}}
    this.animations=[];
  }
  private reset(){
    this.stopAnimations();
    for(const [element,source] of this.original){
      if(!element.isConnected)continue;
      if(source.attribute===null)element.removeAttribute("style");
      else element.setAttribute("style",source.attribute);
    }
    const firstEffect=new Map<AnimatedTarget,AnimationStep["effect"]>();
    for(const cue of this.plan.all){
      for(const element of this.targets(cue))if(!firstEffect.has(element))firstEffect.set(element,cue.effect);
    }
    for(const [element,effect] of firstEffect){
      if(!ENTER.has(effect))continue;
      element.style.visibility="hidden";
      element.style.opacity="0";
    }
  }
  private async pause(milliseconds:number,token:number):Promise<boolean>{
    if(milliseconds<=0)return !this.disposed&&this.sequence===token;
    await new Promise<void>(resolve=>setTimeout(resolve,milliseconds));
    return !this.disposed&&this.sequence===token;
  }
  private finalStyle(element:AnimatedTarget,cue:AnimationStep){
    const baseline=this.original.get(element);
    const opacity=baseline?.opacity??"1";
    if(ENTER.has(cue.effect)){
      element.style.visibility="visible";
      element.style.opacity=opacity;
    } else if(cue.effect==="dim"){
      element.style.visibility="visible";element.style.opacity=".22";
    } else if(cue.effect==="hide"){
      element.style.opacity="0";element.style.visibility="hidden";
    } else if(cue.effect==="highlight"){
      element.style.visibility="visible";
      element.style.boxShadow="0 0 0 9px rgba(249,206,65,.87),0 0 42px rgba(249,206,65,.55)";
    }
    if(cue.effect==="custom"&&cue.keyframes?.length){
      const final=cue.keyframes[cue.keyframes.length-1]!;
      for(const [key,value] of Object.entries(final)){
        if(!/^(opacity|transform|filter|clipPath|backgroundColor|color|boxShadow|borderColor|borderRadius|scale|translate|rotate)$/.test(key))continue;
        element.style.setProperty(key.replace(/[A-Z]/g,v=>"-"+v.toLowerCase()),String(value));
      }
    }
  }
  private frames(cue:AnimationStep,source:OriginalState):Keyframe[] {
    const opacity=source.opacity;
    switch(cue.effect){
      case "fade":return [{opacity:0},{opacity}];
      case "move":return [
        {opacity:0,transform:"translate("+clamp(cue.offsetX??0,-4096,4096)+"px,"+clamp(cue.offsetY??72,-4096,4096)+"px)"},
        {opacity,transform:"translate(0px,0px)"},
      ];
      case "scale":return [{opacity:0,transform:"scale(.75)"},{opacity,transform:"scale(1)"}];
      case "wipe":return [{opacity,clipPath:"inset(0 100% 0 0)"},{opacity,clipPath:"inset(0 0 0 0)"}];
      case "highlight":return [
        {boxShadow:"0 0 0 0 rgba(249,206,65,0)"},
        {boxShadow:"0 0 0 13px rgba(249,206,65,.9),0 0 45px rgba(249,206,65,.6)"},
        {boxShadow:"0 0 0 9px rgba(249,206,65,.87),0 0 42px rgba(249,206,65,.55)"},
      ];
      case "dim":return [{opacity},{opacity:.22}];
      case "hide":return [{opacity},{opacity:0}];
      case "custom":return (cue.keyframes??[{opacity:0},{opacity}]) as unknown as Keyframe[];
      default:return [{opacity:0},{opacity}];
    }
  }
  private async execute(cue:AnimationStep,animate:boolean,token:number):Promise<void>{
    if(!animate){
      for(const element of this.targets(cue))this.finalStyle(element,cue);
      return;
    }
    if(!await this.pause(cue.delayMs??0,token))return;
    const tasks:Promise<unknown>[]=[];
    for(const element of this.targets(cue)){
      const source=this.original.get(element);
      if(!source)continue;
      if(cue.effect==="appear"||cue.durationMs===0||this.dom.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches){
        this.finalStyle(element,cue);continue;
      }
      const frames=this.frames(cue,source);
      if(ENTER.has(cue.effect)){
        element.style.visibility="visible";
        element.style.opacity=source.opacity;
      }
      try{
        const animation=element.animate(frames,{
          duration:cue.durationMs,fill:"both",easing:cue.easing??"ease-out",
        });
        this.animations.push(animation);
        tasks.push(animation.finished.catch(()=>{}));
      }catch{
        this.finalStyle(element,cue);
      }
    }
    await Promise.all(tasks);
    if(this.disposed||this.sequence!==token)return;
    for(const element of this.targets(cue))this.finalStyle(element,cue);
    // Release only this cue's animations; completed CSS stays in the inline styles.
    this.stopAnimations();
  }
  private async runGroup(cues:AnimationStep[],animate:boolean,token:number):Promise<void>{
    for(const cue of cues){
      if(this.sequence!==token||this.disposed)return;
      await this.execute(cue,animate,token);
    }
  }
  /** Seek to any click boundary. Rebuilds the end state deterministically, then optionally animates the last group. */
  async seek(clickCount:number,options:RunOptions={}):Promise<void>{
    if(this.disposed)return;
    const token=++this.sequence;
    this.reset();
    const total=this.plan.clicks.length;
    const count=clamp(clickCount,0,total);
    const animate=options.animate??false;
    if(animate)options.onBusy?.(true);
    try{
      await this.runGroup(this.plan.intro,animate&&count===0,token);
      for(let i=0;i<count;i++){
        if(this.disposed||this.sequence!==token)return;
        await this.runGroup(this.plan.clicks[i]!,animate&&i===count-1,token);
      }
    }finally{
      if(token===this.sequence)options.onBusy?.(false);
    }
  }
  dispose(){
    this.disposed=true;
    this.sequence++;
    this.stopAnimations();
    this.original.clear();
  }
}
