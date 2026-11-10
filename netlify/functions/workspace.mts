import { timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { z, ZodError } from "zod";
import { createEmptySlideDocument, SlideDocumentSchema } from "../../src/domain/slide";
import { createDeck, addSlides, createVariants, listVariants, saveAssets, listAssets, activateVariant } from "../../src/mcp/store";
import { recordSlideHistory, listSlideHistory } from "../../src/mcp/history";
import { getCreationInstructions, saveCreationInstructions, creationInstructionsSchema } from "../../src/mcp/instructions";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const idSchema = z.uuid();
const titleSchema = z.string().trim().min(1).max(180);
const folderNameSchema=z.string().trim().min(1).max(120);
const folderIdSchema=z.union([z.uuid(),z.null()]);
const notesSchema = z.string().max(30000);
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
      if(operation==="creationInstructions"){
        const id=query.searchParams.get("id")||undefined;
        if(id)idSchema.parse(id);
        return result(await getCreationInstructions(id));
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
    const body = await request.text();
    if (body.length > 1800000) return result({ ok: false, error: "payload_too_large" }, 413);
    let data: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(body);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return result({ ok: false, error: "invalid_body" }, 400);
      data = parsed as Record<string, unknown>;
    } catch { return result({ ok: false, error: "invalid_json" }, 400); }

    switch (data.action) {
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
