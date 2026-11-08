import type { SlideElement } from "../domain/slide";

/** CSS filter manipulations preserving all unrelated image properties. */
export type ImageFilterKey="brightness"|"contrast"|"saturate"|"grayscale"|"blur";
export const IMAGE_FILTER_DEFAULTS:Record<ImageFilterKey,number>={
  brightness:100,contrast:100,saturate:100,grayscale:0,blur:0,
};
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
export function readFilter(filter:unknown,key:ImageFilterKey):number{
  if(typeof filter!=="string")return IMAGE_FILTER_DEFAULTS[key];
  const match=filter.match(new RegExp("(?:^|\\s)"+key+"\\(\\s*([\\d.]+)\\s*(%|px)?\\s*\\)"));
  if(!match)return IMAGE_FILTER_DEFAULTS[key];
  const value=Number(match[1]);
  return Number.isFinite(value)?value:IMAGE_FILTER_DEFAULTS[key];
}
export function changeFilter(filter:unknown,key:ImageFilterKey,value:number):string{
  const initial=typeof filter==="string"?filter.trim():"";
  const min=0,max=key==="blur"?40:key==="grayscale"?100:300;
  const fixed=clamp(value,min,max);
  const re=new RegExp("(?:^|\\s)"+key+"\\(\\s*[\\d.]+\\s*(?:%|px)?\\s*\\)","g");
  const cleaned=initial.replace(re," ").replace(/\s+/g," ").trim();
  const isDefault=fixed===IMAGE_FILTER_DEFAULTS[key];
  const rendered=isDefault?"":key+"("+fixed+(key==="blur"?"px":"%")+")";
  return [cleaned,rendered].filter(Boolean).join(" ");
}
export function cropCoordinates(input:unknown):{x:number;y:number}{
  if(typeof input!=="string")return {x:50,y:50};
  const parts=input.trim().match(/^([\d.]+)%\s+([\d.]+)%$/);
  if(!parts)return {x:50,y:50};
  return {x:clamp(Number(parts[1]),0,100),y:clamp(Number(parts[2]),0,100)};
}
export function editImageStyles(element:SlideElement,change:Partial<{brightness:number;contrast:number;saturate:number;grayscale:number;blur:number;cropX:number;cropY:number;fit:string;rotation:number}>):SlideElement{
  let filter=element.styles.filter;
  const styles={...element.styles};
  for(const key of ["brightness","contrast","saturate","grayscale","blur"] as ImageFilterKey[]){
    const val=change[key];if(val!==undefined)filter=changeFilter(filter,key,val);
  }
  if(filter!==undefined)styles.filter=String(filter);
  if(change.cropX!==undefined||change.cropY!==undefined){
    const p=cropCoordinates(styles.objectPosition);
    styles.objectPosition=clamp(change.cropX??p.x,0,100)+"% "+clamp(change.cropY??p.y,0,100)+"%";
  }
  if(change.fit!==undefined)styles.objectFit=change.fit;
  if(change.rotation!==undefined)styles.transform="rotate("+clamp(change.rotation,-180,180)+"deg)";
  return {...element,styles};
}
