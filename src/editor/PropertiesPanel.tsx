import { useState, type KeyboardEvent } from "react";
import type { SlideDocument, SlideElement } from "../domain/slide";
import { elementBox } from "./geometry";
import { cropCoordinates, changeFilter, readFilter, type ImageFilterKey } from "../images/edit";
import {ShapePicker,type ShapePreset} from "./ShapePicker";

export type InspectorTab = "design" | "layers" | "html" | "css";
type Props = {
  document: SlideDocument;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onChange: (doc: SlideDocument, key?: string) => void;
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  onAdd: (type:"text"|"image"|"shape") => void;
  onAddShape?: (preset:ShapePreset)=>void;
  onDelete: () => void;
  onArrange: (direction:"front"|"back"|"forward"|"backward") => void;
  onOpenImages?: () => void;
  onGroup?: (mode:"group"|"ungroup")=>void;
};
const cleanHex = (value:unknown, defaultValue:string) => typeof value === "string" && /^#[a-f\d]{6}$/i.test(value) ? value : defaultValue;
const numeric = (input:string, fallback:number) => Number.isFinite(Number(input)) ? Number(input) : fallback;

function indentCode(e:KeyboardEvent<HTMLTextAreaElement>,apply:(value:string)=>void){
  if(e.key!=="Tab"||e.shiftKey)return;
  e.preventDefault();
  const el=e.currentTarget,start=el.selectionStart,end=el.selectionEnd;
  const next=el.value.slice(0,start)+"  "+el.value.slice(end);
  apply(next);
  window.requestAnimationFrame(()=>{if(el.isConnected)el.setSelectionRange(start+2,start+2);});
}
export function PropertiesPanel({document:doc,selectedIds,onSelect,onChange,tab,onTabChange,onAdd,onDelete,onArrange,onOpenImages,onGroup,onAddShape}:Props) {
  const [expandedCode,setExpandedCode]=useState<{type:"html"|"css";value:string}|null>(null);
  const [layerQuery,setLayerQuery]=useState("");
  const [renamingId,setRenamingId]=useState<string|null>(null);
  const title=(el:SlideElement)=>el.name || (el.type==="text"?
    (el.text?.trim().slice(0,42)||"Texte sans titre"):
    el.type==="image"?"Photographie":el.type==="shape"?"Forme":
    el.type==="svg"?"Dessin vectoriel":"Groupe");
  const layers=[...doc.elements].reverse().filter(el=>
    (title(el)+" "+(el.groupName??"")).toLowerCase().includes(layerQuery.toLowerCase()));
  const selected=selectedIds.length===1 ? doc.elements.find(e=>e.id===selectedIds[0]) : undefined;
  const box=selected ? elementBox(selected,doc) : undefined;

  function patchStyle(property:string,value:string|number) {
    if (!selected || selected.locked) return;
    onChange({...doc,elements:doc.elements.map(e=>e.id===selected.id?{...e,styles:{...e.styles,[property]:value}}:e)},"style-"+property);
  }
  function patchObject(changes:Partial<SlideElement>) {
    if (!selected) return;
    onChange({...doc,elements:doc.elements.map(e=>e.id===selected.id?{...e,...changes}:e)},"object");
  }
  function patchMany(property:string,value:string|number,types?:SlideElement["type"][]){
    const ids=new Set(selectedIds);
    onChange({...doc,elements:doc.elements.map(el=>
      ids.has(el.id)&&!el.locked&&(!types||types.includes(el.type))
      ?{...el,styles:{...el.styles,[property]:value}}:el)},"style-"+property);
  }
  function layerPatch(id:string,changes:Partial<SlideElement>){
    onChange({...doc,elements:doc.elements.map(el=>el.id===id?{...el,...changes}:el)},"layer-meta");
  }
  function updateHtml(type:"html"|"css",value:string) {
    const freeform={html:doc.freeform?.html??"",css:doc.freeform?.css??"",[type]:value};
    onChange({...doc,freeform,mode:doc.elements.length?"hybrid":"freeform"},"code-"+type);
  }
  function reorder(moving:string, target:string) {
    if (moving===target) return;
    const list=[...doc.elements];
    const from=list.findIndex(e=>e.id===moving),to=list.findIndex(e=>e.id===target);
    if(from<0||to<0)return;
    const [item]=list.splice(from,1);
    list.splice(to,0,item!);
    onChange({...doc,elements:list},"layers");
  }
  function coordinate(name:"left"|"top"|"width"|"height",label:string,value:number) {
    return <label key={name}>{label}<input type="number" inputMode="decimal" value={Math.round(value)}
      onChange={e=>patchStyle(name,numeric(e.target.value,0)+"px")}/></label>;
  }
  const panel=tab==="design";
  return (
    <aside className="inspector">
      <div className="inspector-heading">Mise en page</div>
      <div className="editor-tabs" role="tablist" aria-label="Outils de modification">
        {([["design","Design"],["layers","Calques"],["html","HTML"],["css","CSS"]] as const).map(([id,name])=>
          <button key={id} role="tab" aria-selected={tab===id} className={tab===id?"current":""} onClick={()=>onTabChange(id)}>{name}</button>)}
      </div>
      {panel && <div className="property-panel">
        <div className="property-group">
          <span className="property-group-title">Insérer</span>
          <div className="object-buttons">
            <button onClick={()=>onAdd("text")}>+ Texte</button>
            <button onClick={()=>onAdd("image")}>+ Image</button>
            {onAddShape?<ShapePicker onPick={onAddShape}/>:<button onClick={()=>onAdd("shape")}>+ Forme</button>}
          </div>
        </div>
        {selected ? <>
          <div className="property-group">
            <label>Nom du calque
              <input aria-label="Nom du calque sélectionné" value={selected.name??""}
                placeholder={title(selected)} maxLength={140}
                onChange={e=>patchObject({name:e.target.value})}/>
            </label>
            <div className="property-actions">
              <button onClick={()=>patchObject({hidden:!selected.hidden})}>
                {selected.hidden?"Afficher":"Masquer"}
              </button>
              <button onClick={()=>patchObject({locked:!selected.locked})}>
                {selected.locked?"Déverrouiller":"Verrouiller"}
              </button>
              {selected.groupId&&<button onClick={()=>onGroup?.("ungroup")}>Dégrouper</button>}
            </div>
          </div>
          <div className="property-group">
            <div className="property-heading"><strong>{selected.type==="text"?"Texte":selected.type==="image"?"Image":selected.type==="shape"?"Forme":selected.type}</strong><small>{selected.id.slice(0,8)}</small></div>
            {selected.type==="text" && <label>Contenu du texte
              <textarea rows={3} value={selected.text??""} onChange={e=>patchObject({text:e.target.value})}/>
            </label>}
            {selected.type==="image" && <>
              <button type="button" className="primary" onClick={onOpenImages}>Remplacer avec un fichier</button>
              <small>Vous pouvez aussi coller une image avec Ctrl+V dans l'éditeur.</small>
              <label>Description accessible de l'image
                <input type="text" maxLength={350} value={selected.alt??""}
                  placeholder="Décrire l'information portée par l'image"
                  onChange={e=>patchObject({alt:e.target.value})}/>
              </label>
            </>}
            <div className="property-coordinates">
              {box && coordinate("left","X",box.x)}
              {box && coordinate("top","Y",box.y)}
              {box && coordinate("width","Largeur",box.w)}
              {box && coordinate("height","Hauteur",box.h)}
            </div>
          </div>
          <div className="property-group">
            <span className="property-group-title">Apparence</span>
            {selected.type==="text" && <>
              <label>Police
                <select value={String(selected.styles.fontFamily??"Arial, sans-serif")} onChange={e=>patchStyle("fontFamily",e.target.value)}>
                  <option value="Arial, sans-serif">Arial</option><option value="Georgia, serif">Georgia</option>
                  <option value="Inter, sans-serif">Inter</option><option value="Helvetica, sans-serif">Helvetica</option>
                  <option value="Times New Roman, serif">Times New Roman</option><option value="Verdana, sans-serif">Verdana</option>
                  <option value="Montserrat, sans-serif">Montserrat</option>
                </select>
              </label>
              <div className="property-coordinates">
                <label>Taille <input type="number" min={6} max={600} value={parseFloat(String(selected.styles.fontSize??"80"))||80}
                  onChange={e=>patchStyle("fontSize",Math.max(6,numeric(e.target.value,80))+"px")}/></label>
                <label>Couleur <input type="color" aria-label="Couleur du texte" value={cleanHex(selected.styles.color,"#1c3225")}
                  onChange={e=>patchStyle("color",e.target.value)}/></label>
              </div>
              <div className="property-actions">
                <button aria-label="Gras" aria-pressed={selected.styles.fontWeight==="bold"} className={selected.styles.fontWeight==="bold"?"selected":""}
                  onClick={()=>patchStyle("fontWeight",selected.styles.fontWeight==="bold"?"normal":"bold")}><strong>B</strong></button>
                <button aria-label="Italique" aria-pressed={selected.styles.fontStyle==="italic"} className={selected.styles.fontStyle==="italic"?"selected":""}
                  onClick={()=>patchStyle("fontStyle",selected.styles.fontStyle==="italic"?"normal":"italic")}><em>I</em></button>
                <button aria-label="Aligner à gauche" className={selected.styles.textAlign==="left"?"selected":""} onClick={()=>patchStyle("textAlign","left")}>☰</button>
                <button aria-label="Centrer le texte" className={selected.styles.textAlign==="center"?"selected":""} onClick={()=>patchStyle("textAlign","center")}>≡</button>
                <button aria-label="Aligner à droite" className={selected.styles.textAlign==="right"?"selected":""} onClick={()=>patchStyle("textAlign","right")}>☷</button>
              </div>
            </>}
            {selected.type!=="text" && <label>Couleur de remplissage
              <input aria-label="Couleur de remplissage" type="color" value={cleanHex(selected.styles.backgroundColor,"#a4bdac")}
                onChange={e=>patchStyle("backgroundColor",e.target.value)}/>
            </label>}
            {selected.type==="shape"&&<ShapePicker label="Changer de forme" onPick={preset=>
              patchObject({name:preset.name,styles:{...selected.styles,clipPath:preset.clipPath??"none",
                borderRadius:preset.radius??"0px",
                ...(preset.width?{width:preset.width+"px"}:{}),
                ...(preset.height?{height:preset.height+"px"}:{})}})}/>}
            {selected.type==="shape" && <label>Angles arrondis (px)
              <input type="number" min="0" max="1000" value={parseFloat(String(selected.styles.borderRadius??"0"))||0}
                onChange={e=>patchStyle("borderRadius",Math.max(0,numeric(e.target.value,0))+"px")}/></label>}
            {selected.type==="image" && <>
              <label>Recadrage
                <select value={String(selected.styles.objectFit??"cover")} onChange={e=>patchStyle("objectFit",e.target.value)}>
                  <option value="cover">Remplir sans déformer</option><option value="contain">Image entière</option><option value="fill">Étirer</option>
                </select>
              </label>
              {(["x","y"] as const).map(axis=>{
                const current=cropCoordinates(selected.styles.objectPosition);
                return <label key={axis}>Cadrage {axis==="x"?"horizontal":"vertical"} ({current[axis]} %)
                  <input type="range" min="0" max="100" value={current[axis]}
                    onChange={e=>patchStyle("objectPosition",
                      (axis==="x"?e.target.value:current.x)+"% "+(axis==="y"?e.target.value:current.y)+"%")}/>
                </label>;
              })}
              {([
                ["brightness","Luminosité",0,200],
                ["contrast","Contraste",0,200],
                ["saturate","Saturation",0,200],
                ["grayscale","Noir et blanc",0,100],
                ["blur","Flou",0,20],
              ] as [ImageFilterKey,string,number,number][]).map(([key,label,min,max])=><label key={key}>
                {label} ({readFilter(selected.styles.filter,key)} {key==="blur"?"px":"%"})
                <input type="range" min={min} max={max} value={readFilter(selected.styles.filter,key)}
                  onChange={e=>patchStyle("filter",changeFilter(selected.styles.filter,key,Number(e.target.value)))}/>
              </label>)}
              <label>Rotation (degrés)
                <input type="number" min="-180" max="180"
                  value={Number(String(selected.styles.transform??"").match(/rotate\((-?\d+(?:\.\d+)?)deg\)/)?.[1]??0)}
                  onChange={e=>patchStyle("transform","rotate("+Math.max(-180,Math.min(180,Number(e.target.value)||0))+"deg)")}/>
              </label>
              <button className="subtle-btn" onClick={()=>patchStyle("filter","")}>Réinitialiser les réglages photo</button>
            </>}
            <label>Opacité ({Math.round(Number(selected.styles.opacity??1)*100)} %)
              <input type="range" min="0" max="100" value={Math.round(Number(selected.styles.opacity??1)*100)}
                onChange={e=>patchStyle("opacity",Math.max(0,Math.min(100,numeric(e.target.value,100)))/100)}/>
            </label>
          </div>
          <div className="property-group">
            <span className="property-group-title">Disposition</span>
            <div className="property-actions"><button onClick={()=>onArrange("front")}>Tout devant</button><button onClick={()=>onArrange("back")}>Tout derrière</button></div>
            <button onClick={onDelete} className="subtle-btn danger-text">Supprimer la sélection</button>
          </div>
        </> : selectedIds.length>1 ? <div className="property-group">
          <strong>{selectedIds.length} calques sélectionnés</strong>
          <p className="field-help">Les réglages communs s'appliquent aux calques déverrouillés.</p>
          <div className="property-actions">
            <button onClick={()=>onGroup?.("group")}>Grouper</button>
            <button onClick={()=>onGroup?.("ungroup")}>Dégrouper</button>
            <button onClick={onDelete}>Supprimer</button>
          </div>
          <label>Couleur des textes
            <input type="color" aria-label="Couleur commune des textes" defaultValue="#24362b"
              onChange={e=>patchMany("color",e.target.value,["text"])}/>
          </label>
          <label>Opacité commune
            <input type="range" min={0} max={100} defaultValue={100}
              aria-label="Opacité commune" onChange={e=>patchMany("opacity",Number(e.target.value)/100)}/>
          </label>
        </div> :
          <div className="property-empty"><strong>Choisis un élément sur la diapositive.</strong>
            <p>Déplace-le avec la souris, utilise les poignées pour modifier sa taille, ou double-clique sur un texte pour l'éditer.</p>
            {doc.mode!=="structured"&&<p>Le HTML/CSS libre est conservé en arrière-plan. Ses objets ne sont pas automatiquement convertis en calques.</p>}
          </div>}
      </div>}
      {tab==="layers" && <div className="property-panel">
        <div className="property-group-title">Calques · {doc.elements.length}</div>
        <label>Rechercher un calque
          <input type="search" placeholder="Titre, photo, groupe…"
            aria-label="Rechercher dans les calques" value={layerQuery}
            onChange={e=>setLayerQuery(e.target.value)}/>
        </label>
        <p className="field-help">Glisser pour changer l'ordre. Masquez ou verrouillez les objets avec les icônes.</p>
        <div className="layer-list">
          {layers.map(el=><div className={"layer-row"+(selectedIds.includes(el.id)?" selected":"")}
            key={el.id} draggable
            onDragStart={ev=>{ev.dataTransfer.setData("text/x-singe-layer",el.id);ev.dataTransfer.effectAllowed="move";}}
            onDragOver={ev=>ev.preventDefault()}
            onDrop={ev=>{ev.preventDefault();const moving=ev.dataTransfer.getData("text/x-singe-layer");if(moving)reorder(moving,el.id);}}>
            <button className="layer-select" title={title(el)}
              onClick={ev=>onSelect(ev.shiftKey?
                (selectedIds.includes(el.id)?selectedIds.filter(id=>id!==el.id):[...selectedIds,el.id]):[el.id])}>
              <span className="layer-icon">{el.type==="text"?"T":el.type==="image"?"▧":el.type==="shape"?"□":"◇"}</span>
              <span className="layer-name">{title(el)}
                {el.groupName&&<small> · {el.groupName}</small>}
              </span>
            </button>
            {renamingId===el.id
              ?<input autoFocus className="layer-rename" aria-label="Renommer le calque"
                value={el.name??""} placeholder={title(el)} maxLength={140}
                onChange={ev=>layerPatch(el.id,{name:ev.target.value})}
                onBlur={()=>setRenamingId(null)}
                onKeyDown={ev=>{if(ev.key==="Enter"||ev.key==="Escape")setRenamingId(null);}}/>
              :<button className="layer-icon-button" title="Renommer" aria-label={"Renommer "+title(el)}
                onClick={()=>setRenamingId(el.id)}>✎</button>}
            <button className="layer-icon-button" title={el.hidden?"Afficher":"Masquer"}
              aria-label={(el.hidden?"Afficher ":"Masquer ")+title(el)}
              aria-pressed={Boolean(el.hidden)} onClick={()=>layerPatch(el.id,{hidden:!el.hidden})}>
              {el.hidden?"◌":"◉"}
            </button>
            <button className="layer-icon-button" title={el.locked?"Déverrouiller":"Verrouiller"}
              aria-label={(el.locked?"Déverrouiller ":"Verrouiller ")+title(el)}
              aria-pressed={Boolean(el.locked)} onClick={()=>layerPatch(el.id,{locked:!el.locked})}>
              {el.locked?"▣":"▢"}
            </button>
          </div>)}
          {layers.length===0&&<p className="field-help">Aucun calque correspondant.</p>}
        </div>
      </div>}
      {(tab==="html"||tab==="css") && <div className="property-panel">
        <label htmlFor="source-editor">{tab==="html"?"HTML libre":"Styles CSS libres"}</label>
        <button type="button" className="subtle-btn" onClick={()=>setExpandedCode({
          type:tab,value:tab==="html"?doc.freeform?.html??"":doc.freeform?.css??""
        })}>Agrandir l'éditeur</button>
        <textarea id="source-editor" aria-label={tab==="html"?"Code HTML de la diapositive":"Styles CSS libres"}
          spellCheck={false} className="code-editor"
          placeholder={tab==="html"?"<h1>Votre composition</h1>":"h1 { font-size: 90px; }"}
          value={tab==="html"?(doc.freeform?.html??""):(doc.freeform?.css??"")}
          onChange={e=>updateHtml(tab,e.target.value)}
          onKeyDown={e=>indentCode(e,value=>updateHtml(tab,value))}/>
        <p className="field-help">Mode avancé ; HTML/CSS libre et compatible avec les objets éditables. Touche Tab : insérer deux espaces.</p>
        {tab==="html"&&/<script\b/i.test(doc.freeform?.html??"")&&
          <p className="field-help" role="status">Les scripts HTML sont bloqués dans les aperçus et à l'export pour des raisons de sécurité.</p>}
        {tab==="css"&&((doc.freeform?.css??"").match(/{/g)?.length??0)!==
          ((doc.freeform?.css??"").match(/}/g)?.length??0)&&
          <p className="field-help" role="status">Vérifiez les accolades CSS : leur nombre n'est pas équilibré.</p>}
      </div>}
      {expandedCode&&<div className="studio-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setExpandedCode(null);}}>
        <section className="studio-dialog" role="dialog" aria-modal="true"
          aria-label={expandedCode.type==="html"?"Modifier le HTML":"Modifier le CSS"}
          style={{width:"min(1100px,95vw)",maxWidth:"95vw"}}>
          <header className="studio-header">
            <div><strong>{expandedCode.type==="html"?"Composition HTML":"Styles CSS"}</strong>
              <span>Édition libre ; les modifications ne sont appliquées qu'à votre confirmation.</span></div>
            <button className="studio-close" onClick={()=>setExpandedCode(null)} aria-label="Fermer">×</button>
          </header>
          <textarea spellCheck={false} className="code-editor" autoFocus
            aria-label="Éditeur de code agrandi"
            value={expandedCode.value}
            onChange={e=>setExpandedCode({...expandedCode,value:e.target.value})}
            onKeyDown={e=>indentCode(e,value=>setExpandedCode({...expandedCode,value}))}
            style={{height:"min(65vh,720px)",width:"100%",minHeight:280,
              resize:"vertical",fontFamily:"ui-monospace,Consolas,monospace"}}/>
          <footer className="studio-variant-footer">
            <span>{expandedCode.value.length.toLocaleString("fr-FR")} caractères</span>
            <button onClick={()=>setExpandedCode(null)}>Annuler</button>
            <button className="primary" onClick={()=>{updateHtml(expandedCode.type,expandedCode.value);setExpandedCode(null);}}>
              Appliquer
            </button>
          </footer>
        </section>
      </div>}
    </aside>
  );
}
