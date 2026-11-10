import {test} from "node:test";
import assert from "node:assert/strict";
import {createEmptySlideDocument} from "../domain/slide.ts";
import {designProfile,inferPurpose} from "./profile.ts";
import {rankVisualPreferences,summarizeVisualPreferenceGuide,type PreferenceView} from "./ranking.ts";

const presentation="00000000-0000-4000-8000-000000000001";
function make(id:string,kind:PreferenceView["kind"],scope:PreferenceView["scope"],
  slideKind:PreferenceView["slideKind"],comment=""):PreferenceView{
 return {id,slideId:"slide-"+id,variantId:"variant-"+id,presentationId:presentation,
  kind,scope,comment,slideKind,variantName:"Composition "+id,
  referencesUsed:[],offeredVariants:[{id:"alt",name:"Option non sélectionnée"}],
  designContext:{},designProfile:{},selectionCount:1,
  updatedAt:"2026-11-10T21:00:00.000Z"};
}
test("one selected version is positive but alternatives are not inferred negative",()=>{
 const record=make("a","selected","presentation","schématique");
 const guide=summarizeVisualPreferenceGuide([record],"schématique",presentation);
 assert.match(guide,/Signaux positifs/);
 assert.ok(!guide.includes("Rejets explicites"));
 assert.match(guide,/non sélectionnées ne sont jamais assimilées à des rejets/);
});
test("scope filters out other decks but retains global preferences",()=>{
 const local=make("local","disliked","presentation","schématique","Ne pas superposer les flèches");
 const global=make("fav","saved","global","schématique","Préférer des pages documentaires");
 const foreign={...make("other","saved","presentation","schématique"),presentationId:"00000000-0000-4000-8000-000000000002"};
 const relevant=rankVisualPreferences([local,global,foreign],"schématique",presentation);
 assert.deepEqual(new Set(relevant.map(x=>x.id)),new Set(["local","fav"]));
});
test("similar pedagogical use cases outrank unrelated liked examples",()=>{
 const matching=make("matching","selected","presentation","schématique");
 const unrelated=make("offtopic","saved","global","photographique");
 assert.equal(rankVisualPreferences([unrelated,matching],"schématique",presentation)[0]?.id,"matching");
});
test("more explicit rejections do not become a categorical design ban",()=>{
 const rejected=make("rejected","disliked","presentation","comparatif","Trop de cartes arrondies");
 const guide=summarizeVisualPreferenceGuide([rejected],"comparatif",presentation);
 assert.match(guide,/Rejets explicites/);
 assert.match(guide,/Trop de cartes arrondies/);
 assert.match(guide,/conserver la diversité/);
});
test("visual kind and style profile are derived without touching scientific text",()=>{
 const document=createEmptySlideDocument();
 document.mode="hybrid";
 document.freeform={html:'<main><h1>Attention sur soi → anxiété</h1></main>',
  css:"main{display:grid;grid-template-columns:1fr 2fr;background:#213a31;font-family:Georgia}"};
 document.elements=[{id:"photo",type:"image",src:"https://example.org/source.png",styles:{
  color:"#fefefe",left:"30px"}}];
 const category=inferPurpose(document,"Notes : hypothèse cognitive");
 const profile=designProfile(document);
 assert.equal(category.kind,"schématique");
 assert.deepEqual(profile.palette,["#fefefe","#213a31"]);
 assert.ok(profile.fonts.includes("Georgia"));
 assert.equal(profile.counts.image,1);
 assert.equal(profile.animationCount,0);
});
