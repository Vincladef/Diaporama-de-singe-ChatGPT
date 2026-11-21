import type { SlideDocument, SlideElement } from "../domain/slide";
import { getSlideTheme } from "./slideThemes";

/** Native, editable layouts. They never flatten HTML or generated objects. */
export const SLIDE_LAYOUTS = [
  { id:"blank", name:"Vide", description:"Aucun élément imposé" },
  { id:"title", name:"Titre", description:"Un titre centré" },
  { id:"title-body", name:"Titre et contenu", description:"Titre et zone de contenu" },
  { id:"two-columns", name:"Deux colonnes", description:"Titre et deux zones de texte" },
  { id:"section", name:"Section", description:"Grand titre de transition" },
  { id:"quote", name:"Citation", description:"Citation et auteur" },
  { id:"image-caption", name:"Image et légende", description:"Image avec texte" },
  { id:"comparison", name:"Comparaison", description:"Deux parties équilibrées" },
  { id:"three-cards", name:"Trois cartes", description:"Trois zones sous un titre" },
] as const;
export type LayoutId = typeof SLIDE_LAYOUTS[number]["id"];

type Slot = { name:string; x:number;y:number;w:number;h:number;size:number;align?:"left"|"center"; weight?:string;type?:"text"|"image" };
function slotsFor(layout:LayoutId):Slot[] {
  const title:Slot={name:"Titre",x:.085,y:.09,w:.83,h:.14,size:68,weight:"bold"};
  switch(layout){
    case "blank": return [];
    case "title": return [{name:"Titre",x:.08,y:.36,w:.84,h:.25,size:98,align:"center",weight:"bold"}];
    case "title-body": return [title,{name:"Contenu",x:.11,y:.30,w:.78,h:.56,size:39}];
    case "two-columns": return [title,{name:"Colonne gauche",x:.085,y:.31,w:.395,h:.57,size:37},
      {name:"Colonne droite",x:.52,y:.31,w:.395,h:.57,size:37}];
    case "section": return [{name:"Titre de section",x:.11,y:.32,w:.78,h:.34,size:90,weight:"bold"}];
    case "quote": return [{name:"Citation",x:.13,y:.23,w:.74,h:.40,size:62,align:"center"},
      {name:"Auteur",x:.32,y:.70,w:.36,h:.09,size:31,align:"center"}];
    case "image-caption": return [title,{name:"Image",type:"image",x:.12,y:.29,w:.76,h:.47,size:30},{name:"Légende",x:.10,y:.80,w:.80,h:.10,size:30}];
    case "comparison": return [title,{name:"Partie gauche",x:.085,y:.33,w:.395,h:.50,size:42},
      {name:"Partie droite",x:.52,y:.33,w:.395,h:.50,size:42}];
    case "three-cards": return [title,{name:"Carte 1",x:.08,y:.34,w:.26,h:.47,size:34},
      {name:"Carte 2",x:.37,y:.34,w:.26,h:.47,size:34},
      {name:"Carte 3",x:.66,y:.34,w:.26,h:.47,size:34}];
  }
}
const px=(value:number)=>Math.round(value)+"px";
export function applySlideLayout(doc:SlideDocument,layout:LayoutId):SlideDocument {
  if(layout==="blank")return doc;
  const slots=slotsFor(layout);
  const theme=getSlideTheme(doc.themeId);
  const consumed=new Set<string>();
  const generated:SlideElement[]=[];
  for(const slot of slots){
    // Preserve text and identity where possible; do not discard extra objects.
    const kind=slot.type??"text";
    const old=doc.elements.find(element=>element.type===kind&&!element.locked&&!consumed.has(element.id));
    if(old)consumed.add(old.id);
    const styles:SlideElement["styles"]={
      left:px(slot.x*doc.canvas.width),top:px(slot.y*doc.canvas.height),
      width:px(slot.w*doc.canvas.width),height:px(slot.h*doc.canvas.height),
      fontSize:px(slot.size*doc.canvas.width/1920),fontFamily:String(theme?.font??"Arial, sans-serif"),
      color:String(theme?.foreground??"#203127"),textAlign:slot.align??"left",
      fontWeight:slot.weight??"normal",whiteSpace:"pre-wrap",lineHeight:"1.18",
    };
    generated.push(old?{...old,name:slot.name,styles:{...old.styles,...styles}}:
      kind==="image"?{id:crypto.randomUUID(),type:"image",name:slot.name,styles:{...styles,objectFit:"contain"}}:
      {id:crypto.randomUUID(),type:"text",name:slot.name,text:"",styles});
  }
  const remaining=doc.elements.filter(element=>!consumed.has(element.id));
  // Retain all HTML/CSS and unmatched AI/media layers. Native text stays editable.
  return {...doc,mode:doc.mode==="freeform"?"hybrid":doc.mode,
    elements:[...remaining,...generated]};
}
