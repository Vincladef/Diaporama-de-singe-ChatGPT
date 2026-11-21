import type { ReactNode } from "react";
import type { SlideDocument, SlideElement } from "../domain/slide";
import { ShapePicker, type ShapePreset } from "./ShapePicker";
import { SLIDE_LAYOUTS, type LayoutId } from "./slideLayouts";

type Arrange="front"|"back"|"forward"|"backward";
type Align="left"|"center"|"right"|"top"|"middle"|"bottom";
type Actions={
  addSlide:()=>void; duplicateSlide:()=>void; deleteSlide:()=>void;
  layout:(id:LayoutId)=>void; newSlideWithLayout:(id:LayoutId)=>void; addText:()=>void; addImage:()=>void; addShape:(preset:ShapePreset)=>void;
  undo:()=>void; redo:()=>void; canUndo:boolean; canRedo:boolean;
  save:()=>void; import:()=>void; export:()=>void;
  copy:()=>void; paste:()=>void; duplicate:()=>void; remove:()=>void;
  group:()=>void; ungroup:()=>void; arrange:(direction:Arrange)=>void;
  align:(kind:Align)=>void; distribute:(axis:"horizontal"|"vertical")=>void;
  openTheme:()=>void; openVariants:()=>void; openInspector:()=>void; openLayers:()=>void;
  openHistory:()=>void; openAnimations:()=>void; openExpert:()=>void; present:()=>void;
  toggleSlideRail:()=>void; slideRailVisible:boolean; grid:number; setGrid:(n:number)=>void;
};
type Props={ document:SlideDocument; selectedIds:string[];
  onChange:(document:SlideDocument,key?:string)=>void; actions:Actions };
