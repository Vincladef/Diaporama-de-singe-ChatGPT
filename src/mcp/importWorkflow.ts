import {z} from "zod";
import sharp from "sharp";
import {Buffer} from "node:buffer";
import {importPowerPoint,type ImportedSlide} from "../import/parse.ts";
import {canFetchVisualResource,safeResourceUrl} from "../visual/safety.ts";
import {OpenAIImageFileSchema,inventorySourceVisuals} from "./sourceImages.ts";
import {getDeck,createDeck,addSlides,deleteDeck,updateDeck,editSlides,type DbSlide} from "./store.ts";
import {SlideOperationSchema,type SlideOperation} from "./documents.ts";
import {sourceContentSignature,compareContentSignatures,readContentLock,compareLockedDeck,lockSourceContent} from "./contentLock.ts";
import {captureSlidePixels} from "../visual/capture.ts";
import {sign,ORIGIN} from "./security.ts";
import {inspectExport} from "../export/preflight.ts";

const uuid=z.uuid();
export const ImportPptxInputSchema=z.object({
  file:OpenAIImageFileSchema,
  title:z.string().trim().min(1).max(180).optional(),
  selectedSlides:z.array(z.number().int().min(0).max(999)).min(1).max(40).optional(),
  lockContent:z.boolean().default(true),
}).strict();
export const StyleChangeSchema=z.object({
  slideId:uuid,revision:z.number().int().min(1),
  elements:z.array(z.object({
    id:z.string().min(1).max(128),
    styles:z.record(z.string(),z.union([z.string(),z.number()])),
  }).strict()).max(80).default([]),
  backgroundCss:z.string().max(240000).optional(),
  animations:z.array(z.any()).max(1000).optional(),
}).strict();

const MAX_PPTX_BYTES=45_000_000;
async function getAttachedPptx(url:string):Promise<Buffer>{
  let target=url;
  for(let redirects=0;redirects<4;redirects++){
    if(!safeResourceUrl(target)||!await canFetchVisualResource(target))
      throw Error("unsafe_pptx_download_url");
    const response=await fetch(target,{redirect:"manual",signal:AbortSignal.timeout(35_000),
      headers:{Accept:"application/vnd.openxmlformats-officedocument.presentationml.presentation,application/octet-stream"}});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get("location");
      if(!location)throw Error("file_redirect_without_target");
      target=new URL(location,target).toString();continue;
    }
    if(!response.ok)throw Error("pptx_download_failed_"+response.status);
    if(Number(response.headers.get("content-length")||0)>MAX_PPTX_BYTES)
      throw Error("pptx_file_too_large");
    if(!response.body)throw Error("pptx_body_missing");
    const reader=response.body.getReader();
    const parts:Buffer[]=[];
    let count=0;
    try{
      for(;;){
        const next=await reader.read();
        if(next.done)break;
        count+=next.value.byteLength;
        if(count>MAX_PPTX_BYTES){await reader.cancel().catch(()=>{});throw Error("pptx_file_too_large");}
        parts.push(Buffer.from(next.value));
      }
    }finally{reader.releaseLock();}
    const result=Buffer.concat(parts,count);
    if(result.length<4||result[0]!==80||result[1]!==75)
      throw Error("invalid_pptx_magic");
    return result;
  }
  throw Error("pptx_too_many_redirects");
}

