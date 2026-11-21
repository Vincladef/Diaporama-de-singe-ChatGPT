import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { SlideDocument } from "../domain/slide";
import { lengthToPx, transformBox, type Box, type TransformMode } from "./geometry";

export type HtmlSelectionInfo = {
  count: number; tag: string; text: boolean;
  styles: Record<string,string>;
};
export type FreeformHandle = {
  selectAt: (x:number,y:number,additive?:boolean)=>boolean;
  selectWithin: (box:Box,additive?:boolean)=>number;
  style: (property:string,value:string)=>void;
  refresh: ()=>void;
  clear: ()=>void;
};
type Props = {
  document:SlideDocument;
  frameRef:RefObject<HTMLIFrameElement|null>;
  scale:number;grid:number;
  onChange:(next:SlideDocument,key?:string)=>void;
  onSelectStructured:(ids:string[])=>void;
  onSelectionChange?:(info:HtmlSelectionInfo|null)=>void;
  onEditingChange:(active:boolean)=>void;
};
type Selection={id:string;box:Box;tag:string};
type DomGesture={pointerId:number;x:number;y:number;box:Box;mode:TransformMode;
  baseLeft:number;baseTop:number;position:string;moved:boolean;next:Box;
  peers:Array<{id:string;element:HTMLElement;left:number;top:number;position:string;box:Box}>};
