import { timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { z, ZodError } from "zod";
import { createEmptySlideDocument, SlideDocumentSchema } from "../../src/domain/slide";
import { createDeck, addSlides, createVariants, listVariants, saveAssets, listAssets } from "../../src/mcp/store";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const idSchema = z.uuid();
const titleSchema = z.string().trim().min(1).max(180);
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
          "SELECT p.id::text AS id, p.title, p.format, p.updated_at, COUNT(s.id)::int AS slide_count FROM public.presentations p LEFT JOIN public.slides s ON s.presentation_id=p.id GROUP BY p.id ORDER BY p.updated_at DESC LIMIT 200", []);
        return result({ ok: true, presentations });
      }
      if (operation === "presentation") {
        const id = idSchema.parse(query.searchParams.get("id"));
        const [p, slides] = await Promise.all([
          db.query("SELECT id::text AS id, title, description, format, updated_at FROM public.presentations WHERE id = $1::uuid", [id]),
          db.query("SELECT id::text AS id, presentation_id::text AS presentation_id, position, document, notes, revision, updated_at FROM public.slides WHERE presentation_id = $1::uuid ORDER BY position LIMIT 500", [id]),
        ]);
        if (!p[0]) return result({ ok: false, error: "not_found" }, 404);
        return result({ ok: true, presentation: p[0], slides });
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
      case "createPresentation": {
        const title = titleSchema.parse(data.title);
        const empty = JSON.stringify(createEmptySlideDocument());
        const rows = await db.query(
          "WITH p AS (INSERT INTO public.presentations (title) VALUES ($1) RETURNING id, title, format, updated_at), s AS (INSERT INTO public.slides(presentation_id,position,document) SELECT id, 0, $2::jsonb FROM p RETURNING id) SELECT p.id::text AS id, p.title, p.format, p.updated_at FROM p, s",
          [title, empty]);
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
        const rows = await db.query(
          "UPDATE public.slides SET document=$2::jsonb, notes=$3, revision=revision+1, updated_at=now() WHERE id=$1::uuid AND revision=$4 RETURNING id::text AS id, revision, updated_at",
          [id, JSON.stringify(doc), notes, revision]);
        return rows[0] ? result({ ok: true, slide: rows[0] }) : result({ ok: false, error: "revision_conflict" }, 409);
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
