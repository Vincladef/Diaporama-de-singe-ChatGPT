import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { SlideDocument, SlideElement } from "../domain/slide";
import { renderSlideHtml } from "../engine/render";
import { elementBox, transformBox, withElementBoxes, worldBox, type Box, type TransformMode } from "./geometry";
import { FreeformOverlay, type FreeformHandle } from "./FreeformOverlay";

type Gesture = {
  pointerId: number;
  x: number;
  y: number;
  mode: TransformMode;
  initial: Record<string, Box>;
  latest: Record<string, Box>;
  moved: boolean;
};
const handles: TransformMode[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
function getVisualLabel(e: SlideElement): string {
  return e.type === "text" ? (e.text?.slice(0, 55) || "Texte vide") :
    e.type === "image" ? "Image" : e.type === "shape" ? "Forme" : e.type === "svg" ? "SVG" : "Groupe";
}
type Props = {
  document: SlideDocument;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onChange: (document: SlideDocument, key?: string) => void;
  zoom: number;
  grid: number;
  readOnly?: boolean;
};

export function VisualCanvas({document: doc, selectedIds, onSelect, onChange, zoom, grid, readOnly}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const freeRef = useRef<FreeformHandle>(null);
  const [editingHtml,setEditingHtml]=useState(false);
  const [width, setWidth] = useState(840);
  const [live, setLive] = useState<Record<string, Box>>({});
  const gesture = useRef<Gesture | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const documentRef = useRef(doc);
  documentRef.current = doc;
  const selectionRef = useRef(selectedIds);
  selectionRef.current = selectedIds;

  useEffect(() => {
    const div=wrapperRef.current;
    if (!div) return;
    const measure=()=>setWidth(Math.max(250, div.clientWidth - 2));
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(div);
    return ()=>observer.disconnect();
  },[]);
  useEffect(() => {
    gesture.current = null;
    setLive({});
    setEditId(null);
  },[doc.canvas.width,doc.canvas.height]);
  const fit = Math.max(0.02, (width / doc.canvas.width) * zoom);
  const [previewDoc,setPreviewDoc]=useState(doc);
  useEffect(()=>{
    // Code typing changes only freeform markup; defer iframe rebuilding while
    // the user types. Structured dragging and image edits remain immediate.
    const codeOnly=doc.elements===previewDoc.elements&&doc.animations===previewDoc.animations
      &&doc.canvas===previewDoc.canvas&&doc.mode===previewDoc.mode
      &&doc.freeform!==previewDoc.freeform;
    if(!codeOnly){setPreviewDoc(doc);return;}
    const timer=window.setTimeout(()=>setPreviewDoc(doc),220);
    return()=>window.clearTimeout(timer);
  },[doc]);
  const srcDoc=useMemo(()=>renderSlideHtml(previewDoc),[previewDoc]);
  const canvasHeight = doc.canvas.height * fit;

  function updateIframePreview(boxes: Record<string,Box>) {
    const frameDoc=frameRef.current?.contentDocument;
    if (!frameDoc) return;
    for (const [id, box] of Object.entries(boxes)) {
      const el=Array.from(frameDoc.querySelectorAll<HTMLElement>("[data-id]")).find(x=>x.dataset.id===id);
      if (!el) continue;
      const source=documentRef.current.elements.find(e=>e.id===id);
      const parent=source?.parentId ? documentRef.current.elements.find(e=>e.id===source.parentId) : undefined;
      const pb=parent ? worldBox(parent,documentRef.current) : {x:0,y:0,w:0,h:0};
      el.style.left=(box.x-pb.x)+"px";
      el.style.top=(box.y-pb.y)+"px";
      el.style.width=box.w+"px";
      el.style.height=box.h+"px";
    }
  }
  function begin(e: PointerEvent<HTMLElement>, id: string, mode: TransformMode) {
    if (readOnly || editId) return;
    e.preventDefault();
    e.stopPropagation();
    freeRef.current?.clear();
    const selected = selectionRef.current;
    let ids: string[];
    if (e.shiftKey && mode === "move") {
      ids = selected.includes(id) ? selected.filter(x=>x!==id) : [...selected,id];
      onSelect(ids);
      if (!ids.includes(id)) return;
    } else {
      ids = selected.includes(id) && mode==="move" ? selected : [id];
      if (ids.length!==selected.length || !ids.every((x,i)=>selected[i]===x)) onSelect(ids);
    }
    const initial:Record<string,Box>={};
    for (const member of mode==="move" ? ids : [id]) {
      const element=doc.elements.find(x=>x.id===member);
      if (element) initial[member]=worldBox(element,doc);
    }
    gesture.current={pointerId:e.pointerId,x:e.clientX,y:e.clientY,mode,initial,latest:initial,moved:false};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLElement>) {
    const g=gesture.current;
    if (!g || e.pointerId!==g.pointerId) return;
    e.preventDefault();
    const dx=(e.clientX-g.x)/fit,dy=(e.clientY-g.y)/fit;
    if (Math.abs(dx)<.75 && Math.abs(dy)<.75 && !g.moved) return;
    const next:Record<string,Box>={};
    for (const [id,origin] of Object.entries(g.initial)) {
      next[id]=transformBox(origin,dx,dy,g.mode,grid);
    }
    g.latest=next;g.moved=true;
    updateIframePreview(next);
    setLive(next);
  }
  function end(e:PointerEvent<HTMLElement>) {
    const g=gesture.current;
    if (!g || e.pointerId!==g.pointerId) return;
    e.stopPropagation();
    gesture.current=null;
    if (g.moved) onChange(withElementBoxes(documentRef.current,g.latest),"transform");
    setLive({});
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function beginInlineEdit(element: SlideElement) {
    if (readOnly || element.type!=="text") return;
    setEditId(element.id);
    setEditValue(element.text ?? "");
    onSelect([element.id]);
  }
  function commitInlineEdit() {
    const currentId=editId;
    if (!currentId) return;
    setEditId(null);
    const original=documentRef.current.elements.find(e=>e.id===currentId);
    if (original && editValue!==original.text) {
      onChange({...documentRef.current,elements:documentRef.current.elements.map(e=>e.id===currentId?{...e,text:editValue}:e)},"text");
    }
  }
  const chosen=doc.elements.find(e=>e.id===editId);
  const editBox=chosen && (live[chosen.id]??worldBox(chosen,doc));

  return (
    <div className="visual-viewport" ref={wrapperRef} style={{height:Math.max(210, Math.min(640,canvasHeight + 2))}}
      aria-label="Surface d'édition graphique">
      <div className="visual-artboard" data-testid="visual-artboard" style={{
        width:doc.canvas.width,height:doc.canvas.height,
        transform:"scale("+fit+")",transformOrigin:"top left",
      }}>
        <iframe
          ref={frameRef}
          title="Aperçu sécurisé de la diapositive"
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
          onLoad={()=>freeRef.current?.refresh()}
          style={{position:"absolute",inset:0,border:0,width:doc.canvas.width,height:doc.canvas.height,pointerEvents:editingHtml?"auto":"none"}}
        />
        <div className="visual-hit-layer" style={{pointerEvents:editingHtml?"none":"auto"}}
          onPointerDown={e=>{
            if(readOnly)return;
            onSelect([]);setEditId(null);
            const rect=e.currentTarget.getBoundingClientRect();
            freeRef.current?.selectAt((e.clientX-rect.left)/fit,(e.clientY-rect.top)/fit);
          }}>
          {!readOnly && doc.elements.filter(el=>!el.parentId).concat(doc.elements.filter(el=>!!el.parentId)).map(element=>{
            const box=live[element.id]??worldBox(element,doc);
            const picked=selectedIds.includes(element.id);
            return (
              <div
                key={element.id}
                data-visual-id={element.id}
                className={"visual-object-hit"+(picked?" is-selected":"")}
                style={{left:box.x,top:box.y,width:box.w,height:box.h}}
                title={getVisualLabel(element)}
                aria-label={getVisualLabel(element)}
                onPointerDown={e=>begin(e,element.id,"move")}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                onDoubleClick={e=>{e.stopPropagation();beginInlineEdit(element);}}
              >
                {picked && <span className="visual-selection-name">{element.type === "text" ? "Texte" : element.type==="image" ? "Image" : element.type==="shape" ? "Forme" : "Élément"}</span>}
                {picked && selectedIds.length===1 && handles.map(mode=>(
                  <span key={mode} data-handle={mode} className={"visual-resize-handle handle-"+mode}
                    onPointerDown={e=>begin(e,element.id,mode)}
                    onPointerMove={move}
                    onPointerUp={end}
                    onPointerCancel={end}
                    title={"Redimensionner "+mode}
                  />
                ))}
              </div>
            );
          })}
          {!readOnly && <FreeformOverlay ref={freeRef} document={doc} frameRef={frameRef} scale={fit} grid={grid}
            onChange={onChange} onSelectStructured={onSelect} onEditingChange={setEditingHtml}/>}
          {!readOnly && editId && editBox && chosen && <textarea
            autoFocus
            data-testid="canvas-inline-text"
            className="visual-inline-text"
            style={{
              position:"absolute",left:editBox.x,top:editBox.y,width:editBox.w,height:Math.max(editBox.h,90),
              fontSize:elementBox(chosen,doc).h>0 ? (typeof chosen.styles.fontSize==="number" ? chosen.styles.fontSize+"px" : String(chosen.styles.fontSize??"64px")) : "64px",
              fontFamily:String(chosen.styles.fontFamily??"sans-serif"),
              fontWeight:String(chosen.styles.fontWeight??"normal"),
              color:String(chosen.styles.color??"#203127"),
              textAlign:(["left","center","right"].includes(String(chosen.styles.textAlign)) ? String(chosen.styles.textAlign) : "left") as "left" | "center" | "right",
            }}
            onPointerDown={e=>e.stopPropagation()}
            value={editValue} onChange={e=>setEditValue(e.target.value)}
            onBlur={commitInlineEdit}
            onKeyDown={e=>{e.stopPropagation();if(e.key==="Escape"){setEditId(null);}if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();commitInlineEdit();}}}
          />}
        </div>
      </div>
    </div>
  );
}
