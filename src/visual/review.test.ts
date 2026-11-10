import {test} from "node:test";
import assert from "node:assert/strict";
import {validateVisualCorrection} from "./correction.ts";

test("allows a targeted CSS layout correction without touching intellectual content",()=>{
  assert.doesNotThrow(()=>validateVisualCorrection({
    reason:"Le titre dépasse à gauche ; réduire légèrement son corps et son interlignage.",
    appendCss:"h1{font-size:72px;line-height:1.08} .photo{object-position:40% center}",
  }));
  assert.doesNotThrow(()=>validateVisualCorrection({
    reason:"Repositionner l'image de référence sans changer son contenu.",
    elementStyles:[{id:"hero-photo",styles:{left:"30px",width:"70%",objectPosition:"42% center"}}]
  }));
});
test("rejects hiding text or changing unapproved element properties",()=>{
  for(const css of ["h1{display:none}","p{visibility:hidden}","main{opacity:0}","h1::after{content:'invented result'}","@import url(https://example.com/asset.css)"]){
    assert.throws(()=>validateVisualCorrection({reason:"Correction non conforme.",appendCss:css}),/unsafe_visual_correction/);
  }
  assert.throws(()=>validateVisualCorrection({
    reason:"Changer une source scientifique dans un faux correctif graphique.",
    elementStyles:[{id:"title",styles:{src:"https://example.com/altered.png"}}]
  }),/unsupported_visual_element_style/);
});
test("rejects empty patches and unbounded visual changes",()=>{
  assert.throws(()=>validateVisualCorrection({reason:"Texte de correction."}),/empty_visual_correction/);
  assert.throws(()=>validateVisualCorrection({reason:"Petite mise au point.",appendCss:"a".repeat(9001)}),/visual_css_patch_too_long/);
});
