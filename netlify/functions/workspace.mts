import { timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { z, ZodError } from "zod";
import { createEmptySlideDocument, SlideDocumentSchema } from "../../src/domain/slide";
import { createDeck, addSlides, createVariants, listVariants, saveAssets, listAssets, activateVariant } from "../../src/mcp/store";
import { recordSlideHistory, listSlideHistory } from "../../src/mcp/history";
import { getCreationInstructions, saveCreationInstructions, creationInstructionsSchema } from "../../src/mcp/instructions";
import {listSlidePreferences,saveVariantPreference,recordVariantSelection} from "../../src/mcp/visualPreferences";
import { addCreationReference, removeCreationReference, getCreationReferenceFile, MAX_REFERENCE_SIZE } from "../../src/mcp/creationReferences";
import {listVisualReferencePages,generateVisualReferencePages,readVisualReferenceImage,
  updateVisualReferenceSelection,updateVisualReferenceKind,kindSchema} from "../../src/mcp/referencePages";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const idSchema = z.uuid();
const titleSchema = z.string().trim().min(1).max(180);
const folderNameSchema=z.string().trim().min(1).max(120);
const folderIdSchema=z.union([z.uuid(),z.null()]);
const notesSchema = z.string().max(30000);
const promptExampleUrlSchema=z.string().trim().min(1).max(1500).refine(value=>
  /^https?:\/\/[^\s]+$/i.test(value)||/^\/prompt-examples\/[a-z0-9._\-/]+\.svg$/i.test(value),
  "invalid_image_url");
const promptItemSchema=z.object({
  id:z.uuid().optional(),version:z.number().int().min(1).optional(),
  category:z.enum(["socle","styles","compositions","skills","references"]),
  title:z.string().trim().min(1).max(120),
  description:z.string().max(800),prompt:z.string().max(12000),
  previewUrl:z.string().max(1500),exampleImages:z.array(promptExampleUrlSchema).max(12).default([]),
  status:z.enum(["draft","active","rejected","disabled"])
});
const promptColumns='id::text AS id,category,title,description,prompt,preview_url AS "previewUrl",'+
  'example_images AS "exampleImages",'+
  'status,version,created_at AS "createdAt",updated_at AS "updatedAt"';
const feedbackCategory=z.enum(["style","composition","typography","images","diagram","content",
  "animation","ergonomics","technical","other"]);
const feedbackKind=z.enum(["positive","issue","idea","observation"]);
const feedbackSchema=z.object({
  category:feedbackCategory,kind:feedbackKind,
  content:z.string().trim().min(1).max(2400)
}).strict();
const feedbackColumns='id::text AS id,category,kind,content,'+
  "'note' AS source,created_at AS \"createdAt\",NULL::text AS \"presentationTitle\",NULL::text AS \"variantName\"";
function result(payload: unknown, status = 200): Response {
  return Response.json(payload, { status, headers });
}
function authorized(request: Request, expected: string): boolean {
  const given = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export default async function workspace(request: Request): Promise<Response> {
  const secret = process.env.EDITOR_ACCESS_TOKEN;
  if (!secret || secret.length < 20) return result({ ok: false, error: "access_not_configured" }, 503);
  if (!authorized(request, secret)) return result({ ok: false, error: "unauthorized" }, 401);
  const url = process.env.DATABASE_URL;
  if (!url) return result({ ok: false, error: "database_not_configured" }, 503);
  const db = neon(url);
  try {
    if (request.method === "GET") {
      const query = new URL(request.url);
      const operation = query.searchParams.get("op") ?? "list";
      if (operation === "list") {
        const presentations = await db.query(
          "SELECT p.id::text AS id, p.title, p.format, p.updated_at, p.folder_id::text AS folder_id, COUNT(s.id)::int AS slide_count FROM public.presentations p LEFT JOIN public.slides s ON s.presentation_id=p.id GROUP BY p.id ORDER BY p.updated_at DESC LIMIT 200", []);
        return result({ ok: true, presentations });
      }
      if(operation==="variantPreferences"){
        const slideId=idSchema.parse(query.searchParams.get("id"));
        return result({ok:true,...await listSlidePreferences(slideId)});
      }
      if(operation==="promptLibrary"){
        const items=await db.query("SELECT "+promptColumns+
          " FROM public.prompt_library_items ORDER BY updated_at DESC LIMIT 300",[]);
        return result({ok:true,items});
      }
      if(operation==="promptFeedbackJournal"){
        const [manual,visual]=await Promise.all([
          db.query("SELECT "+feedbackColumns+
            " FROM public.prompt_feedback_journal ORDER BY created_at DESC LIMIT 400",[]),
          db.query("SELECT ('variant:' || v.id::text) AS id,"+
            "CASE v.slide_kind WHEN 'photographique' THEN 'images' WHEN 'graphique' THEN 'diagram' "+
            "WHEN 'schématique' THEN 'diagram' WHEN 'comparatif' THEN 'composition' "+
            "WHEN 'typographique' THEN 'typography' ELSE 'composition' END AS category,"+
            "CASE v.kind WHEN 'selected' THEN 'choice' WHEN 'disliked' THEN 'issue' "+
            "ELSE 'positive' END AS kind,"+
            "COALESCE(NULLIF(v.comment,''),CASE v.kind "+
            "WHEN 'selected' THEN 'Variante choisie : '||v.variant_name "+
            "WHEN 'disliked' THEN 'Variante écartée : '||v.variant_name "+
            "ELSE 'Variante enregistrée : '||v.variant_name END) AS content,"+
            "'variant' AS source,v.updated_at AS \"createdAt\",p.title AS \"presentationTitle\", "+
            "v.variant_name AS \"variantName\" "+
            "FROM public.slide_visual_preferences v "+
            "LEFT JOIN public.presentations p ON p.id=v.presentation_id "+
            "ORDER BY v.updated_at DESC LIMIT 400",[])
        ]);
        const items=[...manual,...visual].sort((a,b)=>
          new Date(String(b.createdAt)).getTime()-new Date(String(a.createdAt)).getTime()
        ).slice(0,500);
        return result({ok:true,items});
      }
      if(operation==="creationInstructions"){
        const id=query.searchParams.get("id")||undefined;
        if(id)idSchema.parse(id);
        return result(await getCreationInstructions(id));
      }
      if(operation==="referencePages"){
        const id=idSchema.parse(query.searchParams.get("id"));
        return result(await listVisualReferencePages(id));
      }
      if(operation==="referencePageImage"){
        const id=idSchema.parse(query.searchParams.get("id"));
        const page=z.coerce.number().int().min(1).max(100).parse(query.searchParams.get("page"));
        const image=await readVisualReferenceImage(id,page);
        return new Response(Buffer.from(image.base64,"base64"),{status:200,headers:{
          ...headers,"Content-Type":"image/png","Content-Disposition":"inline",
          "X-Frame-Options":"DENY",
        }});
      }
      if(operation==="creationReferenceFile"){
        const id=idSchema.parse(query.searchParams.get("id"));
        const file=await getCreationReferenceFile(id);
        if(!file)return result({error:"not_found"},404);
        const safeName=file.filename.replace(/["\r\n]/g,"_");
        return new Response(Buffer.from(file.base64,"base64"),{status:200,headers:{
          ...headers,"Content-Type":"application/octet-stream",
          "Content-Disposition":'attachment; filename="'+safeName+'"',
        }});
      }
      if(operation==="folders"){
        const folders=await db.query(
          "SELECT f.id::text AS id,f.name,f.parent_id::text AS parent_id,f.created_at,COUNT(p.id)::int AS presentation_count "+
          "FROM public.folders f LEFT JOIN public.presentations p ON p.folder_id=f.id "+
          "GROUP BY f.id ORDER BY lower(f.name),f.created_at",[]);
        return result({ok:true,folders});
      }
      if(operation==="cover"){
        const id=idSchema.parse(query.searchParams.get("id"));
        const slides=await db.query(
          "SELECT s.document FROM public.slides s WHERE s.presentation_id=$1::uuid ORDER BY s.position LIMIT 1",[id]);
        return slides[0]?result({ok:true,document:slides[0].document}):
          result({ok:true,document:null});
      }
      if (operation === "presentation") {
        const id = idSchema.parse(query.searchParams.get("id"));
        const [p, slides] = await Promise.all([
          db.query("SELECT id::text AS id, title, description, format, folder_id::text AS folder_id, updated_at FROM public.presentations WHERE id = $1::uuid", [id]),
          db.query("SELECT id::text AS id, presentation_id::text AS presentation_id, position, document, notes, revision, updated_at FROM public.slides WHERE presentation_id = $1::uuid ORDER BY position LIMIT 500", [id]),
        ]);
        if (!p[0]) return result({ ok: false, error: "not_found" }, 404);
        return result({ ok: true, presentation: p[0], slides });
      }
      if (operation === "history") {
        const id=idSchema.parse(query.searchParams.get("id"));
        const limit=z.coerce.number().int().min(1).max(30).parse(query.searchParams.get("limit")??"20");
        return result({ok:true,...await listSlideHistory(id,limit,true)});
      }
      if (operation === "revisions") {
        const id=idSchema.parse(query.searchParams.get("id"));
        const [deck, slides]=await Promise.all([
          db.query("SELECT id::text AS id,title FROM public.presentations WHERE id=$1::uuid",[id]),
          db.query("SELECT id::text AS id,position,revision FROM public.slides WHERE presentation_id=$1::uuid ORDER BY position LIMIT 500",[id]),
        ]);
        if(!deck[0])return result({ok:false,error:"not_found"},404);
        return result({id:deck[0].id,title:deck[0].title,slides});
      }
      return result({ ok: false, error: "unknown_operation" }, 400);
    }
    if (request.method !== "POST") return result({ ok: false, error: "method_not_allowed" }, 405);
    if((request.headers.get("content-type")??"").startsWith("multipart/form-data")){
      const declared=Number(request.headers.get("content-length")||"0");
      if(declared>MAX_REFERENCE_SIZE+500_000)return result({error:"payload_too_large"},413);
      const form=await request.formData();
      if(form.get("action")!=="uploadCreationReference")return result({error:"unknown_action"},400);
      const file=form.get("file");
      if(!file||typeof file==="string")return result({error:"invalid_reference_file"},400);
      if(file.size>MAX_REFERENCE_SIZE||file.size===0)return result({error:"payload_too_large"},413);
      return result({ok:true,reference:await addCreationReference(file.name,new Uint8Array(await file.arrayBuffer()))},201);
    }
    const body = await request.text();
    if (body.length > 1800000) return result({ ok: false, error: "payload_too_large" }, 413);
    let data: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return result({ ok: false, error: "invalid_body" }, 400);
      data = parsed as Record<string, unknown>;
    } catch { return result({ ok: false, error: "invalid_json" }, 400); }

    switch (data.action) {
      case "renderReferencePages":{
        const id=idSchema.parse(data.id);
        const start=z.number().int().min(1).max(100).parse(data.start);
        const count=z.number().int().min(1).max(3).parse(data.count??3);
        return result({ok:true,...await generateVisualReferencePages(id,start,count)});
      }
      case "updateReferenceSelection":{
        const id=idSchema.parse(data.id);
        const pages=z.array(z.number().int().min(1).max(100)).max(100).parse(data.pages);
        return result({ok:true,...await updateVisualReferenceSelection(id,pages)});
      }
      case "updateReferenceKind":{
        const id=idSchema.parse(data.id);
        const page=z.number().int().min(1).max(100).parse(data.page);
        const kind=kindSchema.parse(data.kind);
        return result({ok:true,...await updateVisualReferenceKind(id,page,kind)});
      }
      case "removeCreationReference":{
        const id=idSchema.parse(data.id);
        return result({ok:true,removed:await removeCreationReference(id)});
      }
      case "deletePromptLibraryItem":{
        const id=idSchema.parse(data.id);
        const version=z.number().int().min(1).parse(data.version);
        const rows=await db.query(
          "DELETE FROM public.prompt_library_items WHERE id=$1::uuid AND version=$2 RETURNING id",
          [id,version]);
        if(!rows[0])return result({ok:false,error:"revision_conflict"},409);
        return result({ok:true});
      }
      case "savePromptFeedback":{
        const feedback=feedbackSchema.parse(data.feedback);
        const rows=await db.query(
          "INSERT INTO public.prompt_feedback_journal(category,kind,content) "+
          "VALUES($1,$2,$3) RETURNING "+feedbackColumns,
          [feedback.category,feedback.kind,feedback.content]);
        return result({ok:true,item:rows[0]},201);
      }
      case "savePromptLibraryItem":{
        const item=promptItemSchema.parse(data.item);
        if(item.id){
          const rows=await db.query(
            "UPDATE public.prompt_library_items SET category=$2,title=$3,description=$4,prompt=$5,"+
            "preview_url=$6,example_images=$7::jsonb,status=$8,version=version+1,updated_at=now() WHERE id=$1::uuid AND version=$9::int "+
            "RETURNING "+promptColumns,
            [item.id,item.category,item.title,item.description,item.prompt,item.previewUrl,JSON.stringify(item.exampleImages),item.status,item.version??0]);
          if(!rows[0])return result({ok:false,error:"revision_conflict"},409);
          return result({ok:true,item:rows[0]});
        }
        const rows=await db.query(
          "INSERT INTO public.prompt_library_items(category,title,description,prompt,preview_url,example_images,status) "+
          "VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING "+promptColumns,
          [item.category,item.title,item.description,item.prompt,item.previewUrl,JSON.stringify(item.exampleImages),item.status]);
        return result({ok:true,item:rows[0]},201);
      }
      case "saveCreationInstructions":{
        const scope=z.enum(["global","presentation"]).parse(data.scope);
        const instructions=creationInstructionsSchema.parse(data.instructions);
        const presentationId=data.presentationId===undefined?undefined:idSchema.parse(data.presentationId);
        if(scope==="presentation"&&!presentationId)return result({error:"invalid_presentation_id"},400);
        return result(await saveCreationInstructions(scope,instructions,presentationId));
      }
      case "importPresentation": {
        // Import always creates a NEW deck. The source deck is never modified.
        const title=titleSchema.parse(data.title);
        const slides=z.array(z.object({document:SlideDocumentSchema,notes:notesSchema.optional()}))
          .min(1).max(40).parse(data.slides);
        const response=await createDeck(title,slides);
        return result({ok:true,presentation:{id:response.id,title:response.title},
          importedSlides:response.slides},201);
      }
      case "appendImportedSlides": {
        const id=idSchema.parse(data.presentationId);
        const slides=z.array(z.object({document:SlideDocumentSchema,notes:notesSchema.optional()}))
          .min(1).max(40).parse(data.slides);
        return result({ok:true,...await addSlides(id,slides)},201);
      }
      case "createFolder": {
        const name=folderNameSchema.parse(data.name);
        const parentId=folderIdSchema.parse(data.parentId??null);
        if(parentId){
          const exists=await db.query("SELECT id FROM public.folders WHERE id=$1::uuid",[parentId]);
          if(!exists[0])return result({ok:false,error:"folder_not_found"},404);
        }
        const rows=await db.query(
          "INSERT INTO public.folders(name,parent_id) VALUES($1,$2::uuid) "+
          "RETURNING id::text AS id,name,parent_id::text AS parent_id,created_at",[name,parentId]);
        return result({ok:true,folder:rows[0]},201);
      }
      case "renameFolder": {
        const id=idSchema.parse(data.id),name=folderNameSchema.parse(data.name);
        const rows=await db.query(
          "UPDATE public.folders SET name=$2 WHERE id=$1::uuid "+
          "RETURNING id::text AS id,name,parent_id::text AS parent_id,created_at",[id,name]);
        return rows[0]?result({ok:true,folder:rows[0]}):result({ok:false,error:"folder_not_found"},404);
      }
      case "deleteFolder": {
        const id=idSchema.parse(data.id);
        // Foreign keys move presentations and child folders to the root on deletion.
        const rows=await db.query(
          "DELETE FROM public.folders WHERE id=$1::uuid RETURNING id::text AS id",[id]);
        return rows[0]?result({ok:true,deleted:true}):result({ok:false,error:"folder_not_found"},404);
      }
      case "movePresentation": {
        const id=idSchema.parse(data.id),folderId=folderIdSchema.parse(data.folderId??null);
        const rows=await db.query(
          "UPDATE public.presentations SET folder_id=$2::uuid,updated_at=now() "+
          "WHERE id=$1::uuid AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM public.folders WHERE id=$2::uuid)) "+
          "RETURNING id::text AS id,folder_id::text AS folder_id",[id,folderId]);
        return rows[0]?result({ok:true,presentation:rows[0]}):result({ok:false,error:"presentation_or_folder_not_found"},404);
      }
      case "moveFolder": {
        const id=idSchema.parse(data.id),parentId=folderIdSchema.parse(data.parentId??null);
        if(parentId===id)return result({ok:false,error:"folder_cycle"},400);
        const rows=await db.query(
          "WITH RECURSIVE descendants AS "+
          "(SELECT id FROM public.folders WHERE id=$1::uuid UNION ALL "+
          "SELECT f.id FROM public.folders f JOIN descendants d ON f.parent_id=d.id) "+
          "UPDATE public.folders f SET parent_id=$2::uuid WHERE f.id=$1::uuid "+
          "AND ($2::uuid IS NULL OR (EXISTS (SELECT 1 FROM public.folders WHERE id=$2::uuid) "+
          "AND NOT EXISTS(SELECT 1 FROM descendants WHERE id=$2::uuid))) "+
          "RETURNING f.id::text AS id",[id,parentId]);
        return rows[0]?result({ok:true,moved:true}):result({ok:false,error:"folder_cycle_or_not_found"},400);
      }
      case "createPresentation": {
        const title = titleSchema.parse(data.title);
        const folderId=folderIdSchema.parse(data.folderId??null);
        if(folderId){
          const folders=await db.query("SELECT id FROM public.folders WHERE id=$1::uuid",[folderId]);
          if(!folders[0])return result({ok:false,error:"folder_not_found"},404);
        }
        const empty = JSON.stringify(createEmptySlideDocument());
        const rows = await db.query(
          "WITH p AS (INSERT INTO public.presentations (title,folder_id) VALUES ($1,$3::uuid) RETURNING id, title, format, folder_id, updated_at), s AS (INSERT INTO public.slides(presentation_id,position,document) SELECT id, 0, $2::jsonb FROM p RETURNING id) SELECT p.id::text AS id, p.title, p.format, p.folder_id::text AS folder_id, p.updated_at FROM p, s",
          [title, empty,folderId]);
        return result({ ok: true, presentation: rows[0] }, 201);
      }
      case "renamePresentation": {
        const id = idSchema.parse(data.id), title = titleSchema.parse(data.title);
        const rows = await db.query("UPDATE public.presentations SET title=$2, updated_at=now() WHERE id=$1::uuid RETURNING id::text AS id, title, format, updated_at", [id, title]);
        return rows[0] ? result({ ok: true, presentation: rows[0] }) : result({ ok: false, error: "not_found" }, 404);
      }
      case "deletePresentation": {
        const id = idSchema.parse(data.id);
        const rows = await db.query("DELETE FROM public.presentations WHERE id=$1::uuid RETURNING id::text AS id", [id]);
        return rows[0] ? result({ ok: true }) : result({ ok: false, error: "not_found" }, 404);
      }
      case "addSlide": {
        const id = idSchema.parse(data.presentationId), empty = JSON.stringify(createEmptySlideDocument());
        const rows = await db.query(
          "INSERT INTO public.slides (presentation_id,position,document) SELECT p.id,(SELECT COALESCE(MAX(position),-1)+1 FROM public.slides WHERE presentation_id=p.id),$2::jsonb FROM public.presentations p WHERE p.id=$1::uuid RETURNING id::text AS id",
          [id, empty]);
        return rows[0] ? result({ ok: true, slide: rows[0] }, 201) : result({ ok: false, error: "not_found" }, 404);
      }
      case "duplicateSlide": {
        const id = idSchema.parse(data.id);
        const rows = await db.query(
          "WITH original AS (SELECT presentation_id,document,notes FROM public.slides WHERE id=$1::uuid) INSERT INTO public.slides(presentation_id,position,document,notes) SELECT original.presentation_id,(SELECT COALESCE(MAX(position),-1)+1 FROM public.slides WHERE presentation_id=original.presentation_id),original.document,original.notes FROM original RETURNING id::text AS id",
          [id]);
        return rows[0] ? result({ ok: true, slide: rows[0] }, 201) : result({ ok: false, error: "not_found" }, 404);
      }
      case "saveSlide": {
        const id = idSchema.parse(data.id);
        const revision = z.number().int().min(1).parse(data.revision);
        const doc = SlideDocumentSchema.parse(data.document);
        const notes = notesSchema.parse(data.notes ?? "");
        const before=await db.query(
          "SELECT document,notes,revision FROM public.slides WHERE id=$1::uuid AND revision=$2",
          [id,revision]);
        if(!before[0])return result({ok:false,error:"revision_conflict"},409);
        const rows = await db.query(
          "UPDATE public.slides SET document=$2::jsonb, notes=$3, revision=revision+1, updated_at=now() WHERE id=$1::uuid AND revision=$4 RETURNING id::text AS id, revision, updated_at",
          [id, JSON.stringify(doc), notes, revision]);
        if(!rows[0])return result({ok:false,error:"revision_conflict"},409);
        // Keep the home library's "recently edited" sorting in sync with slides.
        try{
          await db.query("UPDATE public.presentations SET updated_at=now() "+
            "WHERE id=(SELECT presentation_id FROM public.slides WHERE id=$1::uuid)",[id]);
        }catch(e){console.error("Failed to update presentation timestamp",e instanceof Error?e.message:String(e));}
        let historyWarning:string|undefined;
        try{
          await recordSlideHistory([{slideId:id,revision,document:SlideDocumentSchema.parse(before[0].document),
            notes:String(before[0].notes??""),origin:"éditeur"}]);
        }catch(e){
          console.error("History snapshot failed:",e instanceof Error?e.message:String(e));
          historyWarning="Enregistré, mais l'instantané précédent n'a pas été conservé.";
        }
        return result({ok:true,slide:rows[0],...(historyWarning?{historyWarning}:{})});
      }
      case "restoreSlideHistory": {
        const slideId=idSchema.parse(data.slideId),checkpointId=idSchema.parse(data.checkpointId);
        const revision=z.number().int().min(1).parse(data.revision);
        const exists=await listSlideHistory(slideId,60,false);
        if(!exists.items.some(r=>r.id===checkpointId))
          return result({ok:false,error:"history_not_found"},404);
        try{
          const restored=await activateVariant(slideId,checkpointId,revision);
          return result({ok:true,...restored});
        }catch(e){
          if(e instanceof Error&&e.message.includes("revision_conflict"))
            return result({ok:false,error:"revision_conflict"},409);
          throw e;
        }
      }
      case "reorderSlides": {
        const id=idSchema.parse(data.presentationId);
        const ids=z.array(idSchema).max(500).parse(data.orderedIds);
        const rows=await db.query("SELECT public.mcp_reorder_slides($1::uuid,$2::uuid[]) AS reordered",[id,ids]);
        return result({ok:true,reordered:rows[0]?.reordered??0});
      }
      case "createVariants": {
        const slideId=idSchema.parse(data.slideId);
        const variants=z.array(z.object({
          name:z.string().min(1).max(120),
          slide:z.object({ document:SlideDocumentSchema,notes:notesSchema.optional() }),
        })).min(1).max(8).parse(data.variants);
        const resultData=await createVariants(slideId,variants);
        return result({ok:true,...resultData},201);
      }
      case "listVariants": {
        const slideId=idSchema.parse(data.slideId);
        const variants=await listVariants(slideId,true);
        return result({ok:true,variants});
      }
      case "setVariantPreference": {
        const slideId=idSchema.parse(data.slideId);
        const variantId=idSchema.parse(data.variantId);
        const kind=z.enum(["selected","disliked","saved"]).parse(data.kind);
        const scope=z.enum(["global","presentation"]).parse(data.scope);
        const active=z.boolean().default(true).parse(data.active);
        const comment=z.string().max(1200).optional().parse(data.comment);
        return result(await saveVariantPreference({slideId,variantId,kind,scope,active,comment}));
      }
      case "switchVariant": {
        // Switch the active slide immediately. Archive the former A/B/C before leaving it.
        const slideId=idSchema.parse(data.slideId);
        const requested=z.union([idSchema,z.null()]).parse(data.variantId);
        const revision=z.number().int().min(1).parse(data.revision);
        const originalName="A · Original (automatique)";
        const before=await db.query(
          "SELECT document,notes,revision FROM public.slides WHERE id=$1::uuid AND revision=$2",
          [slideId,revision]);
        if(!before[0])return result({ok:false,error:"revision_conflict"},409);
        const previous=SlideDocumentSchema.parse(before[0].document);
        const choices=await listVariants(slideId,true);
        const existingOriginal=choices.find(x=>x.id===previous.variantSelection?.originalId)
          ??choices.find(x=>x.name===originalName);
        const currentSelection=previous.variantSelection?.activeId??existingOriginal?.id??null;
        const targetId=requested??existingOriginal?.id??null;
        if(!targetId||targetId===currentSelection){
          return result({ok:true,unchanged:true,slide:{
            revision,document:previous,notes:String(before[0].notes??""),updated_at:null,
          }});
        }
        const target=choices.find(x=>x.id===targetId);
        if(!target)return result({ok:false,error:"variant_not_found"},404);
        const sourceDocument=structuredClone(previous);
        delete sourceDocument.variantSelection;
        let originalId=existingOriginal?.id;
        if(!originalId){
          const backup=await db.query(
            "INSERT INTO public.slide_variants(slide_id,name,document,notes) VALUES($1::uuid,$2,$3::jsonb,$4) RETURNING id::text AS id",
            [slideId,originalName,JSON.stringify(sourceDocument),String(before[0].notes??"")]);
          originalId=backup[0]?.id;
        }
        if(!originalId)throw new Error("original_variant_backup_failed");
        const selected=SlideDocumentSchema.parse({
          ...target.document,variantSelection:{originalId,activeId:targetId},
        });
        const previousId=previous.variantSelection?.activeId??originalId;
        // CAS and the previous variant's update are committed in one SQL statement.
        const rows=await db.query(
          "WITH switched AS (UPDATE public.slides SET document=$3::jsonb,notes=$4,revision=revision+1,updated_at=now() "+
          "WHERE id=$1::uuid AND revision=$2 RETURNING id,presentation_id,revision,updated_at), "+
          "archived AS (UPDATE public.slide_variants SET document=$6::jsonb,notes=$7 WHERE id=$5::uuid "+
          "AND slide_id=$1::uuid AND EXISTS(SELECT 1 FROM switched) RETURNING id), "+
          "touched AS (UPDATE public.presentations SET updated_at=now() "+
          "WHERE id IN (SELECT presentation_id FROM switched) RETURNING id) "+
          "SELECT revision,updated_at,(SELECT count(*)::int FROM archived) AS previous_saved FROM switched",
          [slideId,revision,JSON.stringify(selected),String(target.notes??""),
            previousId,JSON.stringify(sourceDocument),String(before[0].notes??"")]);
        if(!rows[0])return result({ok:false,error:"revision_conflict"},409);
        let preferenceRecorded=true;
        try{await recordVariantSelection(slideId,targetId);}
        catch(error){
          preferenceRecorded=false;
          console.error("Variant preference could not be recorded",error instanceof Error?error.message:String(error));
        }
        return result({ok:true,slide:{
          revision:rows[0].revision,updated_at:rows[0].updated_at,
          document:selected,notes:String(target.notes??""),
        },preferenceRecorded,previousSaved:Number(rows[0].previous_saved)>0});
      }
      case "saveAssets": {
        const id=idSchema.parse(data.presentationId);
        const assets=z.array(z.object({url:z.url(),label:z.string().max(140).optional(),
          source:z.string().max(140).optional(),rights:z.string().max(400).optional()})).min(1).max(20).parse(data.assets);
        return result({ok:true,...await saveAssets(id,assets)},201);
      }
      case "listAssets": {
        const id=idSchema.parse(data.presentationId);
        return result({ok:true,assets:await listAssets(id,150)});
      }
      case "deleteSlide": {
        const id = idSchema.parse(data.id);
        const rows = await db.query("DELETE FROM public.slides WHERE id=$1::uuid RETURNING id::text AS id", [id]);
        return rows[0] ? result({ ok: true }) : result({ ok: false, error: "not_found" }, 404);
      }
      default: return result({ ok: false, error: "unknown_action" }, 400);
    }
  } catch (error) {
    if (error instanceof ZodError) return result({ ok: false, error: "invalid_input", issues: error.issues.slice(0, 5) }, 400);
    console.error("workspace failed", error instanceof Error ? error.message : "unknown");
    return result({ ok: false, error: "internal_error" }, 500);
  }
}
