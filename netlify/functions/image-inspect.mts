import {z,ZodError} from "zod";
import {authorizeBearer,oauthError} from "../../src/mcp/security";
import {InspectPhotoRequestSchema,inspectPhotoUrl} from "../../src/images/inspection";

const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export default async function imageInspect(request:Request):Promise<Response>{
  if(request.method!=="POST")
    return Response.json({error:"method_not_allowed"},{status:405,headers:{...headers,Allow:"POST"}});
  if(!await authorizeBearer(request,"read"))return oauthError();
  try{
    const body=await request.text();
    if(body.length>3000)return Response.json({error:"payload_too_large"},{status:413,headers});
    const args=InspectPhotoRequestSchema.parse(JSON.parse(body));
    const inspected=await inspectPhotoUrl(args);
    return Response.json({ok:true,inspection:inspected},{headers});
  }catch(error){
    if(error instanceof ZodError)return Response.json({error:"invalid_image_request"}, {status:400,headers});
    const message=error instanceof Error?error.message:"unknown";
    // A provider's image URL is never disclosed in diagnostics.
    const known= /^(unsupported_image_host|image_network_destination_blocked|image_invalid_size|image_excessive_pixels|image_oversize|image_http_\d{3}|unsupported_image_mime|image_no_dimensions|image_redirect_without_target|image_too_many_redirects)$/.test(message);
    return Response.json({ok:false,error:known?message:"image_unavailable"},
      {status:known&&message==="unsupported_image_host"?422:502,headers});
  }
}
export const config={rateLimit:{windowSize:60,windowLimit:18,aggregateBy:"ip" as const}};
