export type PromptCategory="socle"|"styles"|"compositions"|"skills"|"references";
export type PromptStatus="draft"|"active"|"rejected"|"disabled";
export interface PromptLibraryItem{
 id:string;category:PromptCategory;title:string;description:string;prompt:string;previewUrl:string;
 status:PromptStatus;version:number;createdAt:string;updatedAt:string;
}
export type PromptItemDraft=Pick<PromptLibraryItem,"category"|"title"|"description"|"prompt"|"previewUrl"|"status">&
 Partial<Pick<PromptLibraryItem,"id"|"version">>;
const endpoint="/.netlify/functions/workspace";
async function request<T>(token:string,action?:Record<string,unknown>):Promise<T>{
 const url=new URL(endpoint,window.location.origin);
 if(!action)url.searchParams.set("op","promptLibrary");
 const response=await fetch(url,{
  method:action?"POST":"GET",cache:"no-store",
  headers:{Authorization:"Bearer "+token,...(action?{"Content-Type":"application/json"}:{})},
  body:action?JSON.stringify(action):undefined,signal:AbortSignal.timeout(18000)
 });
 const payload=await response.json() as {error?:string;items?:PromptLibraryItem[];item?:PromptLibraryItem};
 if(!response.ok)throw Error(payload.error==="revision_conflict"?
   "Cette fiche a changé ailleurs ; recharge la bibliothèque.":(payload.error??"Erreur du serveur"));
 return payload as T;
}
export async function listPromptItems(token:string):Promise<PromptLibraryItem[]>{
 const result=await request<{items:PromptLibraryItem[]}>(token);
 return result.items??[];
}
export async function savePromptItem(token:string,item:PromptItemDraft):Promise<PromptLibraryItem>{
 const result=await request<{item:PromptLibraryItem}>(token,{action:"savePromptLibraryItem",item});
 return result.item;
}

export async function deletePromptItem(token:string,id:string,version:number):Promise<void>{
 await request(token,{action:"deletePromptLibraryItem",id,version});
}
