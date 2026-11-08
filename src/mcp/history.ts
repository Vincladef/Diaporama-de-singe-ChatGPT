import { z } from "zod";
import { database } from "./security.ts";
import { SlideDocumentSchema, type SlideDocument } from "../domain/slide.ts";

const uuid=z.uuid();
export const HISTORY_PREFIX="Historique r";
export type SlideCheckpoint={
  slideId:string;revision:number;document:SlideDocument;notes:string;origin:"éditeur"|"MCP"|"restauration";
};
export function checkpointName(revision:number,origin:SlideCheckpoint["origin"]):string{
  if(!Number.isInteger(revision)||revision<1)throw new Error("invalid_revision");
  return HISTORY_PREFIX+revision+" · "+origin;
}

/** Shared history repository: reuses the existing private slide_variants table (no migration). */
export async function recordSlideHistory(items:SlideCheckpoint[]){
  if(items.length===0)return {saved:0};
  if(items.length>40)throw new Error("history_batch_too_large");
  const payload=items.map(item=>({
    slide_id:uuid.parse(item.slideId),name:checkpointName(item.revision,item.origin),
    document:SlideDocumentSchema.parse(item.document),notes:item.notes.slice(0,30000)
  }));
  const sql=database();
  const saved=await sql.query(
    "INSERT INTO public.slide_variants(slide_id,name,document,notes) "+
    "SELECT x.slide_id::uuid,x.name,x.document,x.notes "+
    "FROM jsonb_to_recordset($1::jsonb) AS x(slide_id text,name text,document jsonb,notes text) "+
    "JOIN public.slides s ON s.id=x.slide_id::uuid RETURNING id",
    [JSON.stringify(payload)]);
  // Limit retained checkpoints to 60 per slide; named artistic variants are never removed.
  await sql.query(
    "DELETE FROM public.slide_variants WHERE id IN ("+
    "SELECT id FROM (SELECT id,row_number() OVER (PARTITION BY slide_id ORDER BY created_at DESC,id DESC) AS rn "+
    "FROM public.slide_variants WHERE slide_id=ANY($1::uuid[]) AND name LIKE 'Historique r%') x WHERE rn>60)",
    [payload.map(x=>x.slide_id)]);
  return {saved:saved.length};
}

export async function listSlideHistory(slideId:string,limit=20,includeDocuments=false){
  uuid.parse(slideId);
  const fields=includeDocuments?"id::text AS id,name,notes,document,created_at":
    "id::text AS id,name,created_at,LEFT(notes,160) AS notesExcerpt";
  const rows=await database().query(
    "SELECT "+fields+" FROM public.slide_variants WHERE slide_id=$1::uuid "+
    "AND name LIKE 'Historique r%' ORDER BY created_at DESC,id DESC LIMIT $2",
    [slideId,Math.min(Math.max(limit,1),60)]);
  return {slideId,items:rows,count:rows.length};
}