const BYTES_PER_SLIDE=1_350_000;
function partition(slides:ImportedSlide[]):ImportedSlide[][]{
  const batches:ImportedSlide[][]=[];let current:ImportedSlide[]=[],size=2;
  for(const slide of slides){
    const bytes=Buffer.byteLength(JSON.stringify({document:slide.document,notes:slide.notes}))+1;
    if(bytes>BYTES_PER_SLIDE)throw Error("imported_slide_exceeds_storage_budget");
    if(current.length&&(current.length>=15||size+bytes>BYTES_PER_SLIDE)){
      batches.push(current);current=[];size=2;
    }
    current.push(slide);size+=bytes;
  }
  if(current.length)batches.push(current);
  return batches;
}
function adaptMedia(){
  const cache=new Map<string,string>();
  let modified=0;
  return {
    process:async(data:Uint8Array,mime:string,path:string):Promise<string>=>{
      if(cache.has(path))return cache.get(path)!;
      let output=Buffer.from(data);
      let finalMime=mime;
      if(output.length>850_000){
        const metadata=await sharp(output,{limitInputPixels:40_000_000}).metadata();
        if(!metadata.width||!metadata.height)throw Error("invalid_import_image");
        let result=await sharp(output,{limitInputPixels:40_000_000})
          .resize({width:1920,height:1920,fit:"inside",withoutEnlargement:true})
          .webp({lossless:true,effort:3}).toBuffer();
        if(result.length>850_000){
          result=await sharp(output,{limitInputPixels:40_000_000})
            .resize({width:1920,height:1920,fit:"inside",withoutEnlargement:true})
            .webp({quality:90,effort:3}).toBuffer();
        }
        if(result.length>950_000)throw Error("import_image_too_large_after_optimization");
        output=result;finalMime="image/webp";modified++;
      }
      const dataUrl="data:"+finalMime+";base64,"+output.toString("base64");
      cache.set(path,dataUrl);return dataUrl;
    },
    count:()=>modified
  };
}
export async function importAttachedPptx(input:z.infer<typeof ImportPptxInputSchema>){
  const a=ImportPptxInputSchema.parse(input);
  if(a.file.mime_type&&![
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/octet-stream","application/zip"
  ].includes(a.file.mime_type.toLowerCase()))throw Error("unsupported_pptx_mime");
  const originalName=(a.file.file_name??"Presentation.pptx").slice(0,255);
  if(!originalName.toLowerCase().endsWith(".pptx"))throw Error("pptx_extension_required");
  const bytes=await getAttachedPptx(a.file.download_url);
  const media=adaptMedia();
  const view=Uint8Array.from(bytes);
  const raw=await importPowerPoint(view.buffer,
    originalName,media.process);
  const selected=a.selectedSlides?.length?[...new Set(a.selectedSlides)].sort((x,y)=>x-y):
    raw.slides.map((_,i)=>i);
  if(selected.length>40||selected.some(i=>i>=raw.slides.length))throw Error("invalid_import_slide_selection");
  const groups=partition(selected.map(index=>raw.slides[index]!));
  if(!groups.length)throw Error("no_slides_selected");
  let created:string|undefined,inserted=0;
  try{
    const first=await createDeck(a.title??raw.title,groups[0]!.map(s=>({document:s.document,notes:s.notes})));
    created=String(first.id);
    inserted=groups[0]!.length;
    for(const group of groups.slice(1)){
      const result=await addSlides(created,group.map(s=>({document:s.document,notes:s.notes})));
      inserted+=result.created;
    }
    if(inserted!==selected.length)throw Error("import_slide_count_mismatch");
    await updateDeck(created,{description:"Imported from "+originalName+" via ChatGPT MCP"});
    if(a.lockContent)await lockSourceContent(created,true);
    const deck=await getDeck(created,"outline",0,50);
    return {presentationId:created,title:a.title??raw.title,sourceFileId:a.file.file_id,
      slideCount:inserted,sourceSlideCount:raw.slides.length,locked:a.lockContent,
      slides:deck.slides.map(s=>({id:s.id,position:s.position,revision:s.revision})),
      warnings:[...raw.warnings,...(media.count()?[
        media.count()+" image(s) volumineuse(s) ont été optimisées : inspecter leur lisibilité."]:[])],
      editorUrl:ORIGIN+"/?deck="+encodeURIComponent(created)};
  }catch(error){
    if(created)await deleteDeck(created).catch(()=>{});
    throw error;
  }
}

