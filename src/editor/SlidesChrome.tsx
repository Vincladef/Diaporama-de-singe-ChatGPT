import { useEffect, useRef, useState } from "react";
import type { SlideDocument, SlideElement } from "../domain/slide";
import { ShapePicker, type ShapePreset } from "./ShapePicker";
import { ColorPalette } from "./ColorPalette";
import type { HtmlSelectionInfo } from "./FreeformOverlay";
import type { TextSelectionRange } from "./richText";
import { SLIDE_LAYOUTS, layoutPreviewSlots, type LayoutId } from "./slideLayouts";

type Arrange="front"|"back"|"forward"|"backward";
type Align="left"|"center"|"right"|"top"|"middle"|"bottom";
type Actions={
  addSlide:()=>void; duplicateSlide:()=>void; deleteSlide:()=>void;
  layout:(id:LayoutId)=>void; newSlideWithLayout:(id:LayoutId)=>void; addText:()=>void; addImage:()=>void; addShape:(preset:ShapePreset)=>void;
  undo:()=>void; redo:()=>void; canUndo:boolean; canRedo:boolean;
  htmlStyle:(property:string,value:string)=>void;
  nativeTextStyle:(property:string,value:string)=>void;
  save:()=>void; import:()=>void; export:()=>void;
  copy:()=>void; paste:()=>void; duplicate:()=>void; remove:()=>void;
  group:()=>void; ungroup:()=>void; arrange:(direction:Arrange)=>void;
  align:(kind:Align)=>void; distribute:(axis:"horizontal"|"vertical")=>void;
  openTheme:()=>void; openVariants:()=>void; openInspector:()=>void; openLayers:()=>void;
  openHistory:()=>void; openAnimations:()=>void; openExpert:()=>void; present:()=>void;
  toggleSlideRail:()=>void; slideRailVisible:boolean; grid:number; setGrid:(n:number)=>void;
};
type Props={ document:SlideDocument; selectedIds:string[]; htmlSelection?:HtmlSelectionInfo|null;
  nativeRange?:TextSelectionRange|null;
  onChange:(document:SlideDocument,key?:string)=>void; actions:Actions };
