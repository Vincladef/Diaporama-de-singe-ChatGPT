import {useCallback,useEffect,useState} from "react";
import {command,readVariantPreferences} from "../lib/api";
import type {PreferenceKind,PreferenceScope,PreferenceView} from "../preferences/ranking";

export function useVisualFeedback(token:string,slideId:string){
  const [preferences,setPreferences]=useState<PreferenceView[]>([]);
  const [error,setError]=useState("");
  const reload=useCallback(async()=>{
    if(!token||!slideId)return;
    try{setPreferences(await readVariantPreferences(token,slideId));setError("");}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  },[token,slideId]);
  useEffect(()=>{
    void reload();
    const timer=window.setInterval(()=>void reload(),20000);
    return()=>window.clearInterval(timer);
  },[reload]);
  return {preferences,reload,error};
}
type Props={
  token:string;slideId:string;variantId:string;
  selected:boolean;preferences:PreferenceView[];onUpdated:()=>Promise<void>;
  disabled?:boolean;
};
export function VariantFeedbackActions({
 token,slideId,variantId,selected,preferences,onUpdated,disabled
}:Props){
 const [scopeOverride,setScopeOverride]=useState<PreferenceScope|null>(null);
 const [comment,setComment]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const relevant=preferences.filter(p=>p.variantId===variantId);
 const saved=relevant.some(p=>p.kind==="saved");
 const disliked=relevant.some(p=>p.kind==="disliked");
 const commentScope=scopeOverride??"presentation";
 const chosenFeedback=relevant.find(p=>p.scope===commentScope&&
   (p.kind==="saved"||p.kind==="disliked"||p.kind==="selected"));
 const selectedInMemory=selected||relevant.some(p=>p.kind==="selected");
 async function submit(kind:PreferenceKind,active=true,commentValue?:string,forcedScope?:PreferenceScope){
   if(busy||disabled)return;
   const scope=scopeOverride??forcedScope??(kind==="saved"?"global":"presentation");
   setBusy(true);setError("");setNotice("");
   try{
     await command(token,{action:"setVariantPreference",slideId,variantId,
       kind,scope,active,...(commentValue!==undefined?{comment:commentValue}:{})});
     await onUpdated();
     setNotice(active?"Avis mémorisé.":"Avis retiré.");
   }catch(e){setError(e instanceof Error?e.message:"Enregistrement impossible.");}
   finally{setBusy(false);}
 }
 function saveComment(){
   const kind:PreferenceKind=chosenFeedback?.kind??(selected?"selected":"saved");
   // A comment must attach to an existing reaction or to a selected composition.
   if(!chosenFeedback&&!selected){setError("Choisis la variante ou indique d'abord ton avis.");return;}
   void submit(kind,true,comment.trim(),commentScope);
 }
 return <div className="variant-feedback" aria-label="Préférences graphiques">
   <div className="variant-feedback-buttons">
     <button type="button" aria-pressed={disliked} disabled={busy||disabled}
       title="Indiquer un rejet explicite, sans juger les autres variantes"
       onClick={()=>void submit("disliked",!disliked,undefined,
         relevant.find(p=>p.kind==="disliked")?.scope??"presentation")}>
       {disliked?"✕ Avis négatif enregistré":"Je n'aime pas"}
     </button>
     <button type="button" aria-pressed={saved} disabled={busy||disabled}
       title="Garder cette composition comme exemple graphique pour de futures créations"
       onClick={()=>void submit("saved",!saved,undefined,
         relevant.find(p=>p.kind==="saved")?.scope??"global")}>
       {saved?"★ Référence enregistrée":"☆ Enregistrer comme référence"}
     </button>
   </div>
   <details className="variant-feedback-details">
     <summary>Commentaire facultatif{relevant.some(p=>!!p.comment)?" · enregistré":""}</summary>
     <label>Portée du retour
       <select value={commentScope} onChange={e=>setScopeOverride(e.target.value as PreferenceScope)}>
         <option value="presentation">Cette présentation</option>
         <option value="global">Toutes les présentations</option>
       </select>
     </label>
     <textarea rows={2} maxLength={1200} value={comment}
       placeholder="Ce cadrage me plaît ; éviter les cartes arrondies…"
       onChange={e=>setComment(e.target.value)} />
     {chosenFeedback?.comment&&!comment&&<small>Dernier commentaire : {chosenFeedback.comment}</small>}
     <button type="button" disabled={busy||disabled||(!selectedInMemory&&!chosenFeedback)}
       onClick={saveComment}>Enregistrer le commentaire</button>
   </details>
   {error&&<small role="alert" className="variant-feedback-error">{error}</small>}
   {notice&&<small role="status" className="variant-feedback-notice">{notice}</small>}
 </div>;
}
