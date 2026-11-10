import {z} from "zod";
import {database} from "./security.ts";
import {getCreationReferenceFile} from "./creationReferences.ts";
import {extractPowerPointGeometry} from "../creative/referenceGeometry.ts";
import {rankReferencePages, VISUAL_KINDS, type VisualKind, type VisualLayout, type ReferencePageInfo} from "../creative/referenceLibrary.ts";
import {renderPptxReferenceBatch,RENDER_BATCH_SIZE,MAX_REFERENCE_SLIDES} from "../creative/referenceRendering.ts";

const uuid=z.uuid();
export const kindSchema=z.enum(VISUAL_KINDS);
export interface StoredReferencePage {
  referenceId:string;slideNumber:number;visualKind:VisualKind;
  selected:boolean;layout:VisualLayout;renderWarning:string;
  width:number;height:number;
}

function pageRow(row:Record<string,unknown>):StoredReferencePage{
  return {
    referenceId:String(row.referenceId),slideNumber:Number(row.slideNumber),
    visualKind:kindSchema.parse(row.visualKind),selected:row.selected===true,
    layout:row.layout as VisualLayout,renderWarning:String(row.renderWarning??""),
    width:Number(row.width),height:Number(row.height)
  };
}
export async function listVisualReferencePages(id:string){
  uuid.parse(id);
  const file=await getCreationReferenceFile(id);
  if(!file)throw Error("reference_not_found");
  const pages=await database().query(
    "SELECT reference_id::text AS \"referenceId\", slide_number AS \"slideNumber\", "+
    "visual_kind AS \"visualKind\",selected,layout,render_warning AS \"renderWarning\",width,height "+
    "FROM public.slide_creation_reference_pages WHERE reference_id=$1::uuid ORDER BY slide_number",[id]);
  let totalSlides=1;
  if(file.mimeType.includes("presentationml.presentation")){
    const bytes=Buffer.from(file.base64,"base64");
    totalSlides=(await extractPowerPointGeometry(bytes,MAX_REFERENCE_SLIDES)).slideCount;
  }else if(file.mimeType==="application/pdf")totalSlides=0;
  return {
    referenceId:id,filename:file.filename,mimeType:file.mimeType,totalSlides,
    renderedCount:pages.length,renderEngine:pages.length?"pptx-glimpse":null,
    pages:pages.map(row=>pageRow(row as Record<string,unknown>))
  };
}
export async function generateVisualReferencePages(id:string,start:number,count=RENDER_BATCH_SIZE){
  uuid.parse(id);
  const file=await getCreationReferenceFile(id);
  if(!file)throw Error("reference_not_found");
  if(!file.mimeType.includes("presentationml.presentation"))throw Error("unsupported_reference_format");
  const bytes=Buffer.from(file.base64,"base64");
  const rendered=await renderPptxReferenceBatch(bytes,start,count);
  const db=database();
  for(const page of rendered.pages){
    const data=Buffer.from(page.png).toString("base64");
    await db.query(
      "INSERT INTO public.slide_creation_reference_pages "+
      "(reference_id,slide_number,image_mime,image_data,width,height,visual_kind,layout,render_engine,render_warning) "+
      "VALUES ($1::uuid,$2,'image/png',decode($3,'base64'),$4,$5,$6,$7::jsonb,'pptx-glimpse',$8) "+
      "ON CONFLICT (reference_id,slide_number) DO UPDATE SET "+
      "image_data=EXCLUDED.image_data,width=EXCLUDED.width,height=EXCLUDED.height, "+
      "layout=EXCLUDED.layout,render_engine=EXCLUDED.render_engine,render_warning=EXCLUDED.render_warning",
      [id,page.slideNumber,data,page.width,page.height,page.layout.kind,JSON.stringify(page.layout),page.renderWarning]
    );
  }
  return {referenceId:id,totalSlides:rendered.totalSlides,rendered:rendered.pages.map(page=>({
    slideNumber:page.slideNumber,width:page.width,height:page.height,
    visualKind:page.layout.kind,renderWarning:page.renderWarning
  })),renderEngine:rendered.engine};
}
export async function readVisualReferenceImage(id:string,slideNumber:number){
  uuid.parse(id);
  const n=z.number().int().min(1).max(MAX_REFERENCE_SLIDES).parse(slideNumber);
  const rows=await database().query(
    "SELECT encode(image_data,'base64') AS base64,image_mime AS \"mimeType\", "+
    "layout,selected,visual_kind AS \"visualKind\",render_warning AS \"renderWarning\" "+
    "FROM public.slide_creation_reference_pages WHERE reference_id=$1::uuid AND slide_number=$2",
    [id,n]
  );
  if(!rows[0])throw Error("reference_page_not_found");
  const row=rows[0] as Record<string,unknown>;
  return {referenceId:id,slideNumber:n,
    mimeType:String(row.mimeType),base64:String(row.base64),
    selected:row.selected===true,visualKind:String(row.visualKind),
    layout:row.layout,renderWarning:String(row.renderWarning??"")};
}
export async function updateVisualReferenceSelection(id:string,pages:number[]){
  uuid.parse(id);
  const enabled=z.array(z.number().int().min(1).max(MAX_REFERENCE_SLIDES)).max(MAX_REFERENCE_SLIDES).parse(pages);
  const result=await database().query(
    "UPDATE public.slide_creation_reference_pages "+
    "SET selected=slide_number=ANY($2::integer[]) "+
    "WHERE reference_id=$1::uuid RETURNING slide_number,selected",[id,enabled]);
  return {referenceId:id,selected:result.filter(row=>row.selected===true).map(row=>Number(row.slide_number))};
}
export async function updateVisualReferenceKind(id:string,slideNumber:number,kind:VisualKind){
  uuid.parse(id);
  const n=z.number().int().min(1).max(MAX_REFERENCE_SLIDES).parse(slideNumber);
  const k=kindSchema.parse(kind);
  const rows=await database().query(
    "UPDATE public.slide_creation_reference_pages SET visual_kind=$3 "+
    "WHERE reference_id=$1::uuid AND slide_number=$2 RETURNING slide_number",[id,n,k]);
  if(!rows.length)throw Error("reference_page_not_found");
  return {referenceId:id,slideNumber:n,visualKind:k};
}
export async function searchVisualReferencePages(args:{
  kind?:VisualKind;imageDominant?:boolean;geometrySignature?:number[];
  limit?:number;referenceId?:string
}){
  if(args.referenceId)uuid.parse(args.referenceId);
  if(args.kind)kindSchema.parse(args.kind);
  const rows=await database().query(
    "SELECT reference_id::text AS \"referenceId\",slide_number AS \"slideNumber\", "+
    "visual_kind AS \"visualKind\",selected,layout,render_warning AS \"renderWarning\",width,height "+
    "FROM public.slide_creation_reference_pages "+
    "WHERE selected=true AND ($1::uuid IS NULL OR reference_id=$1::uuid) "+
    "ORDER BY reference_id,slide_number LIMIT 300",
    [args.referenceId??null]
  );
  const pages=rows.map(row=>pageRow(row as Record<string,unknown>));
  const ranked=rankReferencePages(pages,args);
  return {count:ranked.length,method:"visual-function-and-drawingml-geometry",
    warning:"Les scores expriment une proximité de composition estimée. Pour juger le rendu, inspecter les images.",
    pages:ranked};
}
