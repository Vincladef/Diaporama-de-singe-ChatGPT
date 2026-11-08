import { z } from "zod";
import { AnimationStepSchema, createEmptySlideDocument, SlideDocumentSchema, SlideElementSchema, type SlideDocument, type SlideElement } from "../domain/slide.ts";

const limitCss = z.string().max(240_000);
const limitHtml = z.string().max(600_000);
const cssStyles = z.record(z.string(), z.union([z.string(), z.number()]));

export const SlideOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("replace_document"), document: SlideDocumentSchema }),
  z.object({ op: z.literal("set_html"), html: limitHtml }),
  z.object({ op: z.literal("append_html"), html: limitHtml }),
  z.object({ op: z.literal("set_css"), css: limitCss }),
  z.object({ op: z.literal("append_css"), css: limitCss }),
  z.object({ op: z.literal("set_canvas"), width: z.number().int().min(320).max(8192), height: z.number().int().min(240).max(8192) }),
  z.object({ op: z.literal("set_mode"), mode: z.enum(["structured", "freeform", "hybrid"]) }),
  z.object({ op: z.literal("upsert_element"), element: SlideElementSchema }),
  z.object({ op: z.literal("remove_element"), id: z.string().min(1) }),
  z.object({ op: z.literal("edit_element"), id: z.string().min(1), text: z.string().optional(),
    src: z.url().optional(), parentId: z.string().nullable().optional(), styles: cssStyles.optional(),
    replaceStyles: z.boolean().optional() }),
  z.object({ op: z.literal("move_element"), id: z.string().min(1), toIndex: z.number().int().min(0) }),
  z.object({ op: z.literal("set_elements"), elements: z.array(SlideElementSchema).max(1000) }),
  z.object({ op: z.literal("set_animations"), animations: z.array(AnimationStepSchema).max(1000) }),
  z.object({ op: z.literal("append_animation"), animation: AnimationStepSchema }),
  z.object({ op: z.literal("remove_animation"), id: z.string().min(1) }),
  z.object({ op: z.literal("set_notes"), notes: z.string().max(30_000) }),
]);
export type SlideOperation = z.infer<typeof SlideOperationSchema>;

export const InitialSlideSchema = z.object({
  html: limitHtml.optional(),
  css: limitCss.optional(),
  elements: z.array(SlideElementSchema).max(1000).optional(),
  animations: z.array(AnimationStepSchema).max(1000).optional(),
  notes: z.string().max(30_000).optional(),
  document: SlideDocumentSchema.optional(),
}).strict();
export type InitialSlide = z.infer<typeof InitialSlideSchema>;

export function initialSlide(input: InitialSlide = {}): { document: SlideDocument; notes: string } {
  if (input.document) return { document: SlideDocumentSchema.parse(input.document), notes: input.notes ?? "" };
  const d = createEmptySlideDocument();
  d.elements = input.elements ?? [];
  d.animations = input.animations ?? [];
  if (input.html !== undefined || input.css !== undefined) {
    d.freeform = { html: input.html ?? "", css: input.css ?? "" };
    d.mode = d.elements.length ? "hybrid" : "freeform";
  }
  return { document: SlideDocumentSchema.parse(d), notes: input.notes ?? "" };
}

function free(doc: SlideDocument): { html: string; css: string } {
  return doc.freeform ?? { html: "", css: "" };
}
function checkUnique(elements: SlideElement[]) {
  if (new Set(elements.map(e => e.id)).size !== elements.length) throw new Error("duplicate_element_id");
}
export function editSlide(
  current: SlideDocument, currentNotes: string, operations: SlideOperation[]
): { document: SlideDocument; notes: string } {
  if (operations.length > 80) throw new Error("too_many_operations");
  let doc = structuredClone(SlideDocumentSchema.parse(current)), notes = currentNotes;
  for (const raw of operations) {
    const step = SlideOperationSchema.parse(raw);
    switch (step.op) {
      case "replace_document": doc = structuredClone(step.document); break;
      case "set_html": case "append_html": {
        const f = free(doc);
        doc.freeform = { ...f, html: step.op === "set_html" ? step.html : f.html + step.html };
        if (doc.mode === "structured") doc.mode = doc.elements.length ? "hybrid" : "freeform";
        break;
      }
      case "set_css": case "append_css": {
        const f = free(doc);
        doc.freeform = { ...f, css: step.op === "set_css" ? step.css : f.css + step.css };
        if (doc.mode === "structured") doc.mode = doc.elements.length ? "hybrid" : "freeform";
        break;
      }
      case "set_canvas": doc.canvas = { width: step.width, height: step.height }; break;
      case "set_mode": doc.mode = step.mode; break;
      case "upsert_element": {
        const at = doc.elements.findIndex(e => e.id === step.element.id);
        if (at < 0) doc.elements.push(step.element);
        else doc.elements[at] = step.element;
        if (doc.mode === "freeform") doc.mode = "hybrid";
        break;
      }
      case "remove_element": {
        const removed = new Set([step.id]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const el of doc.elements) if (el.parentId && removed.has(el.parentId) && !removed.has(el.id)) {
            removed.add(el.id); changed = true;
          }
        }
        doc.elements = doc.elements.filter(e => !removed.has(e.id));
        doc.animations = doc.animations.filter(a => !removed.has(a.targetElementId));
        break;
      }
      case "edit_element": {
        const at = doc.elements.findIndex(e => e.id === step.id);
        if (at < 0) throw new Error("element_not_found:" + step.id);
        const el = doc.elements[at]!;
        doc.elements[at] = {
          ...el, ...(step.text !== undefined ? { text: step.text } : {}),
          ...(step.src !== undefined ? { src: step.src } : {}),
          ...(step.parentId === null ? { parentId: undefined } : step.parentId ? { parentId: step.parentId } : {}),
          styles: step.styles ? (step.replaceStyles ? step.styles : { ...el.styles, ...step.styles }) : el.styles,
        };
        break;
      }
      case "move_element": {
        const at = doc.elements.findIndex(e => e.id === step.id);
        if (at < 0) throw new Error("element_not_found:" + step.id);
        const [el] = doc.elements.splice(at, 1);
        doc.elements.splice(Math.min(step.toIndex, doc.elements.length), 0, el!);
        break;
      }
      case "set_elements": doc.elements = step.elements; break;
      case "set_animations": doc.animations = step.animations; break;
      case "append_animation": doc.animations = [...doc.animations.filter(a => a.id !== step.animation.id), step.animation]; break;
      case "remove_animation": doc.animations = doc.animations.filter(a => a.id !== step.id); break;
      case "set_notes": notes = step.notes; break;
    }
    checkUnique(doc.elements);
  }
  return { document: SlideDocumentSchema.parse(doc), notes };
}
export function summarizeSlide(slide: { id: string; position: number; document: SlideDocument; notes?: string; revision?: number }) {
  const d = slide.document;
  const excerpt = (d.freeform?.html ?? d.elements.filter(e => e.type === "text").map(e => e.text ?? "").join(" ")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 145);
  return { id: slide.id, position: slide.position, revision: slide.revision ?? 1,
    mode: d.mode, elementCount: d.elements.length, animationCount: d.animations.length, excerpt,
    hasNotes: !!slide.notes?.trim() };
}
