import type {VisualKind} from "../creative/referenceLibrary.ts";

export type PreferenceKind="selected"|"disliked"|"saved";
export type PreferenceScope="global"|"presentation";
export type PreferenceView={
 id:string;slideId:string;variantId:string;presentationId:string;
 kind:PreferenceKind;scope:PreferenceScope;comment:string;
 slideKind:VisualKind;variantName:string;referencesUsed:unknown[];
 offeredVariants:Array<{id:string;name:string}>;designContext:Record<string,unknown>;
 designProfile:Record<string,unknown>;selectionCount:number;updatedAt:string;
 documentSnapshot?:unknown;
};
export function preferenceRank(entry:PreferenceView,kind?:VisualKind,presentationId?:string){
 const match=kind===undefined?0:entry.slideKind===kind?7:
   entry.slideKind==="mixte"?1:-5;
 const proximity=presentationId&&entry.scope==="presentation"&&
   entry.presentationId===presentationId?3:0;
 const signal=entry.kind==="saved"?4:entry.kind==="selected"?1:2;
 return match+proximity+signal+Math.min(2,Math.log2(entry.selectionCount));
}
export function rankVisualPreferences(
 entries:PreferenceView[],kind?:VisualKind,presentationId?:string
):PreferenceView[]{
 return entries.filter(entry=>entry.scope==="global"||
   !!presentationId&&entry.presentationId===presentationId)
   .sort((a,b)=>preferenceRank(b,kind,presentationId)-preferenceRank(a,kind,presentationId)||
     b.updatedAt.localeCompare(a.updatedAt));
}
export function summarizeVisualPreferenceGuide(entries:PreferenceView[],kind?:VisualKind,presentationId?:string){
 const ranked=rankVisualPreferences(entries,kind,presentationId);
 const positives=ranked.filter(p=>p.kind==="saved"||p.kind==="selected").slice(0,5);
 const negatives=ranked.filter(p=>p.kind==="disliked").slice(0,4);
 if(!positives.length&&!negatives.length)return "";
 const describe=(p:PreferenceView)=>[
    p.scope==="global"?"toutes présentations":"présentation concernée",
    p.slideKind,
    p.variantName,
    p.comment?"retour : "+p.comment:"",p.kind==="selected"?"signal faible d'un choix":""
  ].filter(Boolean).join(" ; ").slice(0,420);
 return [
  "PRÉFÉRENCES VISUELLES OBSERVÉES, non absolues : adapter au rôle pédagogique ; ne pas recopier le contenu des références.",
  "Les versions non sélectionnées ne sont jamais assimilées à des rejets.",
  positives.length?"Signaux positifs (les favoris explicites ont plus de poids qu'un clic isolé) :\n"+
    positives.map(p=>"- "+describe(p)).join("\n"):"",
  negatives.length?"Rejets explicites :\n"+negatives.map(p=>"- "+describe(p)).join("\n"):"",
  "Un choix isolé ne justifie pas de figer une palette, un modèle ou une disposition ; conserver la diversité des compositions."
 ].filter(Boolean).join("\n");
}
