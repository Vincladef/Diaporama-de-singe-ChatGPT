import type {SlideDocument,SlideElement} from "../domain/slide.ts";
import type {InitialSlide} from "../mcp/documents.ts";

/** Three authored documents are required. Never generate these from presets. */
export type IndependentVariantInput={
  name:string;
  designIntent:string;
  referenceObservation?:string;
  slide:InitialSlide;
};
export type IndependentFinding={
  severity:"error"|"warning";
  code:string;
  variantIndices:number[];
  message:string;
};
export type IndependentReport={independent:boolean;findings:IndependentFinding[]};

/** Strip cosmetics, prose, asset URLs and HTML ids; keep CSS geometric differences. */
function htmlLayout(html:string):string{
  return html
    .replace(/<!--[\s\S]*?-->/g,"")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,"")
    .replace(/>([^<]*)</g,"><")
    .replace(/\s+(?:id|class|src|alt|title|data-[\w-]+)\s*=\s*(?:"[^"]*"|'[^']*')/gi,"")
    .replace(/\s*style\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,(_,doubleValue:string,singleValue:string)=>
      ' style="'+cssLayout(doubleValue??singleValue??'')+'"')
    .replace(/\s+/g,"")
    .toLowerCase();
}
function cssLayout(css:string):string{
  return css.replace(/\/\*[\s\S]*?\*\//g,"")
    // Remove painting/typographic style, not geometry or object-fit/position.
    .replace(/(?:^|[;{])\s*(?:color|background|background-color|border-color|outline-color|font-family|font-weight|font-style|letter-spacing|text-shadow|box-shadow|filter|opacity)\s*:[^;}]+/gi,"")
    .replace(/#[0-9a-f]{3,8}\b/gi,"#COLOR")
    .replace(/(?:rgb|rgba|hsl|hsla)\([^)]*\)/gi,"COLOR")
    .replace(/\s+/g,"")
    .toLowerCase();
}
function elementLayout(elements:SlideElement[]):string{
  return elements.map(el=>{
    const spatial=Object.entries(el.styles).filter(([key])=>
      /^(left|top|right|bottom|width|height|position|display|grid[a-z-]*|flex[a-z-]*|transform|object-fit|object-position|align[a-z-]*|justify[a-z-]*|padding|margin)$/i.test(key))
      .sort(([a],[b])=>a.localeCompare(b));
    return JSON.stringify([el.type,spatial,!!el.parentId,!!el.linkFrom,!!el.linkTo]);
  }).join("|");
}
export function layoutSignature(doc:SlideDocument):string{
  return [
    doc.mode,doc.canvas.width,doc.canvas.height,
    htmlLayout(doc.freeform?.html??""),
    cssLayout(doc.freeform?.css??""),
    elementLayout(doc.elements),
  ].join("::");
}
export function prepareIndependentVariants(
  source:{document:SlideDocument;notes:string},
  candidates:IndependentVariantInput[]
):{variants:{name:string;slide:InitialSlide}[];report:IndependentReport}{
  const findings:IndependentFinding[]=[];
  if(candidates.length!==3)throw Error("requires_three_independent_variants");
  const names=new Set<string>();
  const concepts=new Set<string>();
  const signatures:string[]=[];
  const sourceSignature=layoutSignature(source.document);
  const variants=candidates.map((candidate,index)=>{
    const name=candidate.name.trim();
    if(!name)throw Error("variant_name_required");
    const nameKey=name.toLocaleLowerCase("fr");
    if(names.has(nameKey))findings.push({severity:"error",code:"duplicate_variant_name",
      variantIndices:[index],message:"Deux propositions portent le même nom."});
    names.add(nameKey);
    const intent=candidate.designIntent.replace(/\s+/g," ").trim();
    if(intent.length<24)findings.push({severity:"error",code:"missing_design_intent",
      variantIndices:[index],message:"Décrire une véritable idée graphique pour chaque proposition."});
    const intentKey=intent.toLocaleLowerCase("fr");
    if(concepts.has(intentKey))findings.push({severity:"error",code:"duplicate_design_intent",
      variantIndices:[index],message:"Les trois directions artistiques doivent être indépendantes."});
    concepts.add(intentKey);
    const doc=candidate.slide.document;
    // The authored route requires the complete document to avoid an implicit template.
    if(!doc||!doc.freeform?.html?.trim()||!doc.freeform.css.trim()||
       (doc.mode!=="freeform"&&doc.mode!=="hybrid"))
      findings.push({severity:"error",code:"missing_authored_document",
        variantIndices:[index],message:"Fournir un document HTML/CSS/SVG intégral pour cette variante."});
    const signature=doc?layoutSignature(doc):"";
    if(signature===sourceSignature)findings.push({severity:"error",code:"reused_source_layout",
      variantIndices:[index],message:"La composition reste celle de la diapositive d'origine."});
    for(let earlier=0;earlier<index;earlier++){
      if(signature&&signature===signatures[earlier])
        findings.push({severity:"error",code:"only_cosmetic_difference",
          variantIndices:[earlier,index],message:"Deux propositions partagent la même géométrie et structure HTML/CSS ; changer seulement les couleurs, images ou polices ne suffit pas."});
    }
    signatures.push(signature);
    if(source.document.animations.length&&!doc?.animations.length)
      findings.push({severity:"warning",code:"animations_need_review",
        variantIndices:[index],message:"La source comporte des animations ; vérifier leur adaptation à la nouvelle composition."});
    if(doc&&doc.canvas.width*source.document.canvas.height!==doc.canvas.height*source.document.canvas.width)
      findings.push({severity:"error",code:"aspect_ratio_changed",
        variantIndices:[index],message:"Une proposition ne conserve pas le ratio de la diapositive."});
    // The source notes, including scientific references, are never discarded.
    const supplied=(candidate.slide.notes??"").trim();
    const notes=source.notes.trim();
    const combined=notes && supplied && !supplied.includes(notes)
      ? notes+"\n\n"+supplied : supplied||notes;
    return {name,slide:{document:doc,notes:combined}};
  });
  return {variants,report:{
    independent:!findings.some(f=>f.severity==="error"),
    findings,
  }};
}
