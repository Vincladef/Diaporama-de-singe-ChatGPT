export type FeedbackCategory=
  "style"|"composition"|"typography"|"images"|"diagram"|"content"|
  "animation"|"ergonomics"|"technical"|"other";
export type FeedbackKind="positive"|"issue"|"idea"|"observation"|"choice";
export type FeedbackSource="note"|"variant";
export interface FeedbackEntry {
  id:string; category:FeedbackCategory;kind:FeedbackKind;content:string;
  source:FeedbackSource;createdAt:string;presentationTitle:string|null;
  variantName:string|null;
}
export type FeedbackDraft={
 category:FeedbackCategory;kind:Exclude<FeedbackKind,"choice">;content:string;
};
const endpoint="/.netlify/functions/workspace";
export async function listPromptFeedback(token:string):Promise<FeedbackEntry[]>{
 const url=new URL(endpoint,window.location.origin);
 url.searchParams.set("op","promptFeedbackJournal");
 const response=await fetch(url,{cache:"no-store",headers:{Authorization:"Bearer "+token},
  signal:AbortSignal.timeout(18000)});
 const data=await response.json() as {items?:FeedbackEntry[];error?:string};
 if(!response.ok)throw Error(data.error??"Impossible de charger le journal.");
 return data.items??[];
}
export async function savePromptFeedback(token:string,input:FeedbackDraft):Promise<FeedbackEntry>{
 const response=await fetch(endpoint,{
  method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
  body:JSON.stringify({action:"savePromptFeedback",feedback:input}),
  signal:AbortSignal.timeout(18000)
 });
 const data=await response.json() as {item?:FeedbackEntry;error?:string};
 if(!response.ok||!data.item)throw Error(data.error??"Impossible d'enregistrer ce feedback.");
 return data.item;
}
