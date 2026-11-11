import JSZip from "jszip";
import { extractPowerPointGeometry, summarizePowerPointGeometry } from "../creative/referenceGeometry.ts";
import { z } from "zod";
import { database } from "./security.ts";

export const MAX_REFERENCE_SIZE = 4_000_000;
export const MAX_CREATION_REFERENCES = 24;
const uuid = z.uuid();
const allowed: Record<string,string> = {
  pptx:"application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf:"application/pdf",
  png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",
  html:"text/html",htm:"text/html",json:"application/json",
};
export type CreationReference = {
  id:string;filename:string;mimeType:string;sizeBytes:number;analysis:string;createdAt:string;
};
function decodeXmlText(text:string):string{
  return text.replace(/&(?:amp|lt|gt|quot|apos|#x[0-9a-f]+|#\d+);/gi, entity=>{
    const named:Record<string,string>={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":"\"","&apos;":"'"};
    if(named[entity])return named[entity];
    const code=entity.startsWith("&#x")?parseInt(entity.slice(3,-1),16):
      entity.startsWith("&#")?parseInt(entity.slice(2,-1),10):NaN;
    return Number.isFinite(code)&&code>=0&&code<=0x10ffff?String.fromCodePoint(code):entity;
  });
}
function frequent(items:string[],limit:number):string[]{
  const counts=new Map<string,number>();
  for(const item of items){const value=item.trim();if(value)counts.set(value,(counts.get(value)??0)+1);}
  return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,limit).map(([value,count])=>value+(count>1?" ("+count+"×)":""));
}
export async function analyzeCreationReference(filename:string,mimeType:string,bytes:Uint8Array):Promise<string>{
  if(mimeType.startsWith("image/"))return "Exemple graphique joint : image "+mimeType+
    ". Pour apprécier directement la composition, ouvrir cette référence avec l'outil inspect_creation_reference.";
  if(mimeType==="application/pdf"){
    const raw=Buffer.from(bytes).toString("latin1");
    const pages=(raw.match(/\/Type\s*\/Page\b/g)??[]).length;
    return "Diaporama ou planche au format PDF"+(pages?" ; "+pages+" pages détectées":"")+
      ". Fichier original conservé ; l'analyse visuelle de ses pages n'est pas automatiquement extraite. "+
      "Pour reproduire une composition précise, préférer aussi une capture PNG ou JPG.";
  }
  if(mimeType==="text/html"||mimeType==="application/json"){
    const raw=new TextDecoder("utf-8",{fatal:false}).decode(bytes);
    const colors=frequent(raw.match(/#[0-9a-f]{6}\b/gi)??[],7);
    const fonts=frequent([...raw.matchAll(/font-family\s*:\s*([^;\n}]+)/gi)].map(x=>x[1]??""),5);
    const text=raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]*>/g," ")
      .replace(/\s+/g," ").trim().slice(0,1500);
    return ["Référence de composition HTML/JSON.",colors.length?"Couleurs : "+colors.join(", "):"",
      fonts.length?"Polices : "+fonts.join(", "):"",text?"Texte témoin : "+text:""].filter(Boolean).join("\n");
  }
  if(mimeType.includes("presentationml.presentation")){
    try {
      const zip=await JSZip.loadAsync(bytes);
      const paths=Object.keys(zip.files).filter(path=>/^ppt\/slides\/slide\d+\.xml$/.test(path))
        .sort((a,b)=>Number(a.match(/slide(\d+)/)?.[1]??0)-Number(b.match(/slide(\d+)/)?.[1]??0));
      const colors:string[]=[],fonts:string[]=[],samples:string[]=[],photos:number[]=[];
      const theme=await zip.file("ppt/theme/theme1.xml")?.async("string");
      const layoutSummary=await extractPowerPointGeometry(bytes)
        .then(geometry=>summarizePowerPointGeometry(geometry,1800))
        .catch(()=>"Géométrie des pages indisponible pour cette archive.");
      for(const source of [theme??"",...await Promise.all(paths.slice(0,30).map(path=>zip.file(path)!.async("string")))]){
        colors.push(...[...source.matchAll(/<(?:a:)?srgbClr[^>]*\bval=["']([0-9a-f]{6})["']/gi)]
          .map(match=>"#"+match[1]!.toUpperCase()));
        fonts.push(...[...source.matchAll(/<(?:a:)?(?:latin|ea|cs)[^>]*\btypeface=["']([^"']+)/gi)].map(match=>match[1]!));
        if(source===theme)continue;
        photos.push((source.match(/<p:pic\b/g)??[]).length);
        const texts=[...source.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi)]
          .map(match=>decodeXmlText(match[1]??"").trim()).filter(Boolean);
        if(texts.length)samples.push(texts.slice(0,3).join(" / ").slice(0,220));
      }
      return [
        "PowerPoint de référence : "+paths.length+" diapositives.",
        layoutSummary,
        "Images intégrées aux "+Math.min(paths.length,30)+" premières diapositives : "+photos.reduce((a,b)=>a+b,0)+".",
        colors.length?"Palette fréquente : "+frequent(colors,9).join(", ")+".":"",
        fonts.length?"Typographies déclarées : "+frequent(fonts,6).join(", ")+".":"",
        samples.length?"Titres et légendes témoins :\n"+samples.slice(0,12).map((s,i)=>(i+1)+". "+s).join("\n"):""
      ].filter(Boolean).join("\n").slice(0,4300);
    }catch{return "PowerPoint de référence conservé ; extraction automatique de sa direction graphique indisponible.";}
  }
  return "Fichier de référence conservé.";
}
function validateSignature(ext:string,bytes:Uint8Array):boolean{
  if(ext==="pdf")return Buffer.from(bytes.subarray(0,5)).toString()==="%PDF-";
  if(ext==="pptx")return bytes[0]===0x50&&bytes[1]===0x4b;
  if(ext==="png")return Buffer.from(bytes.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(ext==="jpg"||ext==="jpeg")return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(ext==="webp")return Buffer.from(bytes.subarray(0,4)).toString()==="RIFF"&&
    Buffer.from(bytes.subarray(8,12)).toString()==="WEBP";
  return true;
}
export async function listCreationReferences():Promise<CreationReference[]>{
  const rows=await database().query("SELECT id::text,filename,mime_type AS \"mimeType\",size_bytes AS \"sizeBytes\",analysis,created_at AS \"createdAt\" "+
    "FROM public.slide_creation_references ORDER BY created_at DESC LIMIT 30",[]);
  return rows as CreationReference[];
}
export async function addCreationReference(filename:string,bytes:Uint8Array):Promise<CreationReference>{
  const name=filename.replace(/[\\/]/g,"_").trim().slice(0,220);
  const ext=name.split(".").pop()?.toLowerCase()??"";
  const mimeType=allowed[ext];
  if(!mimeType||!name||bytes.length===0||bytes.length>MAX_REFERENCE_SIZE||!validateSignature(ext,bytes))
    throw new Error("invalid_reference_file");
  const analysis=await analyzeCreationReference(name,mimeType,bytes);
  const rows=await database().query(
    "INSERT INTO public.slide_creation_references(filename,mime_type,size_bytes,file_data,analysis) "+
    "SELECT $1,$2,$3,decode($4,'base64'),$5 WHERE "+
    "(SELECT count(*) FROM public.slide_creation_references)<$6 "+
    "RETURNING id::text,filename,mime_type AS \"mimeType\",size_bytes AS \"sizeBytes\",analysis,created_at AS \"createdAt\"",
    [name,mimeType,bytes.length,Buffer.from(bytes).toString("base64"),analysis,MAX_CREATION_REFERENCES]);
  if(!rows[0])throw new Error("maximum_references_reached");
  return rows[0] as CreationReference;
}
export async function removeCreationReference(id:string):Promise<boolean>{
  uuid.parse(id);
  const rows=await database().query(
    "DELETE FROM public.slide_creation_references WHERE id=$1::uuid RETURNING id",[id]);
  return !!rows[0];
}
export async function getCreationReferenceFile(id:string):Promise<{filename:string;mimeType:string;base64:string;analysis:string}|null>{
  uuid.parse(id);
  const rows=await database().query("SELECT filename,mime_type AS \"mimeType\",analysis,encode(file_data,'base64') AS base64 "+
    "FROM public.slide_creation_references WHERE id=$1::uuid",[id]);
  return (rows[0] as {filename:string;mimeType:string;base64:string;analysis:string}|undefined)??null;
}
