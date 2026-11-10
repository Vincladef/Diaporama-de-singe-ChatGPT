import { z } from "zod";
import { database } from "./security";
import { fingerprint } from "./fingerprint";
import { recordSlideHistory } from "./history";
import { editSlide, initialSlide, summarizeSlide, type InitialSlide, type SlideOperation } from "./documents";
import { SlideDocumentSchema, type SlideDocument } from "../domain/slide";

const uuid = z.uuid();
const title = z.string().trim().min(1).max(180);
const short = z.string().max(120);
export type DbSlide = { id: string; presentation_id: string; position: number; revision: number; document: SlideDocument; notes: string; updated_at: string };

export async function listDecks(search = "", limit = 30, offset = 0) {
  const db = database();
  const rows = await db.query(
    "SELECT p.id::text AS id,p.title,p.format,p.folder_id::text AS folder_id,p.updated_at,COUNT(s.id)::int AS slides FROM public.presentations p LEFT JOIN public.slides s ON s.presentation_id=p.id WHERE ($1='' OR p.title ILIKE '%'||$1||'%') GROUP BY p.id ORDER BY p.updated_at DESC LIMIT $2 OFFSET $3",
    [search.slice(0,100), Math.min(limit,100),Math.min(offset,10000)]);
  return { presentations: rows, count: rows.length, nextOffset: rows.length === limit ? offset + rows.length : null };
}
export async function getDeck(id: string, scope: "outline" | "full" = "outline", offset = 0, limit = 50) {
  const db = database();uuid.parse(id);
  const [decks, rows] = await Promise.all([
    db.query("SELECT id::text AS id,title,description,format,folder_id::text AS folder_id,updated_at FROM public.presentations WHERE id=$1::uuid", [id]),
    db.query("SELECT id::text AS id,presentation_id::text AS presentation_id,position,revision,document,notes,updated_at FROM public.slides WHERE presentation_id=$1::uuid ORDER BY position LIMIT $2 OFFSET $3", [id,Math.min(limit,100),Math.min(offset,5000)]),
  ]);
  if (!decks[0]) throw new Error("presentation_not_found");
  const slides = rows as unknown as DbSlide[];
  return { presentation: decks[0], slides: scope === "full" ? slides : slides.map(summarizeSlide),
    returned: slides.length, nextOffset: slides.length === limit ? offset + slides.length : null };
}
export async function getSlide(id: string, scope: "summary" | "full" | "html" | "elements" = "full") {
  const db=database();uuid.parse(id);
  const rows=await db.query("SELECT id::text AS id,presentation_id::text AS presentation_id,position,revision,document,notes,updated_at FROM public.slides WHERE id=$1::uuid", [id]);
  const s=rows[0] as unknown as DbSlide|undefined;
  if (!s) throw new Error("slide_not_found");
  if (scope === "summary") return summarizeSlide(s);
  if (scope === "html") return { id:s.id,revision:s.revision,mode:s.document.mode,html:s.document.freeform?.html??"",css:s.document.freeform?.css??"",notes:s.notes };
  if (scope === "elements") return { id:s.id,revision:s.revision,elements:s.document.elements,animations:s.document.animations,canvas:s.document.canvas,notes:s.notes };
  return s;
}
export async function createDeck(name: string, slides: InitialSlide[], folderId?: string) {
  const db=database();
  const parsed=slides.length ? slides : [{}];
  if (parsed.length > 40) throw new Error("maximum_40_slides_per_call");
  if (folderId) uuid.parse(folderId);
  const all=parsed.map(s=>initialSlide(s));
  const rows=await db.query(
    "WITH deck AS (INSERT INTO public.presentations(title,folder_id) VALUES($1,$2::uuid) RETURNING id,title), created AS (INSERT INTO public.slides(presentation_id,position,document,notes) SELECT deck.id,(row.ordinality::integer-1),row.value->'document',COALESCE(row.value->>'notes','') FROM deck,jsonb_array_elements($3::jsonb) WITH ORDINALITY AS row(value,ordinality) RETURNING id) SELECT deck.id::text AS id,deck.title,(SELECT COUNT(*)::int FROM created) AS slides FROM deck",
    [title.parse(name),folderId??null,JSON.stringify(all)]);
  if (!rows[0]) throw new Error("presentation_creation_failed");
  return rows[0];
}
export async function updateDeck(id: string, patch: Record<string,unknown>) {
  uuid.parse(id);
  const input=z.object({ title:title.optional(),description:z.string().max(2000).optional(),
    format:z.enum(["16:9","4:3","custom"]).optional(),folderId:uuid.nullable().optional() }).strict().parse(patch);
  const rows=await database().query(
    "UPDATE public.presentations SET title=COALESCE($2,title),description=COALESCE($3,description),format=COALESCE($4,format),folder_id=CASE WHEN $5::boolean THEN $6::uuid ELSE folder_id END,updated_at=now() WHERE id=$1::uuid RETURNING id::text AS id,title,format,folder_id::text AS folder_id,updated_at",
    [id,input.title??null,input.description??null,input.format??null,input.folderId!==undefined,input.folderId??null]);
  if (!rows[0]) throw new Error("presentation_not_found");
  return rows[0];
}
export async function deleteDeck(id: string) {
  uuid.parse(id);
  const rows=await database().query("DELETE FROM public.presentations WHERE id=$1::uuid RETURNING id::text AS id,title",[id]);
  if (!rows[0]) throw new Error("presentation_not_found");
  return rows[0];
}
export async function addSlides(deckId: string, slides: InitialSlide[]) {
  uuid.parse(deckId);
  if (!slides.length || slides.length>40) throw new Error("invalid_slide_count");
  const parsed=slides.map(s=>initialSlide(s));
  const rows=await database().query(
    "WITH deck AS (UPDATE public.presentations SET updated_at=now() WHERE id=$1::uuid RETURNING id), data AS (SELECT val,ord FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS x(val,ord)), inserted AS (INSERT INTO public.slides(presentation_id,position,document,notes) SELECT deck.id,(SELECT COALESCE(MAX(position),-1) FROM public.slides WHERE presentation_id=deck.id)+data.ord::int,data.val->'document',COALESCE(data.val->>'notes','') FROM deck,data RETURNING id,position) SELECT id::text AS id,position FROM inserted ORDER BY position",
    [deckId,JSON.stringify(parsed)]);
  if (rows.length !== slides.length) throw new Error("presentation_not_found");
  return { created: rows.length,slides:rows };
}
export async function duplicateSlide(id: string) {
  uuid.parse(id);
  const rows=await database().query(
    "WITH original AS (SELECT presentation_id,document,notes FROM public.slides WHERE id=$1::uuid), inserted AS (INSERT INTO public.slides(presentation_id,position,document,notes) SELECT original.presentation_id,(SELECT COALESCE(MAX(position),-1)+1 FROM public.slides WHERE presentation_id=original.presentation_id),original.document,original.notes FROM original RETURNING id,position) SELECT id::text AS id,position FROM inserted", [id]);
  if (!rows[0]) throw new Error("slide_not_found");
  return rows[0];
}
export async function removeSlides(deckId: string, ids: string[]) {
  uuid.parse(deckId);
  if (!ids.length || ids.length>40) throw new Error("invalid_slide_count");
  ids.forEach(id=>uuid.parse(id));
  const result=await database().query(
    "DELETE FROM public.slides WHERE presentation_id=$1::uuid AND id=ANY($2::uuid[]) RETURNING id::text AS id",
    [deckId,ids]);
  return { deleted: result.length,slideIds: result.map(r=>r.id) };
}
export async function reorderSlides(deckId: string, order: string[]) {
  uuid.parse(deckId);if(order.length>500)throw new Error("too_many_slides");
  order.forEach(id=>uuid.parse(id));
  const rows=await database().query("SELECT public.mcp_reorder_slides($1::uuid,$2::uuid[]) AS moved",[deckId,order]);
  return { reordered: rows[0]?.moved ?? 0 };
}
export interface SlideChange { id: string; revision?: number; operations: SlideOperation[] }
export async function editSlides(deckId: string, changes: SlideChange[], dryRun = false) {
  uuid.parse(deckId);
  if(!changes.length||changes.length>40)throw new Error("batch_size_must_be_1_to_40");
  if(new Set(changes.map(c=>c.id)).size!==changes.length)throw new Error("duplicate_slide_id");
  changes.forEach(c=>uuid.parse(c.id));
  const rows=await database().query(
    "SELECT id::text AS id,revision,document,notes,position FROM public.slides WHERE presentation_id=$1::uuid AND id=ANY($2::uuid[]) ORDER BY position",
    [deckId,changes.map(c=>c.id)]);
  const byId=new Map((rows as unknown as DbSlide[]).map(r=>[r.id,r]));
  const prepared=changes.map(c=>{
    const row=byId.get(c.id);
    if(!row)throw new Error("slide_not_found:"+c.id);
    if(c.revision!==undefined && c.revision!==row.revision)throw new Error("revision_conflict:"+c.id);
    const applied=editSlide(SlideDocumentSchema.parse(row.document),row.notes,c.operations);
    return {id:c.id,revision:row.revision,document:applied.document,notes:applied.notes};
  });
  if(dryRun)return { dryRun:true,updated:0,slides:undefined,changes:prepared.map((c,i)=>({
    ...summarizeSlide({id:c.id,position:byId.get(c.id)!.position,revision:c.revision+1,document:c.document,notes:c.notes}),
    operations:changes[i]?.operations.length})) };
  const result=await database().query(
    "SELECT public.mcp_apply_slide_batch($1::uuid,$2::jsonb) AS updated",
    [deckId,JSON.stringify(prepared)]);
  let historyWarning:string|undefined;
  try{
    await recordSlideHistory(prepared.map(c=>({
      slideId:c.id,revision:c.revision,document:SlideDocumentSchema.parse(byId.get(c.id)!.document),
      notes:byId.get(c.id)!.notes,origin:"MCP" as const
    })));
  }catch(error){
    console.error("MCP history recording unavailable:",error instanceof Error?error.message:String(error));
    historyWarning="Les modifications sont enregistrées, mais l'instantané historique n'a pas pu être conservé.";
  }
  return { updated:result[0]?.updated??0,...(historyWarning?{historyWarning}:{}),slides:prepared.map(c=>({id:c.id,revision:c.revision+1,
    mode:c.document.mode,elements:c.document.elements.length,animations:c.document.animations.length})) };
}
export async function listFolders() {
  return database().query("SELECT id::text AS id,name,parent_id::text AS parent_id FROM public.folders ORDER BY name LIMIT 500",[]);
}
export async function manageFolder(action: "create"|"rename"|"delete",id:string|undefined,name:string|undefined,parentId:string|undefined) {
  const db=database();
  if(action==="create"){
    if(parentId)uuid.parse(parentId);
    const rows=await db.query("INSERT INTO public.folders(name,parent_id) VALUES($1,$2::uuid) RETURNING id::text AS id,name",
      [short.min(1).parse(name),parentId??null]);return rows[0];
  }
  uuid.parse(id);
  if(action==="rename"){
    const rows=await db.query("UPDATE public.folders SET name=$2 WHERE id=$1::uuid RETURNING id::text AS id,name",
      [id,short.min(1).parse(name)]);if(!rows[0])throw new Error("folder_not_found");return rows[0];
  }
  const rows=await db.query("DELETE FROM public.folders WHERE id=$1::uuid RETURNING id::text AS id,name",[id]);
  if(!rows[0])throw new Error("folder_not_found");return rows[0];
}
export async function saveAssets(deckId: string, assets: {url:string,label?:string,source?:string,rights?:string}[]) {
  uuid.parse(deckId);
  if(!assets.length||assets.length>40)throw new Error("invalid_asset_count");
  for(const a of assets){z.url().parse(a.url);if(a.url.length>3000)throw new Error("asset_url_too_long")}
  const data=assets.map(a=>({url:a.url,label:(a.label??"").slice(0,140),source:(a.source??"").slice(0,140),rights:(a.rights??"").slice(0,400)}));
  const rows=await database().query(
    "INSERT INTO public.assets(presentation_id,url,label,source,rights) SELECT $1::uuid,j.url,j.label,j.source,j.rights FROM jsonb_to_recordset($2::jsonb) AS j(url text,label text,source text,rights text) RETURNING id::text AS id,url,label",
    [deckId,JSON.stringify(data)]);
  return { added:rows.length,assets:rows };
}

