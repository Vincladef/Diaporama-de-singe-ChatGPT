import { z } from "zod";
import { database } from "./security.ts";

const uuid = z.uuid();
const textSchema = z.string().max(12000);

export function combineCreationInstructions(global: string, presentation: string): string {
  if (!presentation.trim()) return global;
  if (!global.trim()) return presentation;
  return global.trim() + "\n\n" +
    "INSTRUCTIONS SPÉCIFIQUES À CETTE PRÉSENTATION (prioritaires en cas de conflit) :\n" +
    presentation.trim();
}

export async function getCreationInstructions(presentationId?: string) {
  if (presentationId) uuid.parse(presentationId);
  const db = database();
  const [globalRows, presentationRows] = await Promise.all([
    db.query("SELECT instructions,updated_at FROM public.slide_creation_instructions WHERE id=1",[]),
    presentationId
      ? db.query("SELECT settings->>'creationInstructions' AS instructions FROM public.presentations WHERE id=$1::uuid",[presentationId])
      : Promise.resolve([]),
  ]);
  if (presentationId && !presentationRows[0]) throw new Error("presentation_not_found");
  const global = String(globalRows[0]?.instructions ?? "");
  const presentation = String(presentationRows[0]?.instructions ?? "");
  return {
    global, presentation,
    effective: combineCreationInstructions(global, presentation),
    precedence: "Les instructions propres à la présentation priment en cas de contradiction.",
    presentationId: presentationId ?? null,
    updatedAt: globalRows[0]?.updated_at ?? null,
  };
}

export async function saveCreationInstructions(
  scope: "global" | "presentation", instructions: string, presentationId?: string
) {
  const value=textSchema.parse(instructions);
  const db=database();
  if (scope==="global") {
    await db.query(
      "INSERT INTO public.slide_creation_instructions(id,instructions) VALUES(1,$1) "+
      "ON CONFLICT(id) DO UPDATE SET instructions=EXCLUDED.instructions,updated_at=now()",
      [value]);
  } else {
    if (!presentationId) throw new Error("invalid_presentation_id");
    uuid.parse(presentationId);
    const rows=await db.query(
      "UPDATE public.presentations SET settings=CASE WHEN $2::text='' "+
      "THEN COALESCE(settings,'{}'::jsonb)-'creationInstructions' "+
      "ELSE jsonb_set(COALESCE(settings,'{}'::jsonb),'{creationInstructions}',to_jsonb($2::text),true) END, "+
      "updated_at=now() WHERE id=$1::uuid RETURNING id",
      [presentationId,value]);
    if (!rows[0]) throw new Error("presentation_not_found");
  }
  return getCreationInstructions(presentationId);
}
