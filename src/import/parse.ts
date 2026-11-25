import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { SlideDocumentSchema, createEmptySlideDocument, type SlideDocument, type SlideElement } from "../domain/slide.ts";

export type ImportedSlide = { document: SlideDocument; notes: string; sourceTitle?: string };
export type ImportedDeck = {
  title: string;
  slides: ImportedSlide[];
  warnings: string[];
  kind: "pptx" | "json" | "html";
  sourceFileName: string;
};
export type MediaAdapter = (data: Uint8Array, mime:string, filename:string)=>Promise<string>;
const parser = new XMLParser({ignoreAttributes:false,attributeNamePrefix:"@_",textNodeName:"#text",trimValues:false,
  parseTagValue:false,parseAttributeValue:false});
const orderParser=new XMLParser({preserveOrder:true,ignoreAttributes:false,parseTagValue:false,parseAttributeValue:false});
type Rec = Record<string, unknown>;
function rec(value:unknown):Rec{return value&&typeof value==="object"&&!Array.isArray(value)?value as Rec:{};}
function arr(value:unknown):unknown[]{return value===undefined||value===null?[]:Array.isArray(value)?value:[value];}
function str(value:unknown):string{
  if(typeof value==="string")return value;
  if(typeof value==="number")return String(value);
  if(value&&typeof value==="object")return str(rec(value)["#text"]);
  return "";
}
function name(value:unknown):string{return str(value).replace(/\s+/g," ").trim().slice(0,180);}
function int(value:unknown,otherwise=0):number{
  const n=Number(value);return Number.isFinite(n)?n:otherwise;
}
function hex(value:unknown):string|undefined{
  const raw=str(value).replace(/^#/,"");
  return /^[0-9a-f]{6}$/i.test(raw)?"#"+raw.toUpperCase():undefined;
}
function plainText(node:unknown):string{
  if(node===null||node===undefined)return "";
  if(Array.isArray(node))return node.map(plainText).join("");
  if(typeof node!=="object")return str(node);
  const o=rec(node);
  if("a:t" in o)return plainText(o["a:t"]);
  return [...arr(o["a:r"]),...arr(o["a:fld"])].map(x=>plainText(rec(x)["a:t"])).join("")+
    (o["a:br"]!==undefined?"\n":"");
}
function paragraphText(body:unknown):string{
  return arr(rec(body)["a:p"]).map(p=>{
    const row=rec(p);
    const runs=arr(row["a:r"]).map(r=>plainText(rec(r)["a:t"])).join("");
    const fields=arr(row["a:fld"]).map(r=>plainText(rec(r)["a:t"])).join("");
    const breaks=arr(row["a:br"]).length;
    return runs+fields+(breaks?"\n".repeat(Math.min(breaks,10)):"");
  }).join("\n").trim();
}
function slidePart(root:string,target:string):string{
  const source=root.split("/").slice(0,-1);
  const candidate=target.startsWith("/")?target.slice(1):[...source,target].join("/");
  const parts:string[]=[];
  for(const part of candidate.split("/")){
    if(part==="."||part==="")continue;
    if(part===".."){if(!parts.length)throw Error("invalid_pptx_path");parts.pop();}
    else parts.push(part);
  }
  const normalized=parts.join("/");
  if(!normalized.startsWith("ppt/"))throw Error("invalid_pptx_path");
  return normalized;
}
function relationships(xml:unknown,origin:string):Map<string,{part:string;type:string}> {
  const map=new Map<string,{part:string;type:string}>();
  for(const rel of arr(rec(rec(xml).Relationships).Relationship)){
    const r=rec(rel),id=str(r["@_Id"]),target=str(r["@_Target"]),type=str(r["@_Type"]);
    if(!id||!target||str(r["@_TargetMode"])==="External")continue;
    try{map.set(id,{part:slidePart(origin,target),type});}catch{/* Ignore unsafe relationship */ }
  }
  return map;
}
function transform(shape:Rec,canvas:{width:number;height:number},ppt:{w:number;h:number}) {
  const xfrm=rec(shape["a:xfrm"]??rec(shape["p:xfrm"])["a:xfrm"]);
  const off=rec(xfrm["a:off"]),ext=rec(xfrm["a:ext"]);
  const x=int(off["@_x"])/ppt.w*canvas.width;
  const y=int(off["@_y"])/ppt.h*canvas.height;
  const w=int(ext["@_cx"])/ppt.w*canvas.width;
  const h=int(ext["@_cy"])/ppt.h*canvas.height;
  return {left:Math.round(x)+"px",top:Math.round(y)+"px",
    width:Math.max(1,Math.round(w||canvas.width/2))+"px",
    height:Math.max(1,Math.round(h||canvas.height/4))+"px"};
}
function fillColor(style:unknown):string|undefined{
  const root=rec(style);
  const solid=rec(root["a:solidFill"]);
  return hex(rec(solid["a:srgbClr"])["@_val"]);
}
function extType(filename:string):string {
  const ext=filename.split(".").pop()?.toLowerCase();
  return ({jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",gif:"image/gif"} as Record<string,string>)[ext??""]??"";
}
/** Reject decompression bombs before any ZIP member is expanded.
 * JSZip stores central-directory uncompressedSize on CompressedObject after loadAsync.
 */
export function assertPowerPointArchiveBudget(zip:JSZip):void{
  const MAX_TOTAL=130_000_000;
  const MAX_XML=7_000_000;
  const MAX_MEDIA=16_000_000;
  let total=0,count=0;
  for(const [path,file] of Object.entries(zip.files)){
    if(file.dir)continue;
    count++;
    if(count>3000)throw Error("Le PowerPoint comporte trop de ressources.");
    const entry=file as unknown as {_data?:{uncompressedSize?:number}};
    const bytes=entry._data?.uncompressedSize;
    if(typeof bytes!=="number"||!Number.isFinite(bytes)||bytes<0)
      throw Error("Le fichier PowerPoint contient des tailles ZIP non vérifiables.");
    total+=bytes;
    if(total>MAX_TOTAL)throw Error("Le PowerPoint décompressé dépasse 130 Mo. Réduisez les médias avant l'import.");
    if(path.endsWith(".xml")||path.endsWith(".rels")){
      if(bytes>MAX_XML)throw Error("Une section XML du PowerPoint dépasse 7 Mo.");
    }else if(path.startsWith("ppt/media/")&&bytes>MAX_MEDIA)
      throw Error("Une image du PowerPoint dépasse 16 Mo ; allégez ce média.");
  }
}

function getSlideFiles(z:JSZip, warnings:string[]):Promise<{files:string[];size:{w:number;h:number}}> {
  return (async()=>{
    const presentation=await z.file("ppt/presentation.xml")?.async("string");
    if(!presentation)throw Error("Le fichier PPTX ne contient pas ppt/presentation.xml.");
    const data=rec(rec(parser.parse(presentation))["p:presentation"]);
    const size=rec(data["p:sldSz"]);
    const ppt={w:int(size["@_cx"],12192000),h:int(size["@_cy"],6858000)};
    if(ppt.w<1000||ppt.h<1000)throw Error("Dimensions PowerPoint invalides.");
    const relFile=await z.file("ppt/_rels/presentation.xml.rels")?.async("string");
    if(!relFile)throw Error("Le fichier PPTX ne contient pas les relations des diapositives.");
    const rels=relationships(parser.parse(relFile),"ppt/presentation.xml");
    const ordered=arr(rec(data["p:sldIdLst"])["p:sldId"])
      .map(slide=>rels.get(str(rec(slide)["@_r:id"]))?.part).filter((part):part is string=>!!part);
    if(!ordered.length)throw Error("Aucune diapositive trouvée dans ce PPTX.");
    if(ordered.length>100)throw Error("Ce PowerPoint dépasse la limite de 100 diapositives par import.");
    if(ordered.some(part=>!z.file(part)))warnings.push("Certaines diapositives référencées ne sont pas présentes dans le ZIP.");
    return {files:ordered.filter(part=>!!z.file(part)),size:ppt};
  })();
}
function extractNotes(xml:unknown):string{
  const tree=rec(rec(rec(rec(xml)["p:notes"])["p:cSld"])["p:spTree"]);
  return arr(tree["p:sp"]).flatMap(value=>{
    const shape=rec(value),placeholder=rec(rec(rec(shape["p:nvSpPr"])["p:nvPr"])["p:ph"]);
    const kind=str(placeholder["@_type"]);
    return kind==="body"||kind===""?[paragraphText(shape["p:txBody"])]:[];
  }).filter(Boolean).join("\n\n").slice(0,30000);
}
/** Preserve p:spTree's original interleaved Z-order; normal XML parsing groups sibling tags by type. */
function orderedShapes(xml:string,tree:Rec):[string,unknown][]{
  const findTree=(node:unknown):unknown[]|undefined=>{
    if(Array.isArray(node)){
      for(const value of node){const found=findTree(value);if(found)return found;}
      return undefined;
    }
    if(!node||typeof node!=="object")return undefined;
    const o=rec(node);
    if(Array.isArray(o["p:spTree"]))return o["p:spTree"] as unknown[];
    for(const value of Object.values(o)){
      const found=findTree(value);if(found)return found;
    }
    return undefined;
  };
  const order=findTree(orderParser.parse(xml));
  if(!order)return Object.entries(tree).filter(([tag])=>["p:sp","p:pic","p:graphicFrame"].includes(tag))
    .flatMap(([tag,v])=>arr(v).map(x=>[tag,x] as [string,unknown]));
  const counters=new Map<string,number>();
  const shapes:[string,unknown][]=[];
  for(const value of order){
    const tag=Object.keys(rec(value)).find(key=>["p:sp","p:pic","p:graphicFrame"].includes(key));
    if(!tag)continue;
    const index=counters.get(tag)??0;
    const item=arr(tree[tag])[index];
    if(item){shapes.push([tag,item]);counters.set(tag,index+1);}
  }
  return shapes;
}
function shapeTitle(shape:Rec):string{
  return name(rec(rec(shape["p:nvSpPr"])["p:cNvPr"])["@_name"]);
}
function shapeFont(shape:Rec,canvas:{width:number},ppt:{w:number}):Rec{
  const paragraphs=arr(rec(shape["p:txBody"])["a:p"]);
  const first=rec(paragraphs[0]);
  const font=rec(rec(arr(first["a:r"])[0])["a:rPr"]);
  const paragraph=rec(first["a:pPr"]);
  const pt=int(font["@_sz"],3200)/100;
  const px=Math.max(16,Math.min(360,Math.round(pt*canvas.width/(ppt.w/914400*72))));
  const color=fillColor(font);
  const family=str(rec(font["a:latin"])["@_typeface"]);
  const align=str(paragraph["@_algn"]);
  return {fontSize:px+"px",...(color?{color}:{}),
    ...(family?{fontFamily:family.slice(0,100)}:{}),
    ...(font["@_b"]==="1"?{fontWeight:"bold"}:{}),
    ...(font["@_i"]==="1"?{fontStyle:"italic"}:{}),
    ...(align==="ctr"?{textAlign:"center"}:align==="r"?{textAlign:"right"}:{})};
}
function titleFromSlide(doc:SlideDocument,index:number):string{
  const label=doc.elements.filter(e=>e.type==="text").map(e=>e.text?.split("\n")[0]?.trim()).find(Boolean);
  return label?.slice(0,110)||"Diapositive "+(index+1);
}
export function importNativeJson(text:string,filename:string):ImportedDeck{
  if(text.length>18_000_000)throw Error("Fichier JSON trop volumineux.");
  let raw:unknown;
  try{raw=JSON.parse(text);}catch{throw Error("Le JSON n'est pas valide.");}
  const input=rec(raw),items=arr(input.slides);
  if(items.length<1||items.length>40)throw Error("Le document doit contenir entre 1 et 40 diapositives.");
  const slides=items.map(row=>{
    const value=rec(row);
    return {document:SlideDocumentSchema.parse(value.document??row),
      notes:str(value.notes).slice(0,30000)};
  });
  return {kind:"json",sourceFileName:filename,title:name(rec(input.presentation).title)||filename.replace(/\.json$/i,""),
    slides,warnings:[]};
}
export function importHtml(html:string,filename:string):ImportedDeck {
  if(html.length>900_000)throw Error("Fichier HTML trop volumineux.");
  if(typeof DOMParser==="undefined")throw Error("L'import HTML nécessite un navigateur.");
  const dom=new DOMParser().parseFromString(html,"text/html");
  for(const node of dom.querySelectorAll("script,iframe,frame,object,embed,form,base,meta[http-equiv]"))node.remove();
  const css=Array.from(dom.querySelectorAll("style")).map(node=>node.textContent??"").join("\n").slice(0,240000);
  dom.querySelectorAll("style,link[rel=stylesheet]").forEach(node=>node.remove());
  const sections=Array.from(dom.body.querySelectorAll(":scope > section[data-slide],:scope > article[data-slide]"));
  const parts=sections.length?sections:[dom.body];
  if(parts.length>40)throw Error("Limite de 40 diapositives par import HTML.");
  const slides=parts.map((section,i)=>{
    const document:SlideDocument={...createEmptySlideDocument(),mode:"freeform",
      freeform:{html:section.innerHTML.slice(0,600000),css}};
    return {document:SlideDocumentSchema.parse(document),notes:section.getAttribute("data-notes")??"",
      sourceTitle:section.querySelector("h1,h2")?.textContent?.trim()||"Diapositive "+(i+1)};
  });
  return {kind:"html",sourceFileName:filename,title:dom.title||filename.replace(/\.html?$/i,""),
    slides,warnings:["Les scripts, formulaires et contenus embarqués ont été retirés ; les URL de ressources externes doivent rester accessibles."]};
}
export async function importPowerPoint(bytes:ArrayBuffer,filename:string,mediaAdapter?:MediaAdapter):Promise<ImportedDeck>{
  if(bytes.byteLength>45_000_000)throw Error("Le PowerPoint dépasse 45 Mo. Réduisez les images avant l'import.");
  const zip=await JSZip.loadAsync(bytes,{checkCRC32:false});
  assertPowerPointArchiveBudget(zip);
  const warnings:string[]=[];
  const {files,size}=await getSlideFiles(zip,warnings);
  const canvas={width:1920,height:Math.max(240,Math.min(8192,Math.round(1920*size.h/size.w)))};
  const slides:ImportedSlide[]=[];
  let embeddedBytes=0;
  let skipped=0;
  for(let index=0;index<files.length;index++){
    const part=files[index]!;
    const slideXml=await zip.file(part)?.async("string");
    if(!slideXml)continue;
    const xml=rec(rec(parser.parse(slideXml))["p:sld"]);
    const tree=rec(rec(xml["p:cSld"])["p:spTree"]);
    const relName=part.replace(/^(.*\/)([^/]+)$/,"$1_rels/$2.rels");
    const relXml=await zip.file(relName)?.async("string");
    const rels=relXml?relationships(parser.parse(relXml),part):new Map<string,{part:string;type:string}>();
    const elements:SlideElement[]=[];
    const shapes=orderedShapes(slideXml,tree);
    for(const [tag,item] of shapes){
      const node=rec(item);
      if(tag==="p:sp"){
        const text=paragraphText(node["p:txBody"]);
        const psp=rec(node["p:spPr"]);
        const style={...transform(psp,canvas,size),...shapeFont(node,canvas,size)};
        const color=fillColor(psp);
        if(text){
          elements.push({id:crypto.randomUUID(),type:"text",text:text.slice(0,80000),
            styles:{...style,...(color?{backgroundColor:color}:{})}});
        }else if(color){
          const geometry=str(rec(rec(psp["a:prstGeom"]))["@_prst"]);
          elements.push({id:crypto.randomUUID(),type:"shape",styles:{...style,backgroundColor:color,
            ...(geometry==="ellipse"?{borderRadius:"50%"}:geometry==="roundRect"?{borderRadius:"26px"}:{})}});
        }
      } else if(tag==="p:pic"){
        const media=rec(node["p:blipFill"]);
        const embed=str(rec(media["a:blip"])["@_r:embed"]);
        const resource=rels.get(embed);
        const entry=resource&&zip.file(resource.part);
        if(!entry){skipped++;continue;}
        const mime=extType(resource.part);
        if(!mime){skipped++;continue;}
        const binary=await entry.async("uint8array");
        embeddedBytes+=binary.byteLength;
        if(embeddedBytes>65_000_000)throw Error("Les images intégrées dépassent la limite d'extraction.");
        const url=mediaAdapter?await mediaAdapter(binary,mime,resource.part):
          "data:"+mime+";base64,"+await entry.async("base64");
        const spPr=rec(node["p:spPr"]);
        elements.push({id:crypto.randomUUID(),type:"image",src:url,
          styles:{...transform(spPr,canvas,size),objectFit:"cover"}});
      }else{
        const text=paragraphText(node["a:txBody"]);
        if(text)elements.push({id:crypto.randomUUID(),type:"text",text,
          styles:{...transform(node,canvas,size),fontSize:"40px"}});
      }
    }
    const bg=fillColor(rec(rec(xml["p:cSld"])["p:bg"])["p:bgPr"]);
    const doc:SlideDocument={...createEmptySlideDocument(),canvas,
      mode:bg?"hybrid":"structured",elements,animations:[],
      ...(bg?{freeform:{html:"",css:"body{background:"+bg+";}"}}:{})};
    const notesRel=[...rels.values()].find(r=>r.type.endsWith("/notesSlide")||r.type==="notesSlide");
    let notes="";
    if(notesRel){
      const note=await zip.file(notesRel.part)?.async("string");
      if(note)notes=extractNotes(parser.parse(note));
    }
    if(rec(xml["p:timing"])["p:tnLst"])warnings.push("Des animations PowerPoint d'origine ne sont pas converties en effets Web.");
    slides.push({document:SlideDocumentSchema.parse(doc),notes,sourceTitle:titleFromSlide(doc,index)});
  }
  if(!slides.length)throw Error("Aucune diapositive importable.");
  if(skipped)warnings.push(skipped+" média(s) incompatibles ou absents ont été ignorés.");
  warnings.push("PowerPoint : certains masques, graphiques, SmartArt, formes complexes et transitions ne sont pas intégralement convertis. Vérifiez l'aperçu.");
  return {title:filename.replace(/\.pptx$/i,""),slides,kind:"pptx",sourceFileName:filename,warnings:[...new Set(warnings)]};
}
export async function importFile(file:File,mediaAdapter?:MediaAdapter):Promise<ImportedDeck>{
  const lower=file.name.toLowerCase();
  if(lower.endsWith(".pptx"))return importPowerPoint(await file.arrayBuffer(),file.name,mediaAdapter);
  if(lower.endsWith(".json"))return importNativeJson(await file.text(),file.name);
  if(lower.endsWith(".html")||lower.endsWith(".htm"))return importHtml(await file.text(),file.name);
  throw Error("Formats acceptés : .pptx, .json, .html.");
}
