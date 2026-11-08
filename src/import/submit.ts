import type { ImportedDeck,ImportedSlide } from "./parse";
import { command } from "../lib/api";

/** Netlify and MCP share the same SlideDocument contract; never mutate the source deck. */
const MAX_BATCH_BYTES=1_400_000;
const MAX_SLIDES_BATCH=20;
export function partitionSlides(slides:ImportedSlide[]):ImportedSlide[][]{
  const chunks:ImportedSlide[][]=[];
  let chunk:ImportedSlide[]=[],bytes=2;
  const encoder=new TextEncoder();
  for(const slide of slides){
    const normalized={document:slide.document,notes:slide.notes??""};
    const itemBytes=encoder.encode(JSON.stringify(normalized)).byteLength+1;
    if(itemBytes>MAX_BATCH_BYTES)throw Error("Une diapositive dépasse 1,4 Mo après compression. Réduisez la taille de ses médias.");
    if(chunk.length&&(bytes+itemBytes>MAX_BATCH_BYTES||chunk.length>=MAX_SLIDES_BATCH)){
      chunks.push(chunk);chunk=[];bytes=2;
    }
    chunk.push(slide);bytes+=itemBytes;
  }
  if(chunk.length)chunks.push(chunk);
  return chunks;
}
export async function submitImport(token:string,deck:ImportedDeck,selected:number[],title:string,
  onProgress?:(done:number,total:number)=>void):Promise<{id:string;created:number}>{
  if(!title.trim())throw Error("Renseignez un titre.");
  const ids=[...new Set(selected)].filter(n=>Number.isInteger(n)&&n>=0&&n<deck.slides.length).sort((a,b)=>a-b);
  if(!ids.length)throw Error("Sélectionnez au moins une diapositive.");
  if(ids.length>40)throw Error("Limite de 40 diapositives par import.");
  const groups=partitionSlides(ids.map(i=>deck.slides[i]!));
  let deckId:string|undefined,created=0;
  try{
    for(const [index,group] of groups.entries()){
      const slides=group.map(x=>({document:x.document,notes:x.notes}));
      if(index===0){
        const reply=await command<{presentation:{id:string};importedSlides:number}>(token,{
          action:"importPresentation",title:title.trim().slice(0,180),slides,
        });
        deckId=reply.presentation.id;created+=reply.importedSlides;
      }else{
        const reply=await command<{created:number}>(token,{
          action:"appendImportedSlides",presentationId:deckId,slides,
        });
        created+=reply.created;
      }
      onProgress?.(created,ids.length);
    }
    if(!deckId||created!==ids.length)throw Error("Le nombre de diapositives importées ne correspond pas au fichier.");
    return {id:deckId,created};
  }catch(error){
    if(deckId){
      try{await command(token,{action:"deletePresentation",id:deckId});}
      catch{throw Error("Import interrompu ; une présentation incomplète reste dans votre bibliothèque. Supprimez-la avant de recommencer.");}
    }
    throw error;
  }
}