export async function saveAssetsIfMissing(
  deckId:string,assets:{url:string;label?:string;source?:string;rights?:string}[]
){
  uuid.parse(deckId);
  const distinct=[...new Map(assets.map(a=>[a.url,a])).values()];
  if(!distinct.length)return {added:0,existing:0};
  if(distinct.length>40)throw new Error("invalid_asset_count");
  for(const a of distinct)if(!a.url.startsWith("https://")||a.url.length>3000)
    throw new Error("invalid_asset_url");
  const rows=await database().query(
    "SELECT DISTINCT url FROM public.assets WHERE presentation_id=$1::uuid AND url=ANY($2::text[])",
    [deckId,distinct.map(a=>a.url)]);
  const known=new Set(rows.map(r=>String(r.url)));
  const toAdd=distinct.filter(a=>!known.has(a.url));
  if(toAdd.length)await saveAssets(deckId,toAdd);
  return {added:toAdd.length,existing:distinct.length-toAdd.length};
}

export async function listAssets(deckId: string, limit=60) {
  uuid.parse(deckId);
  return database().query("SELECT id::text AS id,url,label,source,rights FROM public.assets WHERE presentation_id=$1::uuid ORDER BY created_at DESC LIMIT $2",[deckId,Math.min(limit,150)]);
}
export async function createVariants(slideId: string, variants: {name:string,slide:InitialSlide,designContext?:Record<string,unknown>}[], expectedRevision?:number) {
  uuid.parse(slideId);
  if(!variants.length||variants.length>8)throw new Error("invalid_variant_count");
  const prepared=variants.map(v=>({name:short.parse(v.name),...initialSlide(v.slide),
    design_context:v.designContext??{}}));
  const rows=await database().query(
    "WITH source AS(SELECT id FROM public.slides WHERE id=$1::uuid AND ($3::integer IS NULL OR revision=$3)), created AS(INSERT INTO public.slide_variants(slide_id,name,document,notes,design_context) SELECT source.id,r.name,r.document,r.notes,r.design_context FROM source,jsonb_to_recordset($2::jsonb) AS r(name text,document jsonb,notes text,design_context jsonb) RETURNING id,name) SELECT id::text AS id,name FROM created",
    [slideId,JSON.stringify(prepared),expectedRevision??null]);
  if(rows.length!==prepared.length)throw Error(expectedRevision===undefined?"slide_not_found":"revision_conflict");
  return { created:rows.length,variants:rows };
}
export async function listVariants(slideId: string, full=false) {
  uuid.parse(slideId);
  const cols=full?"id::text AS id,name,document,notes,design_context,created_at":"id::text AS id,name,created_at";
  return database().query("SELECT "+cols+" FROM public.slide_variants WHERE slide_id=$1::uuid AND name NOT LIKE 'Historique r%' ORDER BY created_at DESC LIMIT 50",[slideId]);
}

