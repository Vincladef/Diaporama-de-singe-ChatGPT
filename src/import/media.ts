/**
 * Compress imported embedded media before writing the versioned slide JSON to Neon.
 * No remote fetch, upload, external tracking or additional service is required.
 */
export type ImportMediaBudget={used:number;limit:number;seen:Map<string,string>};
export function createImportMediaBudget(limit=16_000_000):ImportMediaBudget {
  return {used:0,limit,seen:new Map()};
}
function toBase64(bytes:Uint8Array):string{
  let out="";
  for(let i=0;i<bytes.length;i+=8192)
    out+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(out);
}
const sizeOfData=(url:string)=>Math.ceil(url.length*.75);
export async function optimizeImportedImage(data:Uint8Array,mime:string,path:string,
  budget:ImportMediaBudget):Promise<string>{
  if(budget.seen.has(path))return budget.seen.get(path)!;
  if(!/^image\/(jpeg|png|webp|gif)$/i.test(mime))throw Error("Format image incompatible : "+mime);
  const bytes=data.byteLength;
  if(bytes>12_000_000)throw Error("Une image intégrée dépasse 12 Mo ; compressez-la avant l'import.");
  if(typeof document==="undefined")throw Error("La compression des images requiert un navigateur.");
  const source=URL.createObjectURL(new Blob([Uint8Array.from(data)],{type:mime}));
  let transformed="";
  try{
    const image=new Image();
    image.decoding="async";
    image.src=source;
    await new Promise<void>((resolve,reject)=>{
      const t=window.setTimeout(()=>reject(Error("Décodage de l'image trop long.")),12000);
      image.onload=()=>{clearTimeout(t);resolve();};
      image.onerror=()=>{clearTimeout(t);reject(Error("Image intégrée non décodable."));};
    });
    const w=image.naturalWidth,h=image.naturalHeight;
    if(!w||!h||w*h>90_000_000)throw Error("Dimensions de l'image excessives.");
    const ratio=Math.min(1,1600/Math.max(w,h));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(w*ratio));
    canvas.height=Math.max(1,Math.round(h*ratio));
    const context=canvas.getContext("2d",{willReadFrequently:true});
    if(!context)throw Error("Le navigateur ne fournit pas Canvas 2D.");
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const usesAlpha=mime==="image/png"||mime==="image/webp";
    let transparent=false;
    if(usesAlpha){
      const sample=context.getImageData(0,0,canvas.width,canvas.height).data;
      for(let i=3;i<sample.length;i+=4)
        if(sample[i]!<250){transparent=true;break;}
    }
    if(transparent){
      transformed=canvas.toDataURL("image/png");
      if(sizeOfData(transformed)>850_000){
        // Smaller PNG retains transparency and makes reliable import much more likely.
        const small=document.createElement("canvas");
        small.width=Math.max(1,Math.round(canvas.width*.65));
        small.height=Math.max(1,Math.round(canvas.height*.65));
        small.getContext("2d")?.drawImage(canvas,0,0,small.width,small.height);
        transformed=small.toDataURL("image/png");
      }
    }else{
      const white=document.createElement("canvas");
      white.width=canvas.width;white.height=canvas.height;
      const c=white.getContext("2d")!;
      c.fillStyle="#fff";c.fillRect(0,0,white.width,white.height);
      c.drawImage(canvas,0,0);
      transformed=white.toDataURL("image/jpeg",.78);
    }
  }finally{URL.revokeObjectURL(source);}
  if(!transformed.startsWith("data:image/")){
    transformed="data:"+mime+";base64,"+toBase64(data);
  }
  budget.used+=sizeOfData(transformed);
  if(budget.used>budget.limit)throw Error("Images volumineuses : budget de "+Math.round(budget.limit/1e6)+" Mo dépassé. Importez une partie des diapositives ou allégez les images.");
  budget.seen.set(path,transformed);
  return transformed;
}
