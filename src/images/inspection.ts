import sharp from "sharp";
import {z} from "zod";
import {canFetchVisualResource} from "../visual/safety.ts";

export const CropTargetSchema=z.object({
  width:z.number().int().min(200).max(2560).default(1200),
  height:z.number().int().min(150).max(1600).default(675),
}).strict();
export type CropTarget=z.infer<typeof CropTargetSchema>;
export type PhotoCrop={
  id:"center"|"attention"|"entropy";
  label:string;focalX:number;focalY:number;
  mimeType:"image/webp";previewBase64:string;
  width:number;height:number;bytes:number;
};
export type PhotoInspection={
  width:number;height:number;format:string;orientation:number;
  resolution:"adequate"|"limited"|"insufficient";
  imageBytes:number;cropTarget:CropTarget;
  crops:PhotoCrop[];
  warning:string|null;
};
export const InspectPhotoRequestSchema=z.object({
  url:z.url().max(2500).refine(x=>x.startsWith("https://")),
  target:CropTargetSchema.default({width:1200,height:675}),
}).strict();

const MAX_IMAGE_BYTES=12_000_000;
const MAX_PIXELS=35_000_000;
const ALLOWED_HOSTS=new Set([
 "images.unsplash.com","upload.wikimedia.org","commons.wikimedia.org",
 "images.pexels.com","live.staticflickr.com","images.pixabay.com","cdn.pixabay.com",
 "images.openverse.org","images.pexelscdn.com"
]);
export function safePhotoHost(raw:string):boolean{
  try{
    const parsed=new URL(raw);
    return parsed.protocol==="https:"&&!parsed.username&&!parsed.password&&
      (!parsed.port||parsed.port==="443")&&ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
  }catch{return false;}
}
export async function retrievePhoto(url:string):Promise<Buffer>{
  if(!safePhotoHost(url))throw Error("unsupported_image_host");
  let current=url;
  for(let redirects=0;redirects<4;redirects++){
    if(!safePhotoHost(current)||!await canFetchVisualResource(current))
      throw Error("image_network_destination_blocked");
    const response=await fetch(current,{
      redirect:"manual",headers:{Accept:"image/jpeg,image/png,image/webp,image/avif,image/gif"},
      signal:AbortSignal.timeout(10_000),
    });
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get("location");
      if(!location)throw Error("image_redirect_without_target");
      current=new URL(location,current).href;
      continue;
    }
    if(!response.ok)throw Error("image_http_"+response.status);
    const mime=(response.headers.get("content-type")??"").split(";")[0]?.trim().toLowerCase();
    if(!["image/jpeg","image/png","image/webp","image/avif","image/gif"].includes(mime??""))
      throw Error("unsupported_image_mime");
    if(Number(response.headers.get("content-length")??0)>MAX_IMAGE_BYTES)
      throw Error("image_oversize");
    const data=Buffer.from(await response.arrayBuffer());
    if(data.length>MAX_IMAGE_BYTES)throw Error("image_oversize");
    return data;
  }
  throw Error("image_too_many_redirects");
}
const round=(x:number)=>Math.max(0,Math.min(100,Math.round(x)));
function focalFromCrop(
 strategy:"center"|"attention"|"entropy",info:sharp.OutputInfo,
 original:{width:number;height:number},target:CropTarget
):{x:number;y:number}{
  if(strategy==="center")return {x:50,y:50};
  const tw=target.width,th=target.height,ratio=tw/th,origRatio=original.width/original.height;
  const cropW=origRatio>ratio?original.height*ratio:original.width;
  const cropH=origRatio<ratio?original.width/ratio:original.height;
  const details=info as sharp.OutputInfo&{attentionX?:number;attentionY?:number;cropOffsetLeft?:number;cropOffsetTop?:number};
  // Cropping offset has the same geometry as CSS object-position after cover fit.
  const x=original.width-cropW>1?100*(details.cropOffsetLeft??(original.width-cropW)/2)/(original.width-cropW):50;
  const y=original.height-cropH>1?100*(details.cropOffsetTop??(original.height-cropH)/2)/(original.height-cropH):50;
  return {x:round(x),y:round(y)};
}
/** Decode once for source metadata; render three genuine Sharp crops, never invent AI focal points. */
export async function inspectPhotoBuffer(bytes:Buffer,targetRaw:CropTarget):Promise<PhotoInspection>{
  if(bytes.length<100||bytes.length>MAX_IMAGE_BYTES)throw Error("image_invalid_size");
  const target=CropTargetSchema.parse(targetRaw);
  const metadata=await sharp(bytes,{limitInputPixels:MAX_PIXELS,animated:false}).metadata();
  if(!metadata.width||!metadata.height)throw Error("image_no_dimensions");
  const rotated=metadata.orientation&&[5,6,7,8].includes(metadata.orientation);
  const width=rotated?metadata.height:metadata.width,height=rotated?metadata.width:metadata.height;
  if(width*height>MAX_PIXELS)throw Error("image_excessive_pixels");
  const ratio=Math.min(width/target.width,height/target.height);
  const resolution=ratio>=1?"adequate":ratio>=.7?"limited":"insufficient";
  const strategies=[
    {id:"center" as const,label:"Centré",value:sharp.gravity.centre},
    {id:"attention" as const,label:"Sujet privilégié",value:sharp.strategy.attention},
    {id:"entropy" as const,label:"Détails préservés",value:sharp.strategy.entropy},
  ];
  const tw=Math.min(800,target.width),th=Math.max(150,Math.round(tw*target.height/target.width));
  const crops=await Promise.all(strategies.map(async s=>{
    const result=await sharp(bytes,{limitInputPixels:MAX_PIXELS,animated:false})
      .rotate()
      .resize(tw,th,{fit:"cover",position:s.value,withoutEnlargement:false})
      .webp({quality:78,effort:4})
      .toBuffer({resolveWithObject:true});
    const focal=focalFromCrop(s.id,result.info,{width,height},target);
    return {id:s.id,label:s.label,focalX:focal.x,focalY:focal.y,
      mimeType:"image/webp" as const,previewBase64:result.data.toString("base64"),
      width:tw,height:th,bytes:result.data.length};
  }));
  return {width,height,format:metadata.format??"unknown",orientation:metadata.orientation??1,
    resolution,imageBytes:bytes.length,cropTarget:target,crops,
    warning:resolution==="insufficient"
      ?"Cette photographie sera agrandie au-delà de sa résolution native."
      :resolution==="limited"?"Photographie légèrement sous-dimensionnée pour ce cadre.":null};
}
export async function inspectPhotoUrl(raw:{url:string;target:CropTarget}):Promise<PhotoInspection>{
  return inspectPhotoBuffer(await retrievePhoto(raw.url),raw.target);
}
