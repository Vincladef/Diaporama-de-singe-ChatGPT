import type {SlideDocument} from "../domain/slide.ts";
import {getSlide,createVariants} from "./store.ts";
import {getCreationInstructions} from "./instructions.ts";
import {generateVisualReferencePages,readVisualReferenceImage,searchVisualReferencePages} from "./referencePages.ts";
import {prepareIndependentVariants,type IndependentVariantInput} from "../variants/independent.ts";
import type {VisualKind} from "../creative/referenceLibrary.ts";

function inferPurpose(doc:SlideDocument,notes:string):{kind:VisualKind;reason:string;excerpt:string}{
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

export async function prepareIndependentVariantBrief(slideId:string,loadReferences=true){
  const slide=await getSlide(slideId,"full");
  if(!("document" in slide))throw Error("slide_not_found");
  const instructions=await getCreationInstructions(slide.presentation_id);
  const purpose=inferPurpose(slide.document,slide.notes);
  let references=await searchVisualReferencePages({limit:7,kind:purpose.kind});
  const warnings:string[]=[];
  if(loadReferences&&!references.pages.length){
    const firstPptx=instructions.references.find(r=>r.mimeType.includes("presentationml.presentation"));
    if(firstPptx){
      try{
        await generateVisualReferencePages(firstPptx.id,1,3);
        references=await searchVisualReferencePages({limit:7,kind:purpose.kind});
      }catch(e){
        warnings.push("L'aperçu PowerPoint n'a pas pu être préparé : "+(e instanceof Error?e.message:"erreur inconnue"));
      }
    }
  }
  const chosen=references.pages.filter(p=>p.selected).slice(0,3);
  const selectedImages=await Promise.all(chosen.map(async reference=>{
    try{
      const im=await readVisualReferenceImage(reference.referenceId,reference.slideNumber);
      return {referenceId:reference.referenceId,slideNumber:reference.slideNumber,
        visualKind:reference.visualKind,layout:reference.layout,
        mimeType:im.mimeType,base64:im.base64};
    }catch(e){
      warnings.push("Capture de référence inaccessible : "+reference.referenceId+" #"+reference.slideNumber);
      return null;
    }
  }));
  return {
    slideId, presentationId:slide.presentation_id,revision:slide.revision,
    source:{document:slide.document,notes:slide.notes,semanticPurpose:purpose},
    globalAndLocalInstructions:instructions.effective,
    visualReferences:chosen.map(p=>({referenceId:p.referenceId,slideNumber:p.slideNumber,
      visualKind:p.visualKind,composition:p.layout.composition,score:p.score})),
    previewImages:selectedImages.filter(x=>x!==null),
    steps:[
      "Analyser la fonction pédagogique et les règles générales et locales.",
      "Observer les images des pages de référence ; réutiliser la grammaire graphique sans recopier texte ni contenu.",
      "Inventer indépendamment trois directions graphiques liées à ce contenu précis, sans trois styles fixes.",
      "Créer trois documents HTML/CSS/SVG complets, avec cadres et images utiles ; préserver le sens scientifique.",
      "Transmettre les trois documents à create_independent_variants, avec leur justification.",
      "Consulter list_variants et, si possible, des aperçus réellement rendus. Ne pas prétendre avoir vu les pixels sans capture."
    ],
    requiredCount:3,
    generator:"ChatGPT via MCP (aucun modèle externe n'est appelé par le serveur)",
    warnings
  };
}
export async function saveIndependentVariants(
  slideId:string,expectedRevision:number,
  variants:IndependentVariantInput[]
){
  const slide=await getSlide(slideId,"full");
  if(!("document" in slide))throw Error("slide_not_found");
  if(slide.revision!==expectedRevision)throw Error("revision_conflict");
  const prepared=prepareIndependentVariants({document:slide.document,notes:slide.notes},variants);
  if(!prepared.report.independent){
    return {saved:false,reason:"variants_not_independent",
      ...prepared.report,created:0,variants:[]};
  }
  const saved=await createVariants(slideId,prepared.variants,expectedRevision);
  return {saved:true,...saved,report:prepared.report,sourceRevision:expectedRevision,
    activeSlideUnchanged:true};
}