export async function getVariant(slideId:string,variantId:string){
  uuid.parse(slideId);uuid.parse(variantId);
  const rows=await database().query(
    "SELECT id::text AS id,slide_id::text AS slide_id,name,document,notes,design_context,created_at FROM public.slide_variants WHERE slide_id=$1::uuid AND id=$2::uuid",
    [slideId,variantId]);
  const row=rows[0] as unknown as {id:string;slide_id:string;name:string;document:SlideDocument;notes:string;created_at:string}|undefined;
  if(!row)throw new Error("variant_not_found");
  const parsed={...row,document:SlideDocumentSchema.parse(row.document)};
  return {...parsed,fingerprint:fingerprint(parsed)};
}

/** CAS update: the original JSON, name and notes must still match the previously inspected variant. */
export async function reviseVariant(
  slideId:string,variantId:string,expectedHash:string,operations:SlideOperation[],newName?:string
){
  if(!/^[0-9a-f]{64}$/.test(expectedHash))throw new Error("invalid_variant_fingerprint");
  const current=await getVariant(slideId,variantId);
  if(current.fingerprint!==expectedHash)throw new Error("variant_conflict");
  const edited=editSlide(current.document,current.notes,operations);
  const name=newName===undefined?current.name:short.min(1).parse(newName);
  const result=await database().query(
    "UPDATE public.slide_variants SET name=$3,document=$4::jsonb,notes=$5 WHERE id=$1::uuid AND slide_id=$2::uuid AND document=$6::jsonb AND notes=$7 AND name=$8 RETURNING id::text AS id",
    [variantId,slideId,name,JSON.stringify(edited.document),edited.notes,
      JSON.stringify(current.document),current.notes,current.name]);
  if(!result[0])throw new Error("variant_conflict");
  const saved=await getVariant(slideId,variantId);
  return {id:variantId,slideId,name,fingerprint:saved.fingerprint,
    edited:true,activeSlideUnchanged:true};
}

