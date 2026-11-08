import { authorizeBearer, oauthError } from "../../src/mcp/security";
import { imageRequestSchema, searchImages, getSourceStatuses } from "../../src/images/search";
import { ZodError } from "zod";

const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
export default async function imageSearch(request:Request):Promise<Response>{
  if(request.method!=="GET")return Response.json({error:"method_not_allowed"},{status:405,headers});
  try{
    if(!await authorizeBearer(request,"read"))return oauthError();
    const url=new URL(request.url);
    if(url.searchParams.get("op")==="sources")return Response.json({sources:getSourceStatuses()}, {headers});
    const parsed=imageRequestSchema.parse({
      query:url.searchParams.get("q")??"",
      sources:(url.searchParams.get("sources")??"openverse,wikimedia").split(","),
      page:Number(url.searchParams.get("page")??1),
      perSource:Number(url.searchParams.get("perSource")??20),
      orientation:url.searchParams.get("orientation")??"any",
    });
    return Response.json(await searchImages(parsed),{headers});
  }catch(error){
    if(error instanceof ZodError)return Response.json({error:"invalid_query",issues:error.issues.slice(0,5)},{status:400,headers});
    console.error("Image search unavailable",error instanceof Error?error.message:"unknown");
    return Response.json({error:"image_search_unavailable"},{status:503,headers});
  }
}
export const config={rateLimit:{windowSize:60,windowLimit:45,aggregateBy:"ip" as const}};
