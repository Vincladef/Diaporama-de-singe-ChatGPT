import {convertPptxToPng} from "pptx-glimpse";
import JSZip from "jszip";
import {assertPowerPointArchiveBudget} from "../import/parse.ts";
import {extractPowerPointGeometry} from "./referenceGeometry.ts";
import {classifyReferenceSlide,type VisualLayout} from "./referenceLibrary.ts";

export interface RenderedReferencePage {
  slideNumber:number;
  png:Uint8Array;
  width:number;
  height:number;
  layout:VisualLayout;
  renderWarning:string;
}
const MAX_REFERENCE_BYTES=4_000_000;
const MAX_PREVIEW_BYTES=4_000_000;
export const RENDER_BATCH_SIZE=3;
export const MAX_REFERENCE_SLIDES=100;

/**
 * Render actual PPTX content, not inferred XML rectangles.
 * pptx-glimpse is an independent renderer, not PowerPoint/LibreOffice,
 * so font substitutions and unsupported shapes may differ from the original.
 */
export async function renderPptxReferenceBatch(
  bytes:Uint8Array,start:number,count=RENDER_BATCH_SIZE
):Promise<{totalSlides:number;pages:RenderedReferencePage[];engine:string}>{
  if(bytes.byteLength<100||bytes.byteLength>MAX_REFERENCE_BYTES)throw Error("invalid_reference_file");
  if(!Number.isInteger(start)||start<1||!Number.isInteger(count)||count<1||count>RENDER_BATCH_SIZE)
    throw Error("invalid_reference_batch");
  const archive=await JSZip.loadAsync(bytes);
  assertPowerPointArchiveBudget(archive);
  const geometry=await extractPowerPointGeometry(bytes,MAX_REFERENCE_SLIDES);
  if(geometry.slideCount<1||geometry.slideCount>MAX_REFERENCE_SLIDES)
    throw Error("invalid_reference_slide_count");
  const slideNumbers=geometry.slides.map(s=>s.index).filter(index=>index>=start&&index<start+count);
  if(slideNumbers.length===0)return {totalSlides:geometry.slideCount,pages:[],engine:"pptx-glimpse"};
  const report=await convertPptxToPng(bytes,{slides:slideNumbers,width:960,logLevel:"off"});
  const diagnostics=Array.isArray(report.diagnostics)?report.diagnostics:[];
  const warning=diagnostics.length?"Le moteur de rendu signale "+diagnostics.length+
    " avertissement(s) ; certains effets, polices ou objets peuvent différer du PowerPoint.":"";
  const pages:RenderedReferencePage[]=[];
  for(let i=0;i<slideNumbers.length;i++){
    const converted=report.slides[i];
    const slideNumber=slideNumbers[i]!;
    if(!converted?.png)continue;
    const png=new Uint8Array(converted.png);
    if(png.byteLength<100||png.byteLength>MAX_PREVIEW_BYTES)throw Error("invalid_reference_preview_size");
    if(Buffer.from(png.subarray(0,8)).toString("hex")!=="89504e470d0a1a0a")
      throw Error("invalid_reference_preview_png");
    const w=new DataView(png.buffer,png.byteOffset,png.byteLength).getUint32(16);
    const h=new DataView(png.buffer,png.byteOffset,png.byteLength).getUint32(20);
    if(w<100||h<100||w>4096||h>4096)throw Error("invalid_reference_preview_geometry");
    const slide=geometry.slides.find(s=>s.index===slideNumber);
    if(!slide)continue;
    pages.push({
      slideNumber,png,width:w,height:h,
      layout:classifyReferenceSlide(slide),renderWarning:warning,
    });
  }
  return {totalSlides:geometry.slideCount,pages,engine:"pptx-glimpse"};
}
