import test from "node:test";
import assert from "node:assert/strict";
import {changeFilter,readFilter,cropCoordinates,editImageStyles} from "./edit.ts";

test("image adjustments retain unrelated filters",()=>{
 const css=changeFilter("contrast(120%) grayscale(40%)","brightness",85);
 assert.equal(readFilter(css,"brightness"),85);
 assert.equal(readFilter(css,"grayscale"),40);
 assert.equal(readFilter(css,"contrast"),120);
});
test("image adjustment reset removes one filter only",()=>{
 assert.equal(changeFilter("brightness(60%) saturate(180%)","brightness",100),"saturate(180%)");
});
test("crop and rotation update editable object styles",()=>{
 const image={id:"img",type:"image" as const,styles:{objectPosition:"20% 60%",objectFit:"cover"}};
 const next=editImageStyles(image,{cropX:75,contrast:115,rotation:-12});
 assert.equal(next.styles.objectPosition,"75% 60%");
 assert.equal(next.styles.transform,"rotate(-12deg)");
 assert.equal(readFilter(next.styles.filter,"contrast"),115);
 assert.deepEqual(cropCoordinates(next.styles.objectPosition),{x:75,y:60});
});
