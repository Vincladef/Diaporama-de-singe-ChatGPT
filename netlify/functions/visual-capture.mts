import {z} from "zod";
import {safeEqual,sign} from "../../src/mcp/security";
import {getSlide,getVariant} from "../../src/mcp/store";
import {captureSlidePixels} from "../../src/visual/capture";
import {digest} from "../../src/mcp/security";

const shape=z.object({
  slideId:z.uuid(),variantId:z.uuid().nullable(),
  sourceFingerprint:z.string().regex(/^[0-9a-f]{64}$/),
  expiresAt:z.number().int().positive()
}).strict();

export default async function visualCapture(request:Request):Promise<Response>{
  if(request.method!=="POST")
    return Response.json({error:"method_not_allowed"},{status:405,headers:{Allow:"POST"}});
  const body=await request.text().catch(()=>"");
  if(body.length>1200)return Response.json({error:"invalid_payload"},{status:400});
  const token=request.headers.get("x-singe-capture-signature")??"";
  if(!token||!safeEqual(sign(body),token))
    return Response.json({error:"unauthorized"},{status:403});
  const parsed=shape.safeParse(JSON.parse(body));
  if(!parsed.success)return Response.json({error:"invalid_payload"},{status:400});
  const {slideId,variantId,sourceFingerprint,expiresAt}=parsed.data;
  if(expiresAt<Date.now()||expiresAt-Date.now()>45_000)
    return Response.json({error:"expired_capture_request"},{status:403});
  try{
    let document:import("../../src/domain/slide").SlideDocument;
    let currentHash:string;
    if(variantId){
      const variant=await getVariant(slideId,variantId);
      document=variant.document;
      currentHash=variant.fingerprint;
    }else{
      const slide=await getSlide(slideId,"full");
      if(!("document" in slide))throw Error("slide_not_found");
      document=slide.document;
      currentHash=digest(JSON.stringify({
        slideId,revision:slide.revision,document:slide.document,notes:slide.notes
      }));
    }
    if(currentHash!==sourceFingerprint)
      return Response.json({error:"capture_source_changed"},{status:409});
    const result=await captureSlidePixels(document);
    return Response.json({
      mimeType:"image/png",base64:result.png.toString("base64"),
      fingerprint:currentHash,diagnostics:result.diagnostics,
    },{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
      "X-Robots-Tag":"noindex, nofollow"}});
  }catch(error){
    const code=error instanceof Error?error.message:"unknown_capture_error";
    console.error("Visual capture failed",code);
    return Response.json({error:"capture_unavailable",reason:code.slice(0,160)},
      {status:503,headers:{"Cache-Control":"no-store"}});
  }
}
export const config={
  path:"/internal/visual-capture",
  rateLimit:{windowSize:60,windowLimit:20,aggregateBy:"ip" as const},
};
