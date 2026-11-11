import type {SlideDocument} from "../domain/slide.ts";

/** Static markup/media inventory only. Actual load/crop must be verified by Chromium pixels. */
export function inspectMarkupMedia(document:SlideDocument){
 const html=document.freeform?.html??"";
 const css=document.freeform?.css??"";
 const imageUrls=[...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)]
   .map(x=>x[1]??"");
 const backgroundUrls=[...css.matchAll(/(?:background|background-image)\s*:[^;{}]*url\(\s*["']?([^)'"]+)/gi)]
   .map(x=>x[1]??"");
 const htmlTextBlocks=[...html.matchAll(/<(?:h[1-6]|p|blockquote|li|figcaption|strong|small)\b/gi)].length;
 const allowed=(url:string)=>/^https:\/\//i.test(url)||
   /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(url);
 return {imageUrls,backgroundUrls,
   imageCount:imageUrls.length+backgroundUrls.length,
   htmlTextBlocks,
   invalidUrls:[...imageUrls,...backgroundUrls].filter(x=>!allowed(x))};
}
