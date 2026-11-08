import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type PointerEvent, type RefObject } from "react";
import type { SlideDocument } from "../domain/slide";
import { lengthToPx, transformBox, type Box, type TransformMode } from "./geometry";

export type FreeformHandle = {
  selectAt: (x: number, y: number) => boolean;
  refresh: () => void;
  clear: () => void;
};
type Props = {
  document: SlideDocument;
  frameRef: RefObject<HTMLIFrameElement | null>;
  scale: number;
  grid: number;
  onChange: (next: SlideDocument, key?: string) => void;
  onSelectStructured: (ids: string[]) => void;
  onEditingChange: (active: boolean) => void;
};
type Selection = { id: string; box: Box; tag: string };
type DomGesture = {pointerId:number;x:number;y:number;box:Box;mode:TransformMode;
  baseLeft:number;baseTop:number;position:string;moved:boolean;next:Box};
const handles: TransformMode[]=["nw","n","ne","e","se","s","sw","w"];
function rectBox(el:HTMLElement):Box {
  const rect=el.getBoundingClientRect();
  return {x:rect.x,y:rect.y,w:rect.width,h:rect.height};
}
function serializeFreeform(document:Document):string|null {
  const nodes=Array.from(document.body.childNodes);
  const from=nodes.findIndex(n=>n.nodeType===8&&n.textContent==="singe-free-start");
  const to=nodes.findIndex((n,i)=>i>from&&n.nodeType===8&&n.textContent==="singe-free-end");
  if(from<0||to<=from)return null;
  return nodes.slice(from+1,to).map(node=>{
    if(node.nodeType===1)return (node as Element).outerHTML;
    if(node.nodeType===8)return "<!--"+(node.textContent??"")+"-->";
    return node.textContent??"";
  }).join("");
}
function safeTag(element:HTMLElement):boolean {
  const tag=element.tagName.toLowerCase();
  return !["body","html","head","script","style","meta","link"].includes(tag) &&
    !element.closest("[data-id]");
}
export const FreeformOverlay=forwardRef<FreeformHandle,Props>(function FreeformOverlay(
  {document:slide,frameRef,scale,grid,onChange,onSelectStructured,onEditingChange},ref
) {
  const [selected,setSelected]=useState<Selection|null>(null);
  const selectedRef=useRef(selected);
  selectedRef.current=selected;
  const activeElement=useRef<HTMLElement|null>(null);
  const gesture=useRef<DomGesture|null>(null);
  const slideRef=useRef(slide);
  slideRef.current=slide;
  const editingRef=useRef(false);
  function refresh() {
    const iframe=frameRef.current?.contentDocument;
    const id=selectedRef.current?.id;
    if(!iframe||!id)return;
    const element=Array.from(iframe.querySelectorAll<HTMLElement>("[data-singe-id]"))
      .find(e=>e.dataset.singeId===id);
    if(element){
      activeElement.current=element;
      setSelected({...selectedRef.current!,box:rectBox(element)});
    }else{
      setSelected(null);activeElement.current=null;
    }
  }
  function clear() {
    setSelected(null);
    activeElement.current=null;
  }
  useImperativeHandle(ref,()=>({
    selectAt:(x,y)=>{
      const doc=frameRef.current?.contentDocument;
      if(!doc||!slideRef.current.freeform){clear();return false;}
      const element=doc.elementFromPoint(x,y);
      if(!element||element.nodeType!==1||!safeTag(element as HTMLElement)){
        clear();return false;
      }
      const node=element as HTMLElement;
      const id=node.dataset.singeId||"visual-"+crypto.randomUUID();
      node.dataset.singeId=id;
      activeElement.current=node;
      setSelected({id,box:rectBox(node),tag:node.tagName.toLowerCase()});
      onSelectStructured([]);
      return true;
    },
    refresh,clear,
  }));
  useEffect(()=>{
    // An existing HTML selection may need to be resolved after iframe regeneration.
    if(slide.mode==="structured")clear();
  },[slide.mode]);

  function commit() {
    const content=frameRef.current?.contentDocument;
    if(!content)return;
    const html=serializeFreeform(content);
    if(html===null||html===slideRef.current.freeform?.html)return;
    onChange({...slideRef.current,freeform:{html,css:slideRef.current.freeform?.css??""}},"dom-html");
  }
  function begin(e:PointerEvent<HTMLElement>,mode:TransformMode) {
    const element=activeElement.current,selection=selectedRef.current;
    if(!element||!selection||editingRef.current)return;
    e.stopPropagation();e.preventDefault();
    const css=element.ownerDocument.defaultView?.getComputedStyle(element);
    const baseLeft=lengthToPx(element.style.left||css?.left,slide.canvas.width);
    const baseTop=lengthToPx(element.style.top||css?.top,slide.canvas.height);
    gesture.current={
      pointerId:e.pointerId,x:e.clientX,y:e.clientY,box:selection.box,mode,baseLeft,baseTop,
      position:css?.position==="static"?"relative":(css?.position??"relative"),moved:false,next:selection.box,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e:PointerEvent<HTMLElement>) {
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
    if(selectedRef.current)setSelected({...selectedRef.current,box});
  }
  function end(e:PointerEvent<HTMLElement>) {
    const g=gesture.current;
    if(!g||g.pointerId!==e.pointerId)return;
    e.stopPropagation();gesture.current=null;
    if(g.moved)commit();
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function styleSelected(property:string,value:string) {
    const element=activeElement.current;
    if(!element)return;
    element.style.setProperty(property,value,"important");
    commit();
  }
  function selectedFontSize():number {
    const element=activeElement.current;
    const win=element?.ownerDocument.defaultView;
    return element && win ? Number.parseFloat(win.getComputedStyle(element).fontSize)||48 : 48;
  }
  function selectedColor():string {
    const element=activeElement.current;
    const win=element?.ownerDocument.defaultView;
    const value=element && win ? win.getComputedStyle(element).color : "rgb(32, 50, 40)";
    const rgb=value.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    return rgb ? "#"+rgb.slice(1,4).map(x=>Math.min(255,Math.max(0,Number(x))).toString(16).padStart(2,"0")).join("") : "#203228";
  }
  function editHtml() {
    const element=activeElement.current;
    if(!element||editingRef.current)return;
    editingRef.current=true;
    onEditingChange(true);
    element.setAttribute("contenteditable","true");
    element.addEventListener("blur",()=>{
      element.removeAttribute("contenteditable");
      editingRef.current=false;
      onEditingChange(false);
      commit();
    },{once:true});
    frameRef.current?.contentWindow?.focus();
    element.focus();
  }
  if(!selected||slide.mode==="structured")return null;
  const box=selected.box;
  return <div className="freeform-selection" data-freeform-id={selected.id}
    style={{position:"absolute",left:box.x,top:box.y,width:Math.max(12,box.w),height:Math.max(12,box.h)}}
    onPointerDown={e=>begin(e,"move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
    onDoubleClick={e=>{e.stopPropagation();editHtml();}}
    title="Élément HTML : double-cliquez pour modifier le texte, faites glisser pour déplacer">
    <span className="visual-selection-name">HTML · {selected.tag}</span>
    <div className="freeform-quickbar" onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()}>
      <button title="Modifier le texte" onClick={e=>{e.stopPropagation();editHtml();}}>Texte</button>
      <button title="Gras" onClick={e=>{e.stopPropagation();const el=activeElement.current;const font=el?.ownerDocument.defaultView?.getComputedStyle(el).fontWeight??"400";styleSelected("font-weight",font==="bold"||Number(font)>=600?"normal":"bold");}}><strong>B</strong></button>
      <button title="Diminuer le texte" onClick={e=>{e.stopPropagation();styleSelected("font-size",Math.max(8,selectedFontSize()-8)+"px");}}>A−</button>
      <button title="Augmenter le texte" onClick={e=>{e.stopPropagation();styleSelected("font-size",Math.min(500,selectedFontSize()+8)+"px");}}>A+</button>
      <input type="color" title="Couleur du texte HTML" aria-label="Couleur du texte HTML"
        value={selectedColor()} onPointerDown={e=>e.stopPropagation()}
        onChange={e=>styleSelected("color",e.target.value)}/>
      <button title="Aligner le texte au centre" onClick={e=>{e.stopPropagation();styleSelected("text-align","center");}}>≡</button>
    </div>
    {handles.map(mode=><span key={mode} className={"visual-resize-handle handle-"+mode}
      onPointerDown={e=>begin(e,mode)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}/>)}
  </div>;
});
