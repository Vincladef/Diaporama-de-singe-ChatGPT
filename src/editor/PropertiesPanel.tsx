import type { SlideDocument, SlideElement } from "../domain/slide";
import { elementBox } from "./geometry";
import { cropCoordinates, changeFilter, readFilter, type ImageFilterKey } from "../images/edit";

export type InspectorTab = "design" | "layers" | "html" | "css";
type Props = {
  document: SlideDocument;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  onChange: (doc: SlideDocument, key?: string) => void;
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  onAdd: (type:"text"|"image"|"shape") => void;
  onDelete: () => void;
  onArrange: (direction:"front"|"back"|"forward"|"backward") => void;
  onOpenImages?: () => void;
};
const cleanHex = (value:unknown, defaultValue:string) => typeof value === "string" && /^#[a-f\d]{6}$/i.test(value) ? value : defaultValue;
const numeric = (input:string, fallback:number) => Number.isFinite(Number(input)) ? Number(input) : fallback;

export function PropertiesPanel({document:doc,selectedIds,onSelect,onChange,tab,onTabChange,onAdd,onDelete,onArrange,onOpenImages}:Props) {
  const selected=selectedIds.length===1 ? doc.elements.find(e=>e.id===selectedIds[0]) : undefined;
  const box=selected ? elementBox(selected,doc) : undefined;

  function patchStyle(property:string,value:string|number) {
    if (!selected) return;
    onChange({...doc,elements:doc.elements.map(e=>e.id===selected.id?{...e,styles:{...e.styles,[property]:value}}:e)},"style-"+property);
  }
  function patchObject(changes:Partial<SlideElement>) {
    if (!selected) return;
    onChange({...doc,elements:doc.elements.map(e=>e.id===selected.id?{...e,...changes}:e)},"object");
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
            <button onClick={()=>onAdd("shape")}>+ Forme</button>
          </div>
        </div>
        {selected ? <>
          <div className="property-group">
            <div className="property-heading"><strong>{selected.type==="text"?"Texte":selected.type==="image"?"Image":selected.type==="shape"?"Forme":selected.type}</strong><small>{selected.id.slice(0,8)}</small></div>
            {selected.type==="text" && <label>Contenu du texte
              <textarea rows={3} value={selected.text??""} onChange={e=>patchObject({text:e.target.value})}/>
            </label>}
            {selected.type==="image" && <>
              <button type="button" className="primary" onClick={onOpenImages}>Rechercher ou remplacer une image</button>
              <label>Adresse de l'image
                <input type="url" value={selected.src??""} onChange={e=>patchObject({src:e.target.value})}/>
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
        </> : selectedIds.length>1 ? <p className="field-help">{selectedIds.length} éléments sélectionnés. Déplace-les ensemble, aligne-les ou utilise le clavier.</p> :
          <div className="property-empty"><strong>Choisis un élément sur la diapositive.</strong>
            <p>Déplace-le avec la souris, utilise les poignées pour modifier sa taille, ou double-clique sur un texte pour l'éditer.</p>
            {doc.mode!=="structured"&&<p>Le HTML/CSS libre est conservé en arrière-plan. Ses objets ne sont pas automatiquement convertis en calques.</p>}
          </div>}
      </div>}
      {tab==="layers" && <div className="property-panel">
        <div className="property-group-title">Calques · {doc.elements.length}</div>
        <p className="field-help">Les éléments situés en haut de cette liste apparaissent devant les autres. Fais glisser un calque pour changer l'ordre.</p>
        <div className="layer-list">
          {[...doc.elements].reverse().map(e=><button
            key={e.id} draggable
            onDragStart={ev=>{ev.dataTransfer.setData("text/x-singe-layer",e.id);ev.dataTransfer.effectAllowed="move";}}
            onDragOver={ev=>ev.preventDefault()}
            onDrop={ev=>{ev.preventDefault();const moving=ev.dataTransfer.getData("text/x-singe-layer");if(moving)reorder(moving,e.id);}}
            className={selectedIds.includes(e.id)?"selected":""}
            onClick={ev=>onSelect(ev.shiftKey ? (selectedIds.includes(e.id)?selectedIds.filter(x=>x!==e.id):[...selectedIds,e.id]):[e.id])}>
            <span className="layer-icon">{e.type==="text"?"T":e.type==="image"?"▧":e.type==="shape"?"□":"◇"}</span>
            <span>{e.type==="text"?(e.text?.slice(0,28)||"Texte"):(e.type==="image"?"Image":e.type==="shape"?"Forme":e.type)+" · "+e.id.slice(0,5)}</span>
            <span className="layer-grip">⠿</span>
          </button>)}
        </div>
      </div>}
      {(tab==="html"||tab==="css") && <div className="property-panel">
        <label htmlFor="source-editor">{tab==="html"?"HTML libre":"Styles CSS libres"}</label>
        <textarea id="source-editor" aria-label={tab==="html"?"Code HTML de la diapositive":"Styles CSS libres"}
          spellCheck={false} className="code-editor"
          placeholder={tab==="html"?"<h1>Votre composition</h1>":"h1 { font-size: 90px; }"}
          value={tab==="html"?(doc.freeform?.html??""):(doc.freeform?.css??"")}
          onChange={e=>updateHtml(tab,e.target.value)}/>
        <p className="field-help">Mode avancé ; le contenu HTML/CSS reste libre et n'est pas altéré par l'éditeur visuel. Les éléments ajoutés depuis « Design » restent modifiables comme calques.</p>
      </div>}
    </aside>
  );
}
