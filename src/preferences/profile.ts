import type {SlideDocument} from "../domain/slide.ts";
import type {VisualKind} from "../creative/referenceLibrary.ts";

export function inferPurpose(doc:SlideDocument,notes:string):{kind:VisualKind;reason:string;excerpt:string}{
  const prose=[...doc.elements.filter(e=>e.type==="text").map(e=>e.text??""),
    (doc.freeform?.html??"").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,"").replace(/<[^>]*>/g," ")].join(" ")
    .replace(/\s+/g," ").trim();
  const content=prose+" "+notes.slice(0,500);
  const hasImage=doc.elements.some(e=>e.type==="image")||
    /<img\b|background-image\s*:|url\(/i.test((doc.freeform?.html??"")+" "+(doc.freeform?.css??""));
  const hasDiagram=doc.elements.some(e=>!!e.linkFrom||!!e.linkTo||e.type==="svg")||
    /<svg\b|→|⇒|cause|boucle|mécanisme/i.test(content);
  const isData=/%|\b(?:résultats?|données?|effectifs?|échantillon|figure|graphique|tableau)\b/i.test(content);
  const isComparison=/\b(?:comparaison|versus|contre|différences?|deux conditions|vs\.?|avantages?|inconvénients?)\b/i.test(content);
  const isQuote=/^\s*[«“]|citation|témoignage/i.test(prose);
  const kind:VisualKind=isData?"graphique":hasDiagram?"schématique":
    isComparison?"comparatif":isQuote?"typographique":hasImage?"photographique":"mixte";
  const reason=kind==="graphique"?"Les données doivent être représentées sans valeurs inventées.":
    kind==="schématique"?"Une relation ou un mécanisme est présent.":
    kind==="comparatif"?"Le contenu oppose ou rapproche des situations.":
    kind==="photographique"?"La source possède un rôle photographique.":
    kind==="typographique"?"Le texte constitue le centre pédagogique.":"La fonction visuelle reste à interpréter par l'IA.";
  return {kind,reason,excerpt:prose.slice(0,1800)};
}


/** Brief, safe description of the graphical technique; never mistake a user's choice for universal aesthetic truth. */
export function designProfile(document:SlideDocument){
  const d=document;
  const counts={text:0,image:0,shape:0,svg:0,group:0};
  const fonts=new Set<string>(),colors=new Set<string>();
  for(const el of d.elements){
    counts[el.type]++;
    if(typeof el.styles.fontFamily==="string")fonts.add(el.styles.fontFamily.slice(0,90));
    for(const key of ["color","background","backgroundColor"]){
      const value=el.styles[key];
      if(typeof value==="string"&&value.startsWith("#"))colors.add(value.slice(0,20));
    }
  }
  const css=d.freeform?.css??"";
  for(const match of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)){
    if(fonts.size<12)fonts.add(match[1]!.trim().slice(0,90));
  }
  for(const match of css.matchAll(/#[0-9a-f]{6}\b/gi)){
    if(colors.size<12)colors.add(match[0].toLowerCase());
  }
  return {
    mode:d.mode,canvasRatio:Number((d.canvas.width/d.canvas.height).toFixed(3)),
    counts,fonts:[...fonts].slice(0,12),palette:[...colors].slice(0,12),
    layoutHints:(css.match(/display\s*:\s*(?:grid|flex)|grid-template-columns\s*:[^;}]*/gi)??[])
      .slice(0,8).map(x=>x.slice(0,180)),
    animationCount:d.animations.length,
  };
}