const fonts=[
  ["Arial, sans-serif","Arial"],["Georgia, serif","Georgia"],["Inter, sans-serif","Inter"],
  ["Helvetica, sans-serif","Helvetica"],["Times New Roman, serif","Times New Roman"],
  ["Verdana, sans-serif","Verdana"],["Montserrat, sans-serif","Montserrat"],
  ["Trebuchet MS, sans-serif","Trebuchet MS"],["Tahoma, sans-serif","Tahoma"],
  ["Garamond, serif","Garamond"],["Courier New, monospace","Courier New"],
  ["Palatino Linotype, serif","Palatino"],["Impact, sans-serif","Impact"],
  ["Roboto, sans-serif","Roboto"],["Open Sans, sans-serif","Open Sans"]
] as const;
export function SlidesChrome({document:doc,selectedIds,htmlSelection,nativeRange,onChange,actions:a}:Props){
  const selected=doc.elements.filter(e=>selectedIds.includes(e.id));
  const text=selected.find(e=>e.type==="text"||(e.type==="shape"&&!!e.text));
  const first=selected[0];
  const hasText=selected.some(e=>e.type==="text"||(e.type==="shape"&&!!e.text))||!!htmlSelection?.text;
  const hasAny=selected.length>0||!!htmlSelection;
  const selectedRun=(()=>{
    if(!nativeRange||!text||text.id!==nativeRange.id||!text.textRuns?.length)return null;
    let index=0;
    for(const run of text.textRuns){
      const end=index+run.text.length;
      if(nativeRange.start<end&&nativeRange.end>index)return run.styles;
      index=end;
    }
    return null;
  })();
  const activeStyle=htmlSelection?.styles??(selectedRun?{...text?.styles,...selectedRun}:text?.styles)??{};
  const bold=/(?:bold|[6-9]00)/i.test(String(activeStyle.fontWeight??""));
  const [sizeDraft,setSizeDraft]=useState<string|null>(null);
  const chromeRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    // Only one dropdown can be open; clicking anywhere else closes it.
    const root=chromeRef.current;
    if(!root)return;
    const closeAll=(except?:HTMLDetailsElement)=>{
      for(const details of Array.from(root.querySelectorAll<HTMLDetailsElement>("details[open]"))){
        if(details!==except)details.open=false;
      }
    };
    const toggle=(event:Event)=>{
      const details=event.target;
      if(details instanceof HTMLDetailsElement&&root.contains(details)&&details.open)
        closeAll(details);
    };
    const outside=(event:PointerEvent)=>{
      if(!(event.target instanceof Element)||!event.target.closest(".singe-google-chrome details"))
        closeAll();
    };
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape")closeAll();};
    document.addEventListener("toggle",toggle,true);
    document.addEventListener("pointerdown",outside,true);
    document.addEventListener("keydown",key,true);
    return()=>{
      document.removeEventListener("toggle",toggle,true);
      document.removeEventListener("pointerdown",outside,true);
      document.removeEventListener("keydown",key,true);
    };
  },[]);
  function style(prop:string,value:string|number,onlyText=false){
    if(!hasAny)return;
    const ids=new Set(selectedIds);
    const rangeActive=onlyText&&nativeRange&&nativeRange.start<nativeRange.end&&
      selectedIds.length===1&&selectedIds[0]===nativeRange.id;
    if(rangeActive)a.nativeTextStyle(prop,String(value));
    else if(selected.length)onChange({...doc,elements:doc.elements.map(e=>ids.has(e.id)&&!e.locked&&
      (!onlyText||e.type==="text"||e.type==="shape"&&!!e.text)
      ?{...e,styles:{...e.styles,[prop]:value}}:e)},"style-"+prop);
    if(htmlSelection)a.htmlStyle(prop,String(value));
  }
  const colorValue=(candidate:unknown,fallback:string)=>typeof candidate==="string"&&/^#[0-9a-f]{6}$/i.test(candidate)?candidate:fallback;
  const numberSize=Math.max(6,parseInt(String(activeStyle.fontSize??"48"),10)||48);
  return <div ref={chromeRef} className="singe-google-chrome" role="region" aria-label="Outils de présentation">
    <div className="singe-formatbar" role="toolbar" aria-label="Mise en forme rapide"
      onMouseDownCapture={e=>{
        // Formatting buttons must not collapse a selected word in the canvas.
        const target=e.target instanceof HTMLElement?e.target:null;
        if(target?.closest("button")&&!target.closest(".shape-picker-menu"))e.preventDefault();
      }}>
      <div className="singe-format-group">
        <button title="Annuler" onClick={()=>{setSizeDraft(null);a.undo();}} disabled={!a.canUndo} aria-label="Annuler">↶</button>
        <button title="Rétablir" onClick={()=>{setSizeDraft(null);a.redo();}} disabled={!a.canRedo} aria-label="Rétablir">↷</button>
        <button title="Afficher ou masquer les diapositives" onClick={a.toggleSlideRail}>▤</button>
        <button title="Nouvelle diapositive" onClick={a.addSlide}>＋</button>
        <details className="singe-layout-picker">
          <summary title="Nouvelle diapositive avec disposition" aria-label="Choisir la disposition de la nouvelle diapositive">▾</summary>
          <div className="singe-layout-grid">
            {SLIDE_LAYOUTS.map(l=><button type="button" key={l.id} onClick={e=>{
              a.newSlideWithLayout(l.id);e.currentTarget.closest("details")?.removeAttribute("open");
            }} title={l.description}>
              <span className="singe-layout-mini" aria-hidden="true">
                {layoutPreviewSlots(l.id).map((slot,index)=><i key={index}
                  className={"singe-layout-mini-slot"+(slot.name.startsWith("Carte")?" is-card":"")}
                  style={{left:slot.x*100+"%",top:slot.y*100+"%",
                    width:slot.w*100+"%",height:slot.h*100+"%"}}/>)}
              </span>
              <span>{l.name}</span>
            </button>)}
          </div>
        </details>
      </div>
      <div className="singe-format-group">
        <button title="Insérer du texte" onClick={a.addText}>T</button>
        <button title="Importer une image" onClick={a.addImage}>▧</button>
        <ShapePicker onPick={a.addShape} label="▢"/>
        <button title="Changer de thème" onClick={a.openTheme}>◐</button>
      </div>
      <div className="singe-format-group singe-text-tools">
        <select aria-label="Police" disabled={!hasText}
          value={fonts.some(item=>item[0]===String(activeStyle.fontFamily))?String(activeStyle.fontFamily):String(activeStyle.fontFamily??"Arial, sans-serif")}
          onChange={e=>style("fontFamily",e.target.value,true)}>
          {!fonts.some(item=>item[0]===String(activeStyle.fontFamily))&&activeStyle.fontFamily&&
            <option value={String(activeStyle.fontFamily)}>{String(activeStyle.fontFamily)}</option>}
          {fonts.map(([value,label])=><option value={value} key={value}>{label}</option>)}
        </select>
        <input aria-label="Taille de police" title="Taille de police" type="number" min="6" max="600"
          disabled={!hasText} value={sizeDraft??String(numberSize)}
          onFocus={()=>setSizeDraft(String(numberSize))}
          onChange={e=>{
            setSizeDraft(e.target.value);
            const number=Number(e.target.value);
            if(e.target.value.trim()&&Number.isFinite(number)&&number>=6)
              style("fontSize",Math.max(6,Math.min(600,number))+"px",true);
          }}
          onBlur={()=>setSizeDraft(null)}
          onKeyDown={e=>{
            if((e.ctrlKey||e.metaKey)&&["z","y"].includes(e.key.toLowerCase()))
              setSizeDraft(null);
            if(e.key==="Enter"){e.preventDefault();e.currentTarget.blur();}
            if(e.key==="Escape"){setSizeDraft(null);e.currentTarget.blur();}
          }}/>
        <button title="Gras" aria-pressed={bold} disabled={!hasText}
          onClick={()=>style("fontWeight",bold?"normal":"bold",true)}><strong>G</strong></button>
        <button title="Italique" aria-pressed={activeStyle.fontStyle==="italic"} disabled={!hasText}
          onClick={()=>style("fontStyle",activeStyle.fontStyle==="italic"?"normal":"italic",true)}><em>I</em></button>
        <button title="Souligné" aria-pressed={activeStyle.textDecoration==="underline"} disabled={!hasText}
          onClick={()=>style("textDecoration",activeStyle.textDecoration==="underline"?"none":"underline",true)}><u>S</u></button>
        <ColorPalette label="A" title="Couleur du texte" value={colorValue(activeStyle.color,"#202124")}
          onChange={value=>style("color",value,true)}/>
        <ColorPalette label="▰" title="Surlignage du texte" value={colorValue(activeStyle.backgroundColor,"#ffffff")}
          onChange={value=>style("backgroundColor",value,true)} allowTransparent/>
        <button title="Aligner à gauche" disabled={!hasText} onClick={()=>style("textAlign","left",true)}>☰</button>
        <button title="Centrer" disabled={!hasText} onClick={()=>style("textAlign","center",true)}>≡</button>
        <button title="Aligner à droite" disabled={!hasText} onClick={()=>style("textAlign","right",true)}>☷</button>
        <select aria-label="Interligne" title="Interligne" disabled={!hasText} value={String(activeStyle.lineHeight??"1.2")}
          onChange={e=>style("lineHeight",e.target.value,true)}>
          <option value="1">1,0</option><option value="1.2">1,2</option>
          <option value="1.5">1,5</option><option value="2">2,0</option>
        </select>
      </div>
      {(first&&!hasText||htmlSelection&&!hasText)&&<div className="singe-format-group">
        <ColorPalette label="▰" title="Couleur de remplissage"
          value={colorValue(activeStyle.backgroundColor??first?.styles.backgroundColor,"#a4bdac")}
          onChange={value=>style("backgroundColor",value)} allowTransparent/>
      </div>}
      {(selected.some(e=>e.type==="shape")||htmlSelection)&&<div className="singe-format-group">
        <ColorPalette label="▢" title="Couleur du contour"
          value={colorValue(activeStyle.borderColor,"#202124")}
          onChange={value=>{style("borderStyle","solid");style("borderColor",value);}}/>
        <select aria-label="Épaisseur du contour" title="Épaisseur du contour"
          value={String(activeStyle.borderWidth??"0px")}
          onChange={e=>{style("borderStyle","solid");style("borderWidth",e.target.value);}}>
          {["0px","1px","2px","3px","4px","6px","8px","12px"].map(n=><option key={n} value={n}>{n}</option>)}
        </select>
      </div>}
      <div className="singe-format-spacer"/>
      <div className="singe-format-group">
        <button title="Animations" onClick={a.openAnimations}>◷</button>
        <button title="Variantes IA" onClick={a.openVariants} className="singe-ia-button">✦ Variantes</button>
        <button title="Panneau des propriétés" onClick={a.openInspector}>⚙</button>
      </div>
    </div>
  </div>;
}
