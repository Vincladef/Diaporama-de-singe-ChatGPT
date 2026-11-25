import {createRequire} from "node:module";
// Force PptxGenJS' Node/CommonJS entry point inside Netlify's CJS function bundle.
// Its ESM build cannot be executed through require() in that environment.
const pptxgen=createRequire(process.cwd()+"/package.json")("pptxgenjs") as typeof import("pptxgenjs").default;
import sharp from "sharp";
import type {SlideDocument,SlideElement} from "../domain/slide.ts";
import {canFetchVisualResource,safeResourceUrl} from "../visual/safety.ts";
import type {DbSlide} from "../mcp/store.ts";

function pixels(value:string|number|undefined,axis:number,otherwise=0):number{
  if(typeof value==="number")return value;
  if(typeof value!=="string")return otherwise;
  const s=value.trim();
  if(s.endsWith("%"))return Number.parseFloat(s)/100*axis;
  if(s.endsWith("rem"))return Number.parseFloat(s)*16;
  if(s.endsWith("pt"))return Number.parseFloat(s)*96/72;
  return Number.parseFloat(s)||otherwise;
}
function rgb(value:string|number|undefined,fallback="FFFFFF"){
  const raw=String(value??"").trim();
  if(/^#[0-9a-f]{6}$/i.test(raw))return raw.slice(1).toUpperCase();
  if(/^#[0-9a-f]{3}$/i.test(raw))return raw.slice(1).split("").map(x=>x+x).join("").toUpperCase();
  return fallback;
}
function geometry(element:SlideElement,document:SlideDocument,w:number,h:number){
  const s=element.styles,C=document.canvas;
  return {
    x:pixels(s.left??s.x,C.width)/C.width*w,
    y:pixels(s.top??s.y,C.height)/C.height*h,
    w:Math.max(.01,pixels(s.width,C.width,C.width/4)/C.width*w),
    h:Math.max(.01,pixels(s.height,C.height,C.height/4)/C.height*h)
  };
}
async function getMediaData(src:string):Promise<string>{
  let bytes:Buffer;
  if(/^data:image\/(png|jpeg|webp|gif);base64,/i.test(src)){
    const body=src.slice(src.indexOf(",")+1);
    if(body.length>16_000_000)throw Error("export_image_too_large");
    bytes=Buffer.from(body,"base64");
  }else{
    if(!safeResourceUrl(src)||!await canFetchVisualResource(src))
      throw Error("unsafe_export_image_url");
    const response=await fetch(src,{redirect:"error",signal:AbortSignal.timeout(12_000)});
    if(!response.ok||!response.body)throw Error("remote_export_image_unavailable");
    const length=Number(response.headers.get("content-length")||0);
    if(length>6_000_000)throw Error("remote_export_image_too_large");
    const chunks:Buffer[]=[];let total=0;
    const reader=response.body.getReader();
    try{for(;;){const next=await reader.read();if(next.done)break;
      total+=next.value.byteLength;
      if(total>6_000_000){await reader.cancel().catch(()=>{});throw Error("remote_export_image_too_large");}
      chunks.push(Buffer.from(next.value));
    }}finally{reader.releaseLock();}
    bytes=Buffer.concat(chunks);
  }
  if(!bytes.length)throw Error("empty_export_image");
  const png=await sharp(bytes,{limitInputPixels:40_000_000}).png().toBuffer();
  return "data:image/png;base64,"+png.toString("base64");
}
/** Native-only export: never substitute full slide screenshots for objects. */
export async function buildServerNativePptx(title:string,rows:DbSlide[]):Promise<Buffer>{
  if(!rows.length||rows.length>100)throw Error("invalid_export_slide_count");
  const initial=rows[0]!.document.canvas;
  const w=13.333,h=w*initial.height/initial.width;
  const pptx=new pptxgen();
  pptx.defineLayout({name:"SINGE_SERVER",width:w,height:h});pptx.layout="SINGE_SERVER";
  pptx.author="Diaporama de singe";
  pptx.title=title.slice(0,180);
  pptx.subject="PowerPoint avec objets modifiables";
  const imageCache=new Map<string,string>();
  for(const row of rows){
    const doc=row.document;
    if(Math.abs(doc.canvas.width/doc.canvas.height-initial.width/initial.height)>.005)
      throw Error("mixed_aspect_ratios_not_exportable");
    if(doc.freeform?.html.trim())throw Error("freeform_html_requires_browser_export");
    const slide=pptx.addSlide();
    const bg=doc.freeform?.css.match(/\bbackground(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6})/);
    slide.background={color:rgb(bg?.[1],"FFFFFF")};
    for(const element of doc.elements){
      if(element.hidden||element.type==="group")continue;
      const box=geometry(element,doc,w,h),styles=element.styles;
      if(element.type==="text"){
        const raw=element.text??element.textRuns?.map(x=>x.text).join("")??"";
        const fontPx=pixels(styles.fontSize,doc.canvas.width,48);
        slide.addText(raw,{
          ...box,objectName:element.id,
          color:rgb(styles.color,"202A30"),
          fontFace:String(styles.fontFamily??"Aptos").replace(/["']/g,"").split(",")[0]||"Aptos",
          fontSize:Math.max(5,Math.min(300,fontPx*72/96)),
          bold:styles.fontWeight==="bold"||Number(styles.fontWeight)>=600,
          italic:styles.fontStyle==="italic",
          align:styles.textAlign==="center"?"center":styles.textAlign==="right"?"right":"left",
          margin:0,breakLine:false,valign:"top",
          transparency:0,
        });
      }else if(element.type==="shape"){
        const fill=rgb(styles.backgroundColor??styles.background,"FFFFFF");
        const circle=styles.borderRadius==="50%";
        const hasFill=!!(styles.backgroundColor||styles.background||styles.borderColor);
        if(hasFill||!element.text){
          slide.addShape(circle?pptx.ShapeType.ellipse:pptx.ShapeType.rect,{
            ...box,objectName:element.id,
            fill:{color:fill,transparency:styles.backgroundColor||styles.background?0:100},
            line:{color:rgb(styles.borderColor,fill),transparency:styles.borderColor?0:100},
          });
        }
        // Native shape text must be exported, not silently reduced to an empty rectangle.
        // Text and the transparent source shape remain independently editable in PPTX.
        const raw=element.text??element.textRuns?.map(x=>x.text).join("")??"";
        if(raw){
          const fontPx=pixels(styles.fontSize,doc.canvas.width,48);
          slide.addText(raw,{
            ...box,objectName:element.id+"-text",
            color:rgb(styles.color,"202A30"),
            fontFace:String(styles.fontFamily??"Aptos").replace(/["']/g,"").split(",")[0]||"Aptos",
            fontSize:Math.max(5,Math.min(300,fontPx*72/96)),
            bold:styles.fontWeight==="bold"||Number(styles.fontWeight)>=600,
            italic:styles.fontStyle==="italic",
            align:styles.textAlign==="center"?"center":styles.textAlign==="right"?"right":"left",
            margin:0,breakLine:false,valign:"top",
            transparency:0,
          });
        }
      }else if(element.type==="image"&&element.src){
        let img=imageCache.get(element.src);
        if(!img){img=await getMediaData(element.src);imageCache.set(element.src,img);}
        const fit=String(styles.objectFit??"contain");
        slide.addImage({data:img,...box,objectName:element.id,
          sizing:{type:fit==="cover"?"cover":"contain",w:box.w,h:box.h}});
      }else if(element.type==="svg"&&element.text){
        const png=await sharp(Buffer.from(element.text),{limitInputPixels:40_000_000}).png().toBuffer();
        slide.addImage({data:"data:image/png;base64,"+png.toString("base64"),
          ...box,objectName:element.id});
      }
    }
    if(row.notes&&typeof slide.addNotes==="function")slide.addNotes(row.notes);
  }
  const generated=await pptx.write({outputType:"nodebuffer"});
  const binary=Buffer.from(generated as Buffer);
  if(binary.length>60_000_000)throw Error("server_export_too_large");
  return binary;
}
