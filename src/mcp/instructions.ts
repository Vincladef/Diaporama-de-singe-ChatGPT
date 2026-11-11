import { z } from "zod";
import { database } from "./security.ts";
import { listCreationReferences } from "./creationReferences.ts";
import { searchVisualReferencePages } from "./referencePages.ts";
import {listRelevantVisualPreferences} from "./visualPreferences.ts";

const uuid = z.uuid();
export const creationInstructionsSchema = z.string();

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
  const [globalRows, presentationRows, references, visual, preferences] = await Promise.all([
    db.query("SELECT instructions,updated_at FROM public.slide_creation_instructions WHERE id=1",[]),
    presentationId
      ? db.query("SELECT settings->>'creationInstructions' AS instructions FROM public.presentations WHERE id=$1::uuid",[presentationId])
      : Promise.resolve([]),
    listCreationReferences(),
    searchVisualReferencePages({limit:20}).catch(()=>({pages:[]})),
    listRelevantVisualPreferences(presentationId),
  ]);
  if (presentationId && !presentationRows[0]) throw new Error("presentation_not_found");
  const global = String(globalRows[0]?.instructions ?? "");
  const presentation = String(presentationRows[0]?.instructions ?? "");
  const approvedItems=await db.query(
    "SELECT category,title,description,prompt FROM public.prompt_library_items "+
    "WHERE status='active' ORDER BY updated_at DESC LIMIT 12",[]).catch(()=>[]);
  const librarySection=approvedItems.length?
    "\n\nRESSOURCES VALIDÉES DE LA BIBLIOTHÈQUE DE PROMPTS : "+
    "suggestions facultatives, à choisir selon le propos ; ne pas toutes les appliquer à la fois.\n"+
    approvedItems.map(row=>"## "+row.title+" ("+row.category+")\n"+
      String(row.description??"")+"\n"+String(row.prompt??"").slice(0,1400)).join("\n"):"";
  const effective=combineCreationInstructions(global,presentation)+
    (references.length?"\n\nRÉFÉRENCES DE DIAPORAMAS JOINTES : "+
      "utiliser les analyses ci-dessous ; pour les images, inspect_creation_reference permet de voir le visuel.\n"+
      references.map(ref=>"- "+ref.filename+" ["+ref.id+"] : "+ref.analysis.slice(0,1600)).join("\n"):"")+
    (visual.pages.length?"\n\nPAGES VISUELLES SÉLECTIONNÉES : "+ 
      "inspecter les images correspondantes avec inspect_reference_page AVANT de concevoir une composition ; "+
      "ne pas copier leur contenu textuel.\n"+
      visual.pages.map(page=>"- Référence "+page.referenceId+" page "+page.slideNumber+" ["+page.visualKind+
        "] : "+(page.layout?.composition??"composition à examiner")).join("\n"):"")+
    (preferences.summary?"\n\n"+preferences.summary:"")+librarySection;
  return {
    global, presentation, references,
    visualPages:visual.pages,
    visualPreferences:{count:preferences.preferenceCount,summary:preferences.summary},
    effective,
    precedence: "Les instructions propres à la présentation priment en cas de contradiction.",
    presentationId: presentationId ?? null,
    updatedAt: globalRows[0]?.updated_at ?? null,
  };
}

export async function saveCreationInstructions(
  scope: "global" | "presentation", instructions: string, presentationId?: string
) {
  const value=creationInstructionsSchema.parse(instructions);
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
