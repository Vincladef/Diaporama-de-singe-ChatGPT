import {z} from "zod";
import {database} from "./security.ts";

import {designProfile,inferPurpose} from "../preferences/profile.ts";
import {rankVisualPreferences,summarizeVisualPreferenceGuide,
 type PreferenceKind,type PreferenceScope,type PreferenceView} from "../preferences/ranking.ts";
import type {VisualKind} from "../creative/referenceLibrary.ts";

const scopeSchema=z.enum(["global","presentation"]);
const kindSchema=z.enum(["selected","disliked","saved"]);
const sourceSchema=z.object({
 referenceId:z.uuid(),slideNumber:z.number().int().min(1).max(1000)
}).strict();
export const VisualReferenceUsedSchema=z.array(sourceSchema).max(12);
const text=z.string().max(1200);

export type SavePreferenceInput={
 slideId:string;variantId:string;kind:PreferenceKind;
 scope:PreferenceScope;comment?:string;active?:boolean;
 incrementSelection?:boolean;
};
function mapped(row:Record<string,any>,includeDocument=false):PreferenceView{
 return {
  id:String(row.id),slideId:String(row.slide_id),variantId:String(row.variant_id),
  presentationId:String(row.presentation_id),kind:row.kind,scope:row.scope,
  comment:String(row.comment??""),slideKind:row.slide_kind as VisualKind,
  variantName:String(row.variant_name),referencesUsed:row.references_used??[],
  offeredVariants:row.offered_variants??[],designContext:row.design_context??{},
  designProfile:row.design_profile??{},selectionCount:Number(row.selection_count??1),
  updatedAt:new Date(row.updated_at).toISOString(),
  ...(includeDocument&&row.document_snapshot?{documentSnapshot:row.document_snapshot}:{}),
 };
}
export async function listSlidePreferences(slideId:string){
 z.uuid().parse(slideId);
 const rows=await database().query(
  "SELECT * FROM public.slide_visual_preferences WHERE slide_id=$1::uuid ORDER BY updated_at DESC LIMIT 100",
  [slideId]);
 return {slideId,preferences:rows.map(row=>mapped(row))};
}
export async function listRelevantVisualPreferences(
 presentationId?:string,kind?:VisualKind,includeExamples=false
){
 if(presentationId)z.uuid().parse(presentationId);
 const rows=await database().query(
  "SELECT * FROM public.slide_visual_preferences WHERE scope='global' "+
  "OR ($1::uuid IS NOT NULL AND scope='presentation' AND presentation_id=$1::uuid) "+
  "ORDER BY updated_at DESC LIMIT 180",[presentationId??null]);
 const entries=rows.map(row=>mapped(row,includeExamples));
 const ranked=rankVisualPreferences(entries,kind,presentationId);
 const positive=ranked.filter(p=>p.kind==="selected"||p.kind==="saved").slice(0,7);
 const negative=ranked.filter(p=>p.kind==="disliked").slice(0,5);
 const examples=positive.filter(p=>p.kind==="saved"&&p.documentSnapshot)
  .slice(0,2).map(p=>({
    id:p.id,name:p.variantName,slideKind:p.slideKind,
    referenceIds:p.referencesUsed,designContext:p.designContext,
    profile:p.designProfile,comment:p.comment,
    sourceVariantId:p.variantId,sourceSlideId:p.slideId,
    document:p.documentSnapshot,
  }));
 return {
   preferenceCount:entries.length,scope:presentationId??"global",
   requestedKind:kind??null,positive,negative,
   examples,summary:summarizeVisualPreferenceGuide(entries,kind,presentationId),
   interpretation:"Un choix est un indice positif faible ; seul « Je n'aime pas » est un rejet. "+
     "Les favoris explicites comptent davantage. Adapter à la fonction de la diapositive ; ne jamais imposer un style systématique.",
 };
}
export async function saveVariantPreference(input:SavePreferenceInput){
 const {getSlide,getVariant,listVariants}=await import("./store.ts");
 const slideId=z.uuid().parse(input.slideId);
 const variantId=z.uuid().parse(input.variantId);
 const kind=kindSchema.parse(input.kind),scope=scopeSchema.parse(input.scope);
 const comment=input.comment===undefined?null:text.parse(input.comment.trim());
 const active=input.active!==false;
 if(kind==="selected"&&!active)throw Error("cannot_remove_selection_history");
 const slide=await getSlide(slideId,"full");
 if(!("document" in slide))throw Error("slide_not_found");
 if(kind==="selected"&&!input.incrementSelection&&
   slide.document.variantSelection?.activeId!==variantId)
   throw Error("only_active_variant_can_receive_selection_comment");
 const variant=await getVariant(slideId,variantId);
 const db=database();
 if(!active){
   const removed=await db.query(
    "DELETE FROM public.slide_visual_preferences WHERE slide_id=$1::uuid AND variant_id=$2::uuid "+
    "AND kind=$3 AND scope=$4 RETURNING id::text",
    [slideId,variantId,kind,scope]);
   return {ok:true,active:false,removed:removed.length>0,slideId,variantId,kind,scope};
 }
 const all=await listVariants(slideId);
 const ctx=variant.design_context&&typeof variant.design_context==="object"?
   variant.design_context as Record<string,unknown>:{};
 const refs=VisualReferenceUsedSchema.safeParse(ctx.referencesUsed);
 const referencesUsed=refs.success?refs.data:[];
 const profile=designProfile(variant.document);
 const slideKind=inferPurpose(variant.document,variant.notes).kind;
 const offered=all.map(v=>({id:String(v.id),name:String(v.name)})).slice(0,50);
 // Keep prior comments unless explicitly edited. Never infer a negative reaction for other variants.
 const rows=await db.query(
  "INSERT INTO public.slide_visual_preferences "+
  "(presentation_id,slide_id,variant_id,kind,scope,comment,slide_kind,variant_name,"+
  "references_used,offered_variants,design_context,design_profile,document_snapshot) "+
  "VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,COALESCE($6::text,''),$7,$8,"+
  "$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb) "+
  "ON CONFLICT(slide_id,variant_id,kind,scope) DO UPDATE SET "+
  "comment=COALESCE($6::text,public.slide_visual_preferences.comment),"+
  "slide_kind=EXCLUDED.slide_kind,variant_name=EXCLUDED.variant_name,"+
  "references_used=EXCLUDED.references_used,offered_variants=EXCLUDED.offered_variants,"+
  "design_context=EXCLUDED.design_context,design_profile=EXCLUDED.design_profile,"+
  "document_snapshot=EXCLUDED.document_snapshot,updated_at=now(),"+
  "selection_count=CASE WHEN $14::boolean THEN LEAST(1000,public.slide_visual_preferences.selection_count+1) "+
  "ELSE public.slide_visual_preferences.selection_count END "+
  "RETURNING *",
  [slide.presentation_id,slideId,variantId,kind,scope,comment,slideKind,variant.name,
   JSON.stringify(referencesUsed),JSON.stringify(offered),JSON.stringify(ctx),
   JSON.stringify(profile),JSON.stringify(kind==="saved"||kind==="selected"?variant.document:null),
   !!input.incrementSelection]);
 if(!rows[0])throw Error("visual_preference_save_failed");
 // A deliberate reversal should not be treated simultaneously as an explicit opposite reaction.
 if(kind==="saved"||kind==="disliked"){
   await db.query(
    "DELETE FROM public.slide_visual_preferences WHERE slide_id=$1::uuid AND variant_id=$2::uuid "+
    "AND scope=$3 AND kind=$4",
    [slideId,variantId,scope,kind==="saved"?"disliked":"saved"]);
 }
 return {ok:true,active:true,preference:mapped(rows[0]!)};
}
export async function recordVariantSelection(slideId:string,variantId:string){
 return saveVariantPreference({slideId,variantId,kind:"selected",scope:"presentation",
   incrementSelection:true});
}
