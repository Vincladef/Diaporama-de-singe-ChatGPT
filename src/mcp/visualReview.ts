import {z} from "zod";
import {database,digest,ORIGIN,sign} from "./security.ts";
import {getSlide,getVariant,reviseVariant} from "./store.ts";
import type {SlideOperation} from "./documents.ts";
import type {CaptureDiagnostics} from "../visual/capture.ts";
import {readVisualReferenceImage,searchVisualReferencePages} from "./referencePages.ts";

const uuid=z.uuid();
const hash=z.string().regex(/^[0-9a-f]{64}$/);
export interface VisualReviewPicture{
  sessionId:string;slideId:string;variantId:string|null;pass:number;remainingCaptures:number;
  remainingCorrections:number;fingerprint:string;
  mimeType:"image/png";base64:string;diagnostics:CaptureDiagnostics;
  referenceImages:{mimeType:string;base64:string;referenceId:string;slideNumber:number}[];
  reviewGuide:string[];
}
function slideHash(slide:{id:string;revision:number;document:unknown;notes:string}):string{
  return digest(JSON.stringify({slideId:slide.id,revision:slide.revision,
    document:slide.document,notes:slide.notes}));
}

export async function inspectVisualRender(
  slideId:string,variantId?:string,sessionId?:string,includeReference=true
):Promise<VisualReviewPicture>{
  uuid.parse(slideId);
  if(variantId)uuid.parse(variantId);
  if(sessionId)uuid.parse(sessionId);
  const db=database();
  await db.query("DELETE FROM public.slide_visual_review_sessions WHERE expires_at < now()",[]);
  const target=variantId?await getVariant(slideId,variantId):await getSlide(slideId,"full");
  if(!("document" in target))throw Error("slide_not_found");
  const fingerprint=variantId ? (target as Awaited<ReturnType<typeof getVariant>>).fingerprint :
    slideHash(target as {id:string;revision:number;document:unknown;notes:string});
  let session:Record<string,unknown>;
  if(sessionId){
    const rows=await db.query(
      "SELECT id::text,slide_id::text,variant_id::text,capture_count,correction_count "+
      "FROM public.slide_visual_review_sessions WHERE id=$1::uuid AND expires_at>now()",[sessionId]);
    const found=rows[0];if(!found)throw Error("visual_review_session_not_found");
    if(found.slide_id!==slideId||found.variant_id!==(variantId??null))throw Error("visual_review_target_mismatch");
    session=found;
  }else{
    const rows=await db.query(
      "INSERT INTO public.slide_visual_review_sessions(slide_id,variant_id) "+
      "VALUES($1::uuid,$2::uuid) RETURNING id::text,slide_id::text,variant_id::text,capture_count,correction_count",
      [slideId,variantId??null]);
    session=rows[0]!;
  }
  if(Number(session.capture_count)>=3)throw Error("visual_review_limit_three_captures");
  const expiresAt=Date.now()+40_000;
  const payload=JSON.stringify({slideId,variantId:variantId??null,sourceFingerprint:fingerprint,expiresAt});
  let response:Response;
  try{
    response=await fetch(ORIGIN+"/internal/visual-capture",{
      method:"POST",headers:{"Content-Type":"application/json","X-Singe-Capture-Signature":sign(payload)},
      body:payload,cache:"no-store",signal:AbortSignal.timeout(47_000)
    });
  }catch(e){throw Error("visual_capture_network_unavailable: "+(e instanceof Error?e.message:"unknown"));}
  const data=await response.json().catch(()=>({error:"invalid_capture_response"})) as Record<string,unknown>;
  if(!response.ok||data.mimeType!=="image/png"||typeof data.base64!=="string"||
     typeof data.fingerprint!=="string"||!data.diagnostics){
    throw Error("visual_capture_failed: "+String(data.reason??data.error??response.status).slice(0,160));
  }
  if(data.fingerprint!==fingerprint)throw Error("visual_review_capture_conflict");
  const png=Buffer.from(data.base64,"base64");
  if(png.length<100||png.length>3_500_000||png.subarray(0,8).toString("hex")!=="89504e470d0a1a0a")
    throw Error("invalid_visual_capture_image");
  const diagnostics=data.diagnostics as CaptureDiagnostics;
  if(!diagnostics.canvas||!Number.isFinite(diagnostics.pixelWidth)||!Number.isFinite(diagnostics.pixelHeight))
    throw Error("invalid_visual_capture_diagnostics");
  const allocated=await db.query(
    "UPDATE public.slide_visual_review_sessions SET capture_count=capture_count+1 "+
    "WHERE id=$1::uuid AND capture_count<3 AND expires_at>now() "+
    "RETURNING capture_count,correction_count",[session.id]);
  if(!allocated[0])throw Error("visual_review_limit_three_captures");
  const pass=Number(allocated[0].capture_count);
  await db.query(
    "INSERT INTO public.slide_visual_review_captures "+
    "(session_id,pass,source_fingerprint,image_data,width,height,diagnostics) "+
    "VALUES($1::uuid,$2,$3,decode($4,'base64'),$5,$6,$7::jsonb)",
    [session.id,pass,fingerprint,data.base64,
      diagnostics.pixelWidth,diagnostics.pixelHeight,JSON.stringify(diagnostics)]
  );
  const referenceImages:VisualReviewPicture["referenceImages"]=[];
  if(includeReference&&pass===1){
    try{
      const refs=await searchVisualReferencePages({limit:1});
      for(const ref of refs.pages.slice(0,1)){
        const img=await readVisualReferenceImage(ref.referenceId,ref.slideNumber);
        referenceImages.push({mimeType:img.mimeType,base64:img.base64,
          referenceId:ref.referenceId,slideNumber:ref.slideNumber});
      }
    }catch{/* Visual inspection can proceed without reference previews. */}
  }
  return {
    sessionId:String(session.id),slideId,variantId:variantId??null,pass,
    remainingCaptures:3-pass,remainingCorrections:2-Number(allocated[0].correction_count),
    fingerprint,mimeType:"image/png",base64:data.base64,
    diagnostics,referenceImages,
    reviewGuide:[
      "La première image est un vrai rendu Chromium de cette diapositive. Les images suivantes, si disponibles, sont des références graphiques.",
      "Examiner la lisibilité, l'équilibre, le cadrage, les polices, les chevauchements et le caractère pertinent des éléments décoratifs.",
      "Les diagnostics DOM aident à trouver les défauts, mais ne constituent pas une évaluation esthétique.",
      "Respecter les instructions artistiques de la présentation et le sujet scientifique. Ne pas copier le contenu des références.",
      "Si des défauts existent, appeler apply_visual_correction pour modifier uniquement le CSS ou la géométrie des éléments natifs, puis relancer inspect_visual_render dans la même session.",
      "Ne pas annoncer de correction visuelle sans examiner cette image. Maximum trois captures et deux corrections par session."
    ]
  };
}
export async function readVisualCapture(sessionId:string,pass?:number){
  uuid.parse(sessionId);
  if(pass!==undefined)z.number().int().min(1).max(3).parse(pass);
  const rows=await database().query(
    "SELECT c.pass,c.source_fingerprint AS fingerprint,encode(c.image_data,'base64') AS base64,"+
    "c.diagnostics,s.slide_id::text,s.variant_id::text "+
    "FROM public.slide_visual_review_captures c JOIN public.slide_visual_review_sessions s ON s.id=c.session_id "+
    "WHERE s.id=$1::uuid AND s.expires_at>now() AND ($2::integer IS NULL OR c.pass=$2) "+
    "ORDER BY c.pass DESC LIMIT 1",[sessionId,pass??null]);
  if(!rows[0])throw Error("visual_capture_not_found");
  return {sessionId,pass:rows[0].pass,slideId:rows[0].slide_id,
    variantId:rows[0].variant_id,diagnostics:rows[0].diagnostics,
    mimeType:"image/png",base64:rows[0].base64,fingerprint:rows[0].fingerprint};
}

