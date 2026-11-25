import {z} from "zod";
import {database} from "./security.ts";
import {getDeck,type DbSlide} from "./store.ts";
import {sourceContentSignature,type LockedBaseline} from "./contentFingerprint.ts";
export {sourceContentSignature,compareContentSignatures,checkLockedChanges,
  compareLockedDeck} from "./contentFingerprint.ts";
export type {ContentSignature,LockedBaseline} from "./contentFingerprint.ts";

export async function readContentLock(presentationId:string):Promise<LockedBaseline|null>{
  z.uuid().parse(presentationId);
  const rows=await database().query(
    "SELECT baseline FROM public.mcp_deck_content_locks WHERE presentation_id=$1::uuid",
    [presentationId]);
  return rows[0]?.baseline as LockedBaseline|undefined??null;
}
export async function assertNoContentLock(presentationId:string):Promise<void>{
  if(await readContentLock(presentationId))throw Error("source_content_locked_structural_change");
}
export async function lockSourceContent(presentationId:string,enabled=true,confirmUnlock=false){
  z.uuid().parse(presentationId);
  if(!enabled){
    if(!confirmUnlock)throw Error("unlock_requires_confirmation");
    const rows=await database().query(
      "DELETE FROM public.mcp_deck_content_locks WHERE presentation_id=$1::uuid RETURNING presentation_id",
      [presentationId]);
    return {presentationId,locked:false,changed:rows.length>0};
  }
  const existing=await readContentLock(presentationId);
  if(existing)return {presentationId,locked:true,changed:false,slides:existing.slides.length};
  const deck=await getDeck(presentationId,"full",0,100);
  if(deck.nextOffset!==null)throw Error("lock_limit_100_slides");
  const slides=deck.slides.filter((s):s is DbSlide=>"document" in s);
  const baseline:LockedBaseline={version:1,slides:slides.map(s=>({
    id:s.id,signature:sourceContentSignature(s.document,s.notes)
  }))};
  const rows=await database().query(
    "INSERT INTO public.mcp_deck_content_locks(presentation_id,baseline) "+
    "VALUES($1::uuid,$2::jsonb) ON CONFLICT DO NOTHING RETURNING presentation_id",
    [presentationId,JSON.stringify(baseline)]);
  return {presentationId,locked:true,changed:rows.length>0,slides:baseline.slides.length};
}
