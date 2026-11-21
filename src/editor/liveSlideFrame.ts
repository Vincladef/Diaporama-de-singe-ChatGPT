import { renderSlideHtml } from "../engine/render";
import type { SlideDocument } from "../domain/slide";

/**
 * Incremental, keyed DOM reconciliation for the sandboxed slide preview.
 * Editing must never replace the iframe itself: doing so restarts image loading,
 * drops caret/selection and makes the entire composition flash.
 */
function key(node:Node):string|null {
  if(node.nodeType===8) {
    const value=node.textContent;
    return value==="singe-free-start"||value==="singe-free-end"?"comment:"+value:null;
  }
  if(node.nodeType!==1)return null;
  const el=node as Element;
  if(el.hasAttribute("data-id"))return "native:"+el.getAttribute("data-id");
  if(el.hasAttribute("data-singe-id"))return "html:"+el.getAttribute("data-singe-id");
  return null;
}
function compatible(current:Node,source:Node):boolean{
  if(current.nodeType!==source.nodeType)return false;
  if(current.nodeType===1 && (current as Element).tagName!==(source as Element).tagName)return false;
  const a=key(current),b=key(source);
  return !(a&&b&&a!==b);
}
function reconcileNode(current:Node,source:Node):void{
  if(current.nodeType!==1||source.nodeType!==1){
    if(current.nodeValue!==source.nodeValue)current.nodeValue=source.nodeValue;
    return;
  }
  const target=current as Element,template=source as Element;
  // Runtime selection markers may not yet have been persisted. Keep them alive
  // through unrelated changes to the slide document.
  for(const attr of Array.from(target.attributes)){
    if(attr.name==="data-singe-id"&&!template.hasAttribute("data-singe-id"))continue;
    if(!template.hasAttribute(attr.name))target.removeAttribute(attr.name);
  }
  for(const attr of Array.from(template.attributes)){
    if(target.getAttribute(attr.name)!==attr.value)target.setAttribute(attr.name,attr.value);
  }
  reconcileChildren(target,template);
}
function reconcileChildren(target:Node,template:Node):void{
  const desired=Array.from(template.childNodes);
  let cursor=target.firstChild;
  for(const next of desired){
    const matchKey=key(next);
    let current:Node|null=null;
    if(cursor&&compatible(cursor,next)&&(!matchKey||key(cursor)===matchKey))current=cursor;
    if(!current&&matchKey)current=Array.from(target.childNodes).find(node=>key(node)===matchKey)??null;
    if(!current&&!matchKey){
      // Search only the remaining siblings. Previously reconciled unkeyed
      // spans must never be reused for the following rich-text fragment.
      for(let sibling=cursor;sibling;sibling=sibling.nextSibling){
        if(!key(sibling)&&compatible(sibling,next)){current=sibling;break;}
      }
    }
    if(!current)current=target.ownerDocument!.importNode(next,true);
    if(current!==cursor)target.insertBefore(current,cursor);
    if(current!==next)reconcileNode(current,next);
    cursor=current.nextSibling;
  }
  while(cursor){
    const after=cursor.nextSibling;
    target.removeChild(cursor);
    cursor=after;
  }
}

/** Updates only changed style attributes, text nodes and reordered/added objects. */
export function updateLiveSlideFrame(frame:Document,slide:SlideDocument):void{
  if(!frame.body)return;
  const next=new DOMParser().parseFromString(renderSlideHtml(slide),"text/html");
  const oldStyle=frame.head.querySelector("style");
  const newStyle=next.head.querySelector("style");
  if(oldStyle&&newStyle&&oldStyle.textContent!==newStyle.textContent)
    oldStyle.textContent=newStyle.textContent;
  reconcileChildren(frame.body,next.body);
}