export interface SafeVisualCorrection{
  appendCss?:string;
  elementStyles?:Array<{id:string;styles:Record<string,string|number>}>;
  reason:string;
}
export function validateVisualCorrection(input:SafeVisualCorrection):void{
  if(!input.reason.trim()||input.reason.length>1200)throw Error("visual_correction_reason_required");
  if(!input.appendCss?.trim()&&!input.elementStyles?.length)throw Error("empty_visual_correction");
  if(input.appendCss&&input.appendCss.length>9000)throw Error("visual_css_patch_too_long");
  if((input.elementStyles?.length??0)>12)throw Error("too_many_geometry_patches");
  // A visual correction must not remove or rewrite scientific text or citations.
  const styles=[input.appendCss??"",
    ...(input.elementStyles??[]).flatMap(x=>Object.values(x.styles).map(String))].join(" ");
  if(/(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;}]|$)|content\s*:|@import\b|<script|url\s*\(\s*['"]?javascript:)/i.test(styles))
    throw Error("unsafe_visual_correction");
  for(const el of input.elementStyles??[]){
    if(!el.id||Object.keys(el.styles).length>20)throw Error("invalid_visual_element_patch");
    if(Object.keys(el.styles).some(key=>![
      "left","top","width","height","right","bottom","fontSize","lineHeight","objectFit",
      "objectPosition","padding","margin","transform","color","background",
      "borderRadius","maxWidth","maxHeight","minWidth","minHeight","textAlign",
      "letterSpacing","fontWeight","fontFamily",
    ].includes(key)))throw Error("unsupported_visual_element_style");
  }
}
export async function applyVisualCorrection(
  sessionId:string,expectedFingerprint:string,input:SafeVisualCorrection
){
  uuid.parse(sessionId);hash.parse(expectedFingerprint);
  validateVisualCorrection(input);
  const db=database();
  const rows=await db.query(
    "SELECT slide_id::text,variant_id::text,capture_count,correction_count "+
    "FROM public.slide_visual_review_sessions WHERE id=$1::uuid AND expires_at>now()",[sessionId]);
  const session=rows[0];
  if(!session)throw Error("visual_review_session_not_found");
  if(!session.variant_id)throw Error("visual_review_correction_requires_variant");
  if(Number(session.correction_count)>=2)throw Error("visual_review_limit_two_corrections");
  const previous=await db.query(
    "SELECT source_fingerprint FROM public.slide_visual_review_captures "+
    "WHERE session_id=$1::uuid ORDER BY pass DESC LIMIT 1",[sessionId]);
  if(previous[0]?.source_fingerprint!==expectedFingerprint)
    throw Error("visual_review_correction_requires_latest_capture");
  const ops:SlideOperation[]=[];
  if(input.appendCss?.trim())ops.push({op:"append_css",css:"\n/* Correction visuelle contrôlée */\n"+input.appendCss});
  for(const patch of input.elementStyles??[])
    ops.push({op:"edit_element",id:patch.id,styles:patch.styles});
  const allocated=await db.query(
    "UPDATE public.slide_visual_review_sessions SET correction_count=correction_count+1 "+
    "WHERE id=$1::uuid AND correction_count<2 AND expires_at>now() RETURNING correction_count",
    [sessionId]);
  if(!allocated[0])throw Error("visual_review_limit_two_corrections");
  try{
    const saved=await reviseVariant(String(session.slide_id),String(session.variant_id),
      expectedFingerprint,ops);
    return {sessionId,correctionPass:Number(allocated[0].correction_count),
      remainingCorrections:2-Number(allocated[0].correction_count),
      nextStep:"Relancer inspect_visual_render avec le même sessionId et variantId, puis examiner réellement la nouvelle image.",
      ...saved};
  }catch(error){
    await db.query(
      "UPDATE public.slide_visual_review_sessions SET correction_count=GREATEST(correction_count-1,0) "+
      "WHERE id=$1::uuid",[sessionId]);
    throw error;
  }
}