export async function activateVariant(slideId: string, variantId: string, expectedRevision?: number) {
  uuid.parse(slideId);uuid.parse(variantId);
  const db=database();
  const rows=await db.query(
    "SELECT s.presentation_id::text AS presentation_id,s.revision,s.document,s.notes,v.document AS variant_document,v.notes AS variant_notes FROM public.slides s JOIN public.slide_variants v ON v.slide_id=s.id WHERE s.id=$1::uuid AND v.id=$2::uuid",
    [slideId,variantId]);
  const row=rows[0];
  if(!row)throw new Error("variant_not_found");
  if(expectedRevision!==undefined && row.revision!==expectedRevision)throw new Error("revision_conflict");
  const doc=SlideDocumentSchema.parse(row.variant_document);
  const updated=await db.query("UPDATE public.slides SET document=$2::jsonb,notes=$3,revision=revision+1,updated_at=now() WHERE id=$1::uuid AND revision=$4 RETURNING revision",
    [slideId,JSON.stringify(doc),row.variant_notes,row.revision]);
  if(!updated[0])throw new Error("revision_conflict");
  // Archive the former slide, so the selection is reversible.
  let checkpointSaved=true;
  try{
    await db.query("INSERT INTO public.slide_variants(slide_id,name,document,notes) VALUES($1::uuid,$2,$3::jsonb,$4)",
      [slideId,"Historique r"+row.revision+" · restauration",JSON.stringify(row.document),row.notes]);
  }catch(error){
    console.error("Restore backup unavailable:",error instanceof Error?error.message:String(error));
    checkpointSaved=false;
  }
  return {slideId,revision:updated[0].revision,previousVersionSaved:checkpointSaved,
    ...(!checkpointSaved?{warning:"La version a été restaurée mais son état précédent n'a pas pu être archivé."}:{})};
}
