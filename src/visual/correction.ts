export interface SafeVisualCorrection{
  appendCss?:string;
  elementStyles?:Array<{id:string;styles:Record<string,string|number>}>;
  reason:string;
}
export function validateVisualCorrection(input:SafeVisualCorrection):void{
  if(!input.reason.trim()||input.reason.length>1200)throw Error("visual_correction_reason_required");
  if(!input.appendCss?.trim()&&!input.elementStyles?.length)throw Error("empty_visual_correction");
  if(input.appendCss&&input.appendCss.length>9000)throw Error("visual_css_patch_too_long");
  if((input.elementStyles?.length??0)>12)throw Error("too_many_geometry_patches");
  // A visual correction must not remove or rewrite scientific text or citations.
  const styles=[input.appendCss??"",
    ...(input.elementStyles??[]).flatMap(x=>Object.values(x.styles).map(String))].join(" ");
  if(/(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;}]|$)|content\s*:|@import\b|<script|url\s*\(\s*['"]?javascript:)/i.test(styles))
    throw Error("unsafe_visual_correction");
  for(const el of input.elementStyles??[]){
    if(!el.id||Object.keys(el.styles).length>20)throw Error("invalid_visual_element_patch");
    if(Object.keys(el.styles).some(key=>![
      "left","top","width","height","right","bottom","fontSize","lineHeight","objectFit",
      "objectPosition","padding","margin","transform","color","background",
      "borderRadius","maxWidth","maxHeight","minWidth","minHeight","textAlign",
      "letterSpacing","fontWeight","fontFamily",
    ].includes(key)))throw Error("unsupported_visual_element_style");
  }
}