const handles:TransformMode[]=["nw","n","ne","e","se","s","sw","w"];
const cssName=(p:string)=>p.replace(/[A-Z]/g,x=>"-"+x.toLowerCase());
function rectBox(el:HTMLElement):Box{
  const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};
}
function serializeFreeform(doc:Document):string|null{
  const nodes=Array.from(doc.body.childNodes);
  const from=nodes.findIndex(n=>n.nodeType===8&&n.textContent==="singe-free-start");
  const to=nodes.findIndex((n,i)=>i>from&&n.nodeType===8&&n.textContent==="singe-free-end");
  if(from<0||to<=from)return null;
  return nodes.slice(from+1,to).map(n=>{
    if(n.nodeType===1)return(n as Element).outerHTML;
    if(n.nodeType===8)return "<!--"+(n.textContent??"")+"-->";
    return n.textContent??"";
  }).join("");
}
function safeTag(el:HTMLElement):boolean{
  const tag=el.tagName.toLowerCase();
  return !["body","html","head","script","style","meta","link","br"].includes(tag)&&!el.closest("[data-id]");
}
function isBackground(el:HTMLElement,canvas:SlideDocument["canvas"]){
  const r=el.getBoundingClientRect(),tag=el.tagName.toLowerCase();
  return ["div","section","article","main","figure"].includes(tag)&&r.width>=canvas.width*.92&&r.height>=canvas.height*.92;
}
function valueAsColor(input:string):string{
  const m=input.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  return m?"#"+m.slice(1,4).map(x=>Number(x).toString(16).padStart(2,"0")).join(""):input;
}
export const FreeformOverlay=forwardRef<FreeformHandle,Props>(function FreeformOverlay(
  {document:slide,frameRef,scale,grid,onChange,onSelectStructured,onSelectionChange,onEditingChange},ref
){
  const [selections,setSelections]=useState<Selection[]>([]);
  const selectionsRef=useRef<Selection[]>([]);
  selectionsRef.current=selections;
  const activeElement=useRef<HTMLElement|null>(null);
  const gesture=useRef<DomGesture|null>(null);
  const slideRef=useRef(slide);slideRef.current=slide;
  const editingRef=useRef(false);
  const savedRange=useRef<Range|null>(null);
  const callbackRef=useRef(onSelectionChange);callbackRef.current=onSelectionChange;
  const changeRef=useRef(onChange);changeRef.current=onChange;

  function getElement(id:string):HTMLElement|null{
    const doc=frameRef.current?.contentDocument;
    return doc?Array.from(doc.querySelectorAll<HTMLElement>("[data-singe-id]")).find(e=>e.dataset.singeId===id)??null:null;
  }
  function stableId(element:HTMLElement){
    if(!element.dataset.singeId){
      const all=Array.from(element.ownerDocument.querySelectorAll("body *"));
      element.dataset.singeId="html-"+all.indexOf(element);
    }
    return element.dataset.singeId;
  }
  function emit(items:Selection[]){
    const primary=items[items.length-1],el=primary&&getElement(primary.id);
    if(!primary||!el){callbackRef.current?.(null);return;}
    const computed=el.ownerDocument.defaultView?.getComputedStyle(el);
    if(!computed){callbackRef.current?.(null);return;}
    callbackRef.current?.({
      count:items.length,tag:primary.tag,text:!!(el.textContent?.trim()),
      styles:{
        fontFamily:computed.fontFamily,fontSize:computed.fontSize,fontWeight:computed.fontWeight,
        fontStyle:computed.fontStyle,textDecoration:computed.textDecorationLine,
        color:valueAsColor(computed.color),backgroundColor:valueAsColor(computed.backgroundColor),
        borderColor:valueAsColor(computed.borderTopColor),borderWidth:computed.borderTopWidth,
        textAlign:computed.textAlign,lineHeight:computed.lineHeight
      }
    });
  }
  function updateSelected(items:Selection[]){
    selectionsRef.current=items;setSelections(items);
    const last=items[items.length-1];
    activeElement.current=last?getElement(last.id):null;
    emit(items);
  }
  function clear(){
    savedRange.current=null;updateSelected([]);
  }
  function refresh(){
    const ids=selectionsRef.current.map(x=>x.id);
    const found=ids.map(id=>{const el=getElement(id);return el?{id,tag:el.tagName.toLowerCase(),box:rectBox(el)}:null;})
      .filter((x):x is Selection=>!!x);
    updateSelected(found);
  }
  function selectNode(element:HTMLElement,additive=false){
    if(!safeTag(element)||isBackground(element,slideRef.current.canvas))return false;
    const id=stableId(element),next:{id:string;box:Box;tag:string}={
      id,tag:element.tagName.toLowerCase(),box:rectBox(element)
    };
    const was=selectionsRef.current;
    const items=additive?(was.some(x=>x.id===id)?was.filter(x=>x.id!==id):[...was,next]):[next];
    updateSelected(items);
    if(!additive)onSelectStructured([]);
    return true;
  }
  function selectAt(x:number,y:number,additive=false){
    const doc=frameRef.current?.contentDocument;
    if(!doc||!slideRef.current.freeform){if(!additive)clear();return false;}
    const hit=doc.elementFromPoint(x,y) as HTMLElement|null;
    if(!hit||!safeTag(hit)||isBackground(hit,slideRef.current.canvas)){
      if(!additive)clear();return false;
    }
    return selectNode(hit,additive);
  }
  function selectWithin(box:Box,additive=false){
    const doc=frameRef.current?.contentDocument;
    if(!doc||!slideRef.current.freeform)return 0;
    const all=Array.from(doc.querySelectorAll<HTMLElement>("body *")).filter(el=>{
      if(!safeTag(el)||isBackground(el,slideRef.current.canvas))return false;
      const r=rectBox(el);
      return r.w>3&&r.h>3&&r.x<box.x+box.w&&r.x+r.w>box.x&&r.y<box.y+box.h&&r.y+r.h>box.y;
    });
    // Prefer the innermost content objects, not full wrappers around the whole composition.
    const leaves=all.filter(el=>!all.some(child=>child!==el&&el.contains(child)));
    const items=leaves.slice(0,120).map(el=>({id:stableId(el),tag:el.tagName.toLowerCase(),box:rectBox(el)}));
    const next=additive?[...selectionsRef.current.filter(x=>!items.some(y=>y.id===x.id)),...items]:items;
    updateSelected(next);
    return items.length;
  }
  useImperativeHandle(ref,()=>({selectAt,selectWithin,style:styleSelected,refresh,clear}));
  useEffect(()=>{if(slide.mode==="structured")clear();},[slide.mode]);
  useEffect(()=>{
    const doc=frameRef.current?.contentDocument;
    if(!doc)return;
    const onSelection=()=>{
      if(!editingRef.current)return;
      const s=doc.getSelection();
      if(s&&s.rangeCount&&!s.isCollapsed)savedRange.current=s.getRangeAt(0).cloneRange();
    };
    doc.addEventListener("selectionchange",onSelection);
    return()=>doc.removeEventListener("selectionchange",onSelection);
  },[frameRef,slide.freeform?.html]);
  useEffect(()=>{
    const handler=(event:KeyboardEvent)=>{
      if(!["Delete","Backspace"].includes(event.key)||event.defaultPrevented||editingRef.current)return;
      if(event.ctrlKey||event.metaKey||event.altKey)return;
      const target=event.target instanceof HTMLElement?event.target:null;
      if(target?.closest("input,textarea,select,[contenteditable='true']"))return;
      if(!selectionsRef.current.length)return;
      const content=frameRef.current?.contentDocument;
      if(!content)return;
      const before=serializeFreeform(content);
      for(const selection of selectionsRef.current)getElement(selection.id)?.remove();
      const after=serializeFreeform(content);
      if(after===null||after===before)return;
      event.preventDefault();event.stopImmediatePropagation();
      clear();
      changeRef.current({...slideRef.current,freeform:{html:after,css:slideRef.current.freeform?.css??""}},"dom-html");
    };
    window.addEventListener("keydown",handler,true);
    return()=>window.removeEventListener("keydown",handler,true);
  },[frameRef]);
  function commit(){
    const content=frameRef.current?.contentDocument;
    if(!content)return;
    const html=serializeFreeform(content);
    if(html===null||html===slideRef.current.freeform?.html)return;
    changeRef.current({...slideRef.current,freeform:{html,css:slideRef.current.freeform?.css??""}},"dom-html");
  }
  function styleSelected(property:string,value:string){
    const doc=frameRef.current?.contentDocument;
    if(!doc||!selectionsRef.current.length)return;
    const css=cssName(property);
    const range=savedRange.current;
    const el=activeElement.current;
    if(range&&!range.collapsed&&el&&doc.contains(range.commonAncestorContainer)&&
      el.contains(range.commonAncestorContainer)&&["font-size","font-family","font-weight","font-style","color","text-decoration","background-color"].includes(css)){
      try{
        const span=doc.createElement("span");
        span.style.setProperty(css,value,"important");
        span.appendChild(range.extractContents());
        range.insertNode(span);
        savedRange.current=null;
      }catch{for(const entry of selectionsRef.current)getElement(entry.id)?.style.setProperty(css,value,"important");}
    }else{
      for(const entry of selectionsRef.current)getElement(entry.id)?.style.setProperty(css,value,"important");
    }
    emit(selectionsRef.current);
    commit();
  }
  function begin(e:PointerEvent<HTMLElement>,mode:TransformMode){
    const el=activeElement.current,entry=selectionsRef.current.at(-1);
    if(!el||!entry||editingRef.current)return;
    e.stopPropagation();e.preventDefault();
    const c=el.ownerDocument.defaultView?.getComputedStyle(el);
    const left=lengthToPx(el.style.left||c?.left,slide.canvas.width);
    const top=lengthToPx(el.style.top||c?.top,slide.canvas.height);
    const peers=selectionsRef.current.slice(0,-1).map(item=>{
      const element=getElement(item.id)!;
      const style=element.ownerDocument.defaultView?.getComputedStyle(element);
      return {id:item.id,element,left:lengthToPx(element.style.left||style?.left,slide.canvas.width),
        top:lengthToPx(element.style.top||style?.top,slide.canvas.height),
        position:style?.position==="static"?"relative":(style?.position??"relative"),box:item.box};
    }).filter(p=>!!p.element);
    gesture.current={pointerId:e.pointerId,x:e.clientX,y:e.clientY,box:entry.box,mode,baseLeft:left,baseTop:top,
      position:c?.position==="static"?"relative":(c?.position??"relative"),moved:false,next:entry.box,peers};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e:PointerEvent<HTMLElement>){
    const g=gesture.current,el=activeElement.current;
    if(!g||!el||g.pointerId!==e.pointerId)return;
    e.preventDefault();e.stopPropagation();
    const dx=(e.clientX-g.x)/scale,dy=(e.clientY-g.y)/scale;
    if(Math.abs(dx)+Math.abs(dy)<1&&!g.moved)return;
    const box=transformBox(g.box,dx,dy,g.mode,grid);
    g.next=box;g.moved=true;
    el.style.setProperty("position",g.position,"important");
    if(g.mode==="move"||g.mode.includes("w")||g.mode.includes("n")){
      el.style.setProperty("left",(g.baseLeft+box.x-g.box.x)+"px","important");
      el.style.setProperty("top",(g.baseTop+box.y-g.box.y)+"px","important");
    }
    if(g.mode!=="move"){
      el.style.setProperty("width",box.w+"px","important");
      el.style.setProperty("height",box.h+"px","important");
    }
    if(g.mode==="move")for(const p of g.peers){
      p.element.style.setProperty("position",p.position,"important");
      p.element.style.setProperty("left",(p.left+box.x-g.box.x)+"px","important");
      p.element.style.setProperty("top",(p.top+box.y-g.box.y)+"px","important");
    }
    const latest=selectionsRef.current.map(item=>item.id===selectionsRef.current.at(-1)?.id
      ?{...item,box}:{...item,box:g.mode==="move"?{...item.box,x:item.box.x+box.x-g.box.x,y:item.box.y+box.y-g.box.y}:item.box});
    updateSelected(latest);
  }
  function end(e:PointerEvent<HTMLElement>){
    const g=gesture.current;
    if(!g||g.pointerId!==e.pointerId)return;
    e.stopPropagation();gesture.current=null;
    if(g.moved)commit();
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function editHtml(){
    const element=activeElement.current;if(!element||editingRef.current)return;
    editingRef.current=true;onEditingChange(true);
    element.setAttribute("contenteditable","true");
    const frameDoc=element.ownerDocument;
    const captureRange=()=>{
      const sel=frameDoc.getSelection();
      if(sel&&sel.rangeCount&&!sel.isCollapsed)savedRange.current=sel.getRangeAt(0).cloneRange();
    };
    frameDoc.addEventListener("selectionchange",captureRange);
    element.addEventListener("blur",()=>{
      captureRange();frameDoc.removeEventListener("selectionchange",captureRange);
      element.removeAttribute("contenteditable");editingRef.current=false;
      onEditingChange(false);commit();
    },{once:true});
    frameRef.current?.contentWindow?.focus();element.focus();
  }
  if(!selections.length||slide.mode==="structured")return null;
  return <>
    {selections.slice(0,-1).map(s=><div key={s.id} className="freeform-multi-outline" style={{
      position:"absolute",left:s.box.x,top:s.box.y,width:s.box.w,height:s.box.h}}/>)}
    {selections.slice(-1).map(selected=><div key={selected.id}
      className="freeform-selection" data-freeform-id={selected.id}
      style={{position:"absolute",left:selected.box.x,top:selected.box.y,width:Math.max(12,selected.box.w),height:Math.max(12,selected.box.h)}}
      onPointerDown={e=>begin(e,"move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onDoubleClick={e=>{e.stopPropagation();editHtml();}}
      title="Double-cliquez pour modifier le texte HTML">
      <span className="visual-selection-name">HTML · {selected.tag}{selections.length>1?" · "+selections.length+" objets":""}</span>
      <div className="freeform-quickbar" onPointerDown={e=>e.stopPropagation()}>
        <button title="Modifier le texte" onClick={e=>{e.stopPropagation();editHtml();}}>Texte</button>
        <button title="Gras" onClick={e=>{e.stopPropagation();styleSelected("fontWeight","bold");}}>B</button>
        <button title="Diminuer le texte" onClick={e=>{
          e.stopPropagation();const font=activeElement.current?.ownerDocument.defaultView?.getComputedStyle(activeElement.current).fontSize??"48px";
          styleSelected("fontSize",Math.max(8,parseFloat(font)-8)+"px");
        }}>A−</button>
        <button title="Augmenter le texte" onClick={e=>{
          e.stopPropagation();const font=activeElement.current?.ownerDocument.defaultView?.getComputedStyle(activeElement.current).fontSize??"48px";
          styleSelected("fontSize",Math.min(500,parseFloat(font)+8)+"px");
        }}>A+</button>
      </div>
      {handles.map(mode=><span key={mode} className={"visual-resize-handle handle-"+mode}
        onPointerDown={e=>begin(e,mode)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}/>)}
    </div>)}
  </>;
});