export async function inspectImportedDeck(presentationId:string,maxChars=900){
  const deck=await getDeck(presentationId,"full",0,100);
  const slides=deck.slides.filter((s):s is DbSlide=>"document" in s);
  return {presentation:deck.presentation,count:slides.length,
    lockEnabled:!!await readContentLock(presentationId),
    slides:slides.map(s=>{
      const media=inventorySourceVisuals(s.document);
      return {id:s.id,position:s.position,revision:s.revision,mode:s.document.mode,
        canvas:s.document.canvas,objects:s.document.elements.map(el=>({
          id:el.id,type:el.type,name:el.name??null,
          ...(el.type==="text"?{text:(el.text??el.textRuns?.map(r=>r.text).join("")??"").slice(0,maxChars)}:{}),
          styles:el.styles??{},hasImage:!!el.src
        })),imageCount:media.count,svgCount:media.svgCount,
        animationCount:s.document.animations.length,notesCharacters:s.notes.length};
    })};
}
export async function getSourceAssets(presentationId:string,offset=0,limit=40){
  const deck=await getDeck(presentationId,"full",offset,limit);
  const slides=deck.slides.filter((s):s is DbSlide=>"document" in s);
  return {presentationId,assets:slides.flatMap(s=>
    inventorySourceVisuals(s.document).images.map(asset=>({
      slideId:s.id,slideNumber:s.position+1,revision:s.revision,...asset,
      reuse:{sourceSlideId:s.id,sourceImageIndex:asset.sourceIndex}
    }))),nextOffset:deck.nextOffset,
    usage:"To reuse without uploading, use place_source_image with sourceSlideId and sourceImageIndex."};
}
export async function restyleImportedSlides(presentationId:string,raw:unknown[],dryRun=false){
  const parsed=z.array(StyleChangeSchema).min(1).max(40).parse(raw);
  const changes=parsed.map(item=>{
    const operations:SlideOperation[]=[
      ...item.elements.map(el=>({op:"edit_element" as const,id:el.id,styles:el.styles})),
      ...(item.backgroundCss!==undefined?[{op:"set_css" as const,css:item.backgroundCss}]:[]),
      ...(item.animations!==undefined?[{op:"set_animations" as const,
        animations:item.animations as SlideOperation extends never ? never : any}]:[])
    ];
    if(!operations.length)throw Error("empty_restyle_change");
    return {id:item.slideId,revision:item.revision,operations:operations.map(op=>SlideOperationSchema.parse(op))};
  });
  return editSlides(presentationId,changes,dryRun);
}
export async function compareWithSource(presentationId:string,sourcePresentationId?:string){
  const current=await getDeck(presentationId,"full",0,100);
  const slides=current.slides.filter((s):s is DbSlide=>"document" in s);
  if(sourcePresentationId){
    const source=await getDeck(sourcePresentationId,"full",0,100);
    const originals=source.slides.filter((s):s is DbSlide=>"document" in s);
    const results=originals.map((from,index)=>{
      const to=slides[index];
      return {sourceSlideId:from.id,targetSlideId:to?.id??null,position:index,
        issues:to?compareContentSignatures(sourceContentSignature(from.document,from.notes),
          sourceContentSignature(to.document,to.notes)):["slide_missing"]};
    });
    return {ok:results.every(x=>!x.issues.length)&&originals.length===slides.length,
      sourceSlideCount:originals.length,currentSlideCount:slides.length,
      slides:results,sourcePresentationId};
  }
  const baseline=await readContentLock(presentationId);
  if(!baseline)throw Error("no_content_lock_or_source_presentation");
  return compareLockedDeck(baseline,slides);
}
export async function renderDeckBatch(presentationId:string,offset=0,limit=3){
  const deck=await getDeck(presentationId,"full",offset,limit);
  const slides=deck.slides.filter((s):s is DbSlide=>"document" in s);
  const images:Buffer[]=[];const reports:unknown[]=[];
  for(const slide of slides){
    try{
      const captured=await captureSlidePixels(slide.document);
      images.push(await sharp(captured.png).resize({width:480,height:270,fit:"contain",
        background:"#ffffff"}).png().toBuffer());
      reports.push({id:slide.id,position:slide.position,diagnostics:captured.diagnostics});
    }catch(error){
      const message=error instanceof Error?error.message:"render_error";
      reports.push({id:slide.id,position:slide.position,error:message});
    }
  }
  if(!images.length)return {presentationId,offset,processed:slides.length,
    reports,error:"no_slides_rendered",nextOffset:deck.nextOffset};
  const width=960,height=Math.ceil(images.length/2)*270;
  const composites=images.map((input,i)=>({input,left:(i%2)*480,top:Math.floor(i/2)*270}));
  const contact=await sharp({create:{width,height,channels:3,background:"#ffffff"}})
    .composite(composites).png().toBuffer();
  return {presentationId,offset,processed:slides.length,
    generated:images.length,nextOffset:deck.nextOffset,reports,
    mimeType:"image/png",base64:contact.toString("base64"),
    note:"Actual Chromium pixels of the requested batch only; call again with nextOffset to inspect the whole deck."};
}
export async function prepareServerPptx(presentationId:string){
  const deck=await getDeck(presentationId,"full",0,100);
  const slides=deck.slides.filter((s):s is DbSlide=>"document" in s);
  if(!slides.length)throw Error("empty_export");
  const preflight=inspectExport(slides);
  const expires=Date.now()+10*60*1000;
  const payload=[presentationId,"pptx",expires].join(":");
  const ticket=Buffer.from(payload).toString("base64url")+"."+sign(payload);
  return {presentationId,slideCount:slides.length,
    downloadUrl:ORIGIN+"/exports/pptx?ticket="+encodeURIComponent(ticket),
    expiresAt:new Date(expires).toISOString(),mode:"editable",
    warnings:["Server-side native export preserves supported text/image/shape objects. "+
      "Complex freeform HTML, animations, unusual PowerPoint structures and effects may not export identically.",
      ...preflight.warnings]};
}