const palette=["#202124","#ffffff","#d93025","#f9ab00","#188038","#1a73e8","#9334e6","#70757a"];
const fonts=[
  ["Arial, sans-serif","Arial"],["Georgia, serif","Georgia"],["Inter, sans-serif","Inter"],
  ["Helvetica, sans-serif","Helvetica"],["Times New Roman, serif","Times New Roman"],
  ["Verdana, sans-serif","Verdana"],["Montserrat, sans-serif","Montserrat"]
] as const;
function Menu({title,children}: {title:string;children:ReactNode}){
  return <details className="singe-top-menu">
    <summary>{title}</summary><div className="singe-top-menu-popup"
      onClick={e=>(e.target as HTMLElement).closest("button")?.closest("details")?.removeAttribute("open")}>
      {children}
    </div>
  </details>;
}
function Action({children,onClick,disabled=false}:{
  children:ReactNode;onClick:()=>void;disabled?:boolean
}){return <button type="button" onClick={onClick} disabled={disabled}>{children}</button>;}
export function SlidesChrome({document:doc,selectedIds,onChange,actions:a}:Props){
  const selected=doc.elements.filter(e=>selectedIds.includes(e.id));
  const text=selected.find(e=>e.type==="text");
  const first=selected[0];
  const hasText=selected.some(e=>e.type==="text");
  const hasAny=selected.length>0;
  const activeStyle=text?.styles??{};
  function style(prop:string,value:string|number,onlyText=false){
    if(!hasAny)return;
    const ids=new Set(selectedIds);
    onChange({...doc,elements:doc.elements.map(e=>ids.has(e.id)&&!e.locked&&(!onlyText||e.type==="text")
      ?{...e,styles:{...e.styles,[prop]:value}}:e)},"style-"+prop);
  }
  const colorValue=(candidate:unknown,fallback:string)=>typeof candidate==="string"&&/^#[0-9a-f]{6}$/i.test(candidate)?candidate:fallback;
  const numberSize=Math.max(6,parseInt(String(activeStyle.fontSize??"48"),10)||48);
  return <div className="singe-google-chrome" role="region" aria-label="Menus et outils de présentation">
    <nav className="singe-menubar" aria-label="Menus principaux">
      <Menu title="Fichier">
        <Action onClick={a.save}>Enregistrer · Ctrl+S</Action>
        <Action onClick={a.import}>Importer une présentation</Action>
        <Action onClick={a.export}>Exporter</Action>
      </Menu>
      <Menu title="Édition">
        <Action onClick={a.undo} disabled={!a.canUndo}>Annuler · Ctrl+Z</Action>
        <Action onClick={a.redo} disabled={!a.canRedo}>Rétablir · Ctrl+Y</Action>
        <Action onClick={a.copy} disabled={!hasAny}>Copier · Ctrl+C</Action>
        <Action onClick={a.paste}>Coller · Ctrl+V</Action>
        <Action onClick={a.duplicate} disabled={!hasAny}>Dupliquer · Ctrl+D</Action>
        <Action onClick={a.remove} disabled={!hasAny}>Supprimer</Action>
      </Menu>
      <Menu title="Affichage">
        <Action onClick={a.toggleSlideRail}>{a.slideRailVisible?"Masquer":"Afficher"} les diapositives</Action>
        <Action onClick={()=>a.setGrid(a.grid?0:10)}>{a.grid?"Désactiver":"Activer"} l'alignement magnétique</Action>
        <Action onClick={a.openInspector}>Afficher les propriétés</Action>
        <Action onClick={a.present}>Lancer la présentation</Action>
      </Menu>
      <Menu title="Insertion">
        <Action onClick={a.addText}>Zone de texte</Action>
        <Action onClick={a.addImage}>Image</Action>
        <Action onClick={a.addSlide}>Nouvelle diapositive</Action>
      </Menu>
      <Menu title="Format">
        <Action onClick={()=>style("fontWeight",activeStyle.fontWeight==="bold"?"normal":"bold",true)} disabled={!hasText}>Gras</Action>
        <Action onClick={()=>style("fontStyle",activeStyle.fontStyle==="italic"?"normal":"italic",true)} disabled={!hasText}>Italique</Action>
        <Action onClick={()=>style("textDecoration",activeStyle.textDecoration==="underline"?"none":"underline",true)} disabled={!hasText}>Souligner</Action>
        <Action onClick={()=>style("textAlign","left",true)} disabled={!hasText}>Aligner à gauche</Action>
        <Action onClick={()=>style("textAlign","center",true)} disabled={!hasText}>Centrer</Action>
        <Action onClick={()=>style("textAlign","right",true)} disabled={!hasText}>Aligner à droite</Action>
      </Menu>
      <Menu title="Diapositive">
        <Action onClick={a.addSlide}>Nouvelle diapositive</Action>
        <Action onClick={a.duplicateSlide}>Dupliquer la diapositive</Action>
        <Action onClick={a.deleteSlide}>Supprimer la diapositive</Action>
        <Action onClick={a.openTheme}>Modifier le thème</Action>
        {SLIDE_LAYOUTS.map(l=><Action key={"new-"+l.id} onClick={()=>a.newSlideWithLayout(l.id)}>Nouvelle : {l.name}</Action>)}
        {SLIDE_LAYOUTS.map(l=><Action key={"apply-"+l.id} onClick={()=>a.layout(l.id)}>Appliquer : {l.name}</Action>)}
      </Menu>
      <Menu title="Réorganiser">
        <Action onClick={a.group} disabled={selected.length<2}>Grouper</Action>
        <Action onClick={a.ungroup} disabled={!selected.some(e=>e.groupId)}>Dégrouper</Action>
        <Action onClick={()=>a.arrange("front")} disabled={!hasAny}>Mettre au premier plan</Action>
        <Action onClick={()=>a.arrange("back")} disabled={!hasAny}>Mettre à l'arrière-plan</Action>
        <Action onClick={()=>a.align("left")} disabled={selected.length<2}>Aligner à gauche</Action>
        <Action onClick={()=>a.align("center")} disabled={selected.length<2}>Centrer horizontalement</Action>
        <Action onClick={()=>a.align("top")} disabled={selected.length<2}>Aligner en haut</Action>
        <Action onClick={()=>a.distribute("horizontal")} disabled={selected.length<3}>Répartir horizontalement</Action>
        <Action onClick={()=>a.distribute("vertical")} disabled={selected.length<3}>Répartir verticalement</Action>
      </Menu>
      <Menu title="Outils">
        <Action onClick={a.openLayers}>Calques</Action>
        <Action onClick={a.openHistory}>Historique</Action>
        <Action onClick={a.openAnimations}>Animations</Action>
        <Action onClick={a.openExpert}>Éditeur HTML / CSS</Action>
      </Menu>
      <Menu title="IA">
        <Action onClick={a.openVariants}>Variantes A / B / C</Action>
        <Action onClick={a.openTheme}>Thèmes visuels</Action>
      </Menu>
    </nav>
    <div className="singe-formatbar" role="toolbar" aria-label="Mise en forme rapide">
      <div className="singe-format-group">
        <button title="Annuler" onClick={a.undo} disabled={!a.canUndo} aria-label="Annuler">↶</button>
        <button title="Rétablir" onClick={a.redo} disabled={!a.canRedo} aria-label="Rétablir">↷</button>
        <button title="Afficher ou masquer les diapositives" onClick={a.toggleSlideRail}>▤</button>
        <button title="Nouvelle diapositive" onClick={a.addSlide}>＋</button>
        <details className="singe-layout-picker">
          <summary title="Choisir une disposition">Disposition ▾</summary>
          <div className="singe-layout-grid">
            {SLIDE_LAYOUTS.map(l=><button type="button" key={l.id} onClick={e=>{
              a.layout(l.id);e.currentTarget.closest("details")?.removeAttribute("open");
            }} title={l.description}>
              <span className={"singe-layout-mini layout-"+l.id} aria-hidden="true"><i/><i/><i/></span>
              <span>{l.name}</span>
            </button>)}
          </div>
        </details>
      </div>
      <div className="singe-format-group">
        <button title="Insérer du texte" onClick={a.addText}>T</button>
        <button title="Importer une image" onClick={a.addImage}>▧</button>
        <ShapePicker onPick={a.addShape}/>
        <button title="Changer de thème" onClick={a.openTheme}>◐</button>
      </div>
      <div className="singe-format-group singe-text-tools">
        <select aria-label="Police" disabled={!hasText}
          value={String(activeStyle.fontFamily??"Arial, sans-serif")}
          onChange={e=>style("fontFamily",e.target.value,true)}>
          {fonts.map(([value,label])=><option value={value} key={value}>{label}</option>)}
        </select>
        <input aria-label="Taille de police" title="Taille de police" type="number" min="6" max="600"
          disabled={!hasText} value={numberSize} onChange={e=>style("fontSize",String(Math.max(6,Math.min(600,Number(e.target.value)||6)))+"px",true)}/>
        <button title="Gras" aria-pressed={activeStyle.fontWeight==="bold"} disabled={!hasText}
          onClick={()=>style("fontWeight",activeStyle.fontWeight==="bold"?"normal":"bold",true)}><strong>G</strong></button>
        <button title="Italique" aria-pressed={activeStyle.fontStyle==="italic"} disabled={!hasText}
          onClick={()=>style("fontStyle",activeStyle.fontStyle==="italic"?"normal":"italic",true)}><em>I</em></button>
        <button title="Souligné" aria-pressed={activeStyle.textDecoration==="underline"} disabled={!hasText}
          onClick={()=>style("textDecoration",activeStyle.textDecoration==="underline"?"none":"underline",true)}><u>S</u></button>
        <label className="singe-color" title="Couleur du texte"><span>A</span>
          <input aria-label="Couleur du texte" type="color" disabled={!hasText}
            value={colorValue(activeStyle.color,"#202124")} onChange={e=>style("color",e.target.value,true)}/>
        </label>
        <label className="singe-color" title="Surlignage de la zone"><span>▰</span>
          <input aria-label="Surlignage de la zone" type="color" disabled={!hasText}
            value={colorValue(activeStyle.backgroundColor,"#ffffff")}
            onChange={e=>style("backgroundColor",e.target.value,true)}/>
        </label>
        <button title="Aligner à gauche" disabled={!hasText} onClick={()=>style("textAlign","left",true)}>☰</button>
        <button title="Centrer" disabled={!hasText} onClick={()=>style("textAlign","center",true)}>≡</button>
        <button title="Aligner à droite" disabled={!hasText} onClick={()=>style("textAlign","right",true)}>☷</button>
        <select aria-label="Interligne" title="Interligne" disabled={!hasText} value={String(activeStyle.lineHeight??"1.2")}
          onChange={e=>style("lineHeight",e.target.value,true)}>
          <option value="1">1,0</option><option value="1.2">1,2</option>
          <option value="1.5">1,5</option><option value="2">2,0</option>
        </select>
      </div>
      {first&&!hasText&&<div className="singe-format-group">
        <label className="singe-color" title="Couleur de remplissage"><span>▰</span>
          <input type="color" aria-label="Remplissage" value={colorValue(first.styles.backgroundColor,"#a4bdac")}
            onChange={e=>style("backgroundColor",e.target.value)}/>
        </label>
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
