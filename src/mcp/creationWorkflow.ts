import {z} from "zod";
import {getDeck,listVariants,type DbSlide} from "./store.ts";
import {prepareIndependentVariantBrief} from "./independentVariants.ts";
import {layoutSignature} from "../variants/independent.ts";
import {inspectMarkupMedia} from "../quality/markupMedia.ts";
import {inspectExport} from "../export/preflight.ts";
import {database} from "./security.ts";
import type {SlideDocument} from "../domain/slide.ts";

const id=z.uuid();
type Alternative={id:string;name:string;document:SlideDocument;notes:string;created_at:string};

export async function prepareDeckWorkflow(presentationId:string){
 id.parse(presentationId);
 const deck=await getDeck(presentationId,"full",0,40);
 const slides=deck.slides as DbSlide[];
 const brief=await Promise.all(slides.map(s=>prepareIndependentVariantBrief(s.id,false)));
 return {
   presentation:{id:presentationId,title:String((deck.presentation as {title:string}).title)},
   slideCount:slides.length,
   instructions:brief[0]?.globalAndLocalInstructions??"",
   sources:brief.map((s,i)=>({
     slideId:s.slideId,revision:s.revision,position:i,
     notes:s.source.notes,
     document:s.source.document,
     pedagogicalFunction:s.source.semanticPurpose,
     visualReferences:s.visualReferences,
     positivePreferences:s.visualPreferenceMemory.positive.slice(0,3).map(x=>({
       kind:x.kind,name:x.variantName,comment:x.comment,scope:x.scope})),
     explicitRejections:s.visualPreferenceMemory.negative.slice(0,3).map(x=>({
       name:x.variantName,comment:x.comment,scope:x.scope})),
     referencePreviewCount:s.previewImages.length,
   })),
   workflow:[
     "Use get_creation_instructions and these global/presentation rules before designing.",
     "For each slide, inspect saved references with prepare_independent_variants and actual images before composing.",
     "Find several candidates via curate_images, inspect_photo_candidates, and preserve licenses.",
     "AUTHOR three independently designed documents, not a single template recolored; save using create_independent_variants.",
     "Inspect every candidate's actual PNG via inspect_visual_render; correct problems via apply_visual_correction and inspect again.",
     "Verify three persisted alternatives per slide using verify_deck_workflow. Do not claim pixels are inspected if no capture record exists.",
     "The editor displays alternatives; user selection writes a weak positive signal, never an implicit negative signal.",
   ],
   autonomousWebGenerationAvailable:false,
   generator:"ChatGPT via MCP ; no configured server-side paid model and no hidden automated LLM.",
 };
}

export async function verifyDeckWorkflow(presentationId:string){
 id.parse(presentationId);
 const result=await getDeck(presentationId,"full",0,80);
 const slides=result.slides as DbSlide[];
 const all=await Promise.all(slides.map(s=>listVariants(s.id,true)));
 const db=database();
 const captures=await db.query(
   "SELECT s.slide_id::text AS slide_id,s.variant_id::text AS variant_id,"+
   "COUNT(c.pass)::int AS captures FROM public.slide_visual_review_sessions s "+
   "JOIN public.slide_visual_review_captures c ON c.session_id=s.id "+
   "WHERE s.slide_id = ANY($1::uuid[]) GROUP BY s.slide_id,s.variant_id",
   [slides.map(s=>s.id)]);
 const counts=new Map<string,number>(captures.map(r=>[
   String(r.slide_id)+":"+String(r.variant_id),Number(r.captures)]));
 const feedback=await db.query(
   "SELECT slide_id::text AS slide_id,kind,COUNT(*)::int AS count "+
   "FROM public.slide_visual_preferences WHERE slide_id=ANY($1::uuid[]) "+
   "GROUP BY slide_id,kind",[slides.map(s=>s.id)]);
 const completed=slides.map((s,index)=>{
   const variants=all[index] as Alternative[];
   const intentional=variants.filter(v=>!v.name.startsWith("Historique r")&&
     !v.name.startsWith("A · Original (automatique)"));
   // Historical backups are not three independently generated visual directions.
   const recent=intentional.slice(-3);
   const signatures=new Set(recent.map(v=>layoutSignature(v.document)));
   const images=recent.map(v=>({id:v.id,name:v.name,
     count:inspectMarkupMedia(v.document).imageCount+
       v.document.elements.filter(e=>e.type==="image").length}));
   const animations=recent.map(v=>({id:v.id,name:v.name,
     clickCount:v.document.animations.filter(a=>a.trigger==="click").length,
     orphanSelectors:v.document.animations.filter(a=>{
       if(a.targetElementId)return !v.document.elements.some(e=>e.id===a.targetElementId);
       return a.targetSelector?.startsWith("#")&&!v.document.freeform?.html.includes(a.targetSelector.slice(1));
     }).length}));
   const exportReport=inspectExport([{document:s.document,notes:s.notes},
     ...recent.map(v=>({document:v.document,notes:v.notes}))]);
   const issues:string[]=[];
   if(recent.length!==3)issues.push("Expected three persisted alternatives, found "+recent.length);
   if(signatures.size!==3)issues.push("Repeated layout signatures, not three independent compositions");
   if(animations.some(a=>a.orphanSelectors))issues.push("Animation selectors without a target");
   if(!recent.every(v=>v.notes?.trim()))issues.push("Missing notes or scientific sources");
   const visualCaptures=recent.map(v=>({
     variantId:v.id,name:v.name,capturedImages:counts.get(s.id+":"+v.id)??0,
   }));
   const photos=images.reduce((sum,v)=>sum+v.count,0);
   if(!photos)issues.push("No photographic alternative in this slide");
   return {
     slideId:s.id,position:index,variantCount:intentional.length,
     independentCompositions:signatures.size,photos,images,animations,
     visualCaptures,actualPixelReviewCompleted:visualCaptures.every(v=>v.capturedImages>0),
     notesPreserved:recent.every(v=>!!v.notes?.trim()),
     export:exportReport.slides.map(x=>({mode:x.mode,issues:x.issues})),
     preferences:feedback.filter(p=>p.slide_id===s.id).map(p=>({kind:p.kind,count:Number(p.count)})),
     readyForVisualReview:issues.length===0,issues,
   };
 });
 return {presentationId,slideCount:slides.length,
   threeVariantsEach:completed.every(x=>x.variantCount===3),
   compositionDiversificationVerified:completed.every(x=>x.independentCompositions===3),
   pixelCaptureStatus:"Only persisted Chromium captures are counted, not static audits or signed preview URLs.",
   allPixelCapturesStored:completed.every(x=>x.actualPixelReviewCompleted),
   allReadyForReview:completed.every(x=>x.readyForVisualReview),
   slides:completed,
 };
}
