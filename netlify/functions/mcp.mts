import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { authorizeBearer, oauthChallenge, oauthError, ORIGIN, RESOURCE } from "../../src/mcp/security";
import { InitialSlideSchema, SlideOperationSchema } from "../../src/mcp/documents";
import {
  activateVariant, addSlides, createDeck, createVariants, deleteDeck, duplicateSlide, editSlides, getDeck, getSlide,
  listAssets, listDecks, listFolders, listVariants, manageFolder, removeSlides, reorderSlides,
  saveAssets, updateDeck
} from "../../src/mcp/store";

type JsonObject = Record<string, unknown>;
type ToolSchema = Record<string,z.ZodTypeAny>;
const uuid = z.uuid();
const uuidArray = z.array(uuid);
const slim = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value)
  ? value as JsonObject : { result: value };

function createServer(request: Request): McpServer {
  const server = new McpServer({
    name: "diaporama-de-singe-chatgpt", version: "0.4.0",
  }, { instructions: "You are controlling ONLY the private Diaporama de singe ChatGPT project. Prefer create_presentation with multiple slides, edit_slides with multiple operations, and short outline reads. For visual work supply full freeform HTML/CSS; never assume a fixed template. Respect revision conflicts. Avoid changing the independent Codex project. Exports: PowerPoint rendering currently runs in the authenticated Web editor. Use prepare_export to guide the owner." });

  function register(name: string, title: string, description: string, schema: ToolSchema, write: boolean,
    handler: (args: any) => Promise<unknown>, destructive = false) {
    server.registerTool(name, {
      title, description, inputSchema: schema,
      annotations: { readOnlyHint: !write, destructiveHint: destructive, idempotentHint: !write, openWorldHint: false },
      _meta: { securitySchemes: [{ type: "oauth2", scopes: write ? ["presentations.read","presentations.write"] : ["presentations.read"] }] },
    }, async (args: any) => {
      if (write && !await authorizeBearer(request, "write")) return {
        content: [{ type: "text", text: "L'accès en écriture requiert une autorisation OAuth." }],
        isError: true,
        _meta: { "mcp/www_authenticate": [oauthChallenge() + ', error="insufficient_scope", error_description="Permission en écriture requise"'] },
      };
      try {
        const payload = slim(await handler(args));
        return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown_error";
        // SQL/validation errors are data, not leaked server logs.
        const code = /revision_conflict|invalid_|too_many_|duplicate_|not_found|conflict|maximum_|missing|folder/.test(message)
          ? message.slice(0,140) : "operation_failed";
        console.error("MCP tool failed:",name,message.slice(0,250));
        return { content: [{ type: "text", text: JSON.stringify({error:code,tool:name}) }], isError: true };
      }
    });
  }

  register("workspace_status","État du projet",
    "Check supported MCP features and the separate ChatGPT stack. No secrets returned.",{},false,
    async()=>({project:"Diaporama de singe ChatGPT",version:"0.4.0",storage:"Neon",transport:"Streamable HTTP",
      website:ORIGIN,mcp:RESOURCE,formats:["structured","freeform","hybrid"],
      exports:["PPTX fidèle (dans le navigateur)","PPTX éditable (dans le navigateur)","HTML/JSON via lien signé"],
      capabilities:["bulk_create","batch_edit_atomic","reorder","folders","assets","variants","animations_data"]}));

  register("list_presentations","Lister les présentations",
    "Fast paginated list; title and slide counts only. Use before requesting full HTML.",
    {search:z.string().max(100).default(""),limit:z.number().int().min(1).max(100).default(30),offset:z.number().int().min(0).default(0)},false,
    async a=>listDecks(a.search,a.limit,a.offset));

  register("get_presentation","Lire une présentation",
    "Retrieve its slides as compact outlines by default; set scope=full to retrieve HTML/CSS and all objects. Paginate long decks.",
    {id:uuid,scope:z.enum(["outline","full"]).default("outline"),offset:z.number().int().min(0).default(0),
      limit:z.number().int().min(1).max(100).default(30)},false,
    async a=>getDeck(a.id,a.scope,a.offset,a.limit));

  register("get_slide","Lire une diapositive",
    "Fetch a full slide, only its HTML/CSS, its structured elements, or a short summary to save tokens.",
    {id:uuid,scope:z.enum(["summary","full","html","elements"]).default("full")},false,
    async a=>getSlide(a.id,a.scope));

  register("create_presentation","Créer une présentation complète",
    "Create a presentation with up to 40 slides in ONE call. Slides accept freeform HTML/CSS, editable elements, animations, notes, or a full versioned document. One initial slide if omitted.",
    {title:z.string().min(1).max(180),folderId:uuid.optional(),
      slides:z.array(InitialSlideSchema).max(40).default([])},true,
    async a=>({presentation:await createDeck(a.title,a.slides,a.folderId)}));

  register("update_presentation","Modifier la présentation",
    "Rename or change format, description and folder. Unspecified fields remain unchanged.",
    {id:uuid,patch:z.object({title:z.string().min(1).max(180).optional(),description:z.string().max(2000).optional(),
      format:z.enum(["16:9","4:3","custom"]).optional(),folderId:uuid.nullable().optional()})},true,
    async a=>({presentation:await updateDeck(a.id,a.patch)}));

  register("delete_presentation","Supprimer la présentation",
    "Permanently remove a presentation and its slides, variants and assets; requires explicit confirmation.",
    {id:uuid,confirm:z.literal(true)},true,
    async a=>({deleted:await deleteDeck(a.id)}),true);

  register("add_slides","Ajouter des diapositives en lot",
    "Append 1–40 slides in ONE call. Each accepts full HTML/CSS freedom, editable objects, notes and animations.",
    {presentationId:uuid,slides:z.array(InitialSlideSchema).min(1).max(40)},true,
    async a=>addSlides(a.presentationId,a.slides));

  register("duplicate_slide","Dupliquer une diapositive",
    "Copy a slide including its document and presenter notes; append to the same deck.",
    {id:uuid},true,async a=>({slide:await duplicateSlide(a.id)}));

  register("delete_slides","Supprimer des diapositives",
    "Permanently delete 1–40 slides of a deck. Explicitly confirm.",
    {presentationId:uuid,ids:uuidArray.min(1).max(40),confirm:z.literal(true)},true,
    async a=>removeSlides(a.presentationId,a.ids),true);

  register("reorder_slides","Réordonner les diapositives",
    "Atomically reorder all slides by their IDs (complete ordered list, no omissions).",
    {presentationId:uuid,orderedIds:uuidArray.max(500)},true,
    async a=>reorderSlides(a.presentationId,a.orderedIds));

  register("edit_slides","Modifier plusieurs diapositives",
    "Most powerful tool: atomic edit of up to 40 slides. Each slide accepts up to 80 operations such as set_html, set_css, append_html/css, replace_document, set_canvas, set_mode, upsert_element, edit_element, remove_element, move_element, set_elements, set_animations, append_animation, remove_animation, set_notes. Return compact revisions. Use dryRun to validate without saving; optional revision for optimistic concurrency.",
    {presentationId:uuid,dryRun:z.boolean().default(false),
      changes:z.array(z.object({id:uuid,revision:z.number().int().min(1).optional(),
        operations:z.array(SlideOperationSchema).min(1).max(80)})).min(1).max(40)},true,
    async a=>editSlides(a.presentationId,a.changes,a.dryRun));

  register("list_folders","Lister les dossiers","List folder tree for presentation organization.",{},false,
    async()=>({folders:await listFolders()}));

  register("manage_folder","Organiser les dossiers",
    "Create, rename, or delete a folder. Deleting a folder leaves presentations intact and unfiled.",
    {action:z.enum(["create","rename","delete"]),id:uuid.optional(),
      name:z.string().max(120).optional(),parentId:uuid.optional(),
      confirm:z.boolean().optional()},true,
    async a=>{
      if(a.action==="delete"&&!a.confirm)throw new Error("confirmation_required");
      return {folder:await manageFolder(a.action,a.id,a.name,a.parentId)};
    },true);

  register("save_assets","Enregistrer plusieurs images",
    "Register up to 40 source URLs and optional attribution/rights in the presentation asset catalog. Does not download or search the internet; ChatGPT can supply URLs discovered independently.",
    {presentationId:uuid,assets:z.array(z.object({
      url:z.url(),label:z.string().max(140).optional(),source:z.string().max(140).optional(),rights:z.string().max(400).optional()
    })).min(1).max(40)},true,
    async a=>saveAssets(a.presentationId,a.assets));

  register("list_assets","Lister les images","List known image links and attribution metadata for a deck.",
    {presentationId:uuid,limit:z.number().int().min(1).max(150).default(60)},false,
    async a=>({assets:await listAssets(a.presentationId,a.limit)}));

  register("create_variants","Créer des propositions graphiques",
    "Save up to eight alternate designs for the same slide in ONE call, with different HTML/CSS, elements, animations and notes. Does not alter active slide.",
    {slideId:uuid,variants:z.array(z.object({name:z.string().max(120),slide:InitialSlideSchema})).min(1).max(8)},true,
    async a=>createVariants(a.slideId,a.variants));

  register("list_variants","Lister les variantes graphiques",
    "Return named alternative designs for a slide. full=false avoids transferring all HTML/CSS.",
    {slideId:uuid,full:z.boolean().default(false)},false,
    async a=>({variants:await listVariants(a.slideId,a.full)}));

  register("activate_variant","Choisir une variante",
    "Make a saved design the active slide. Current design is stored as a backup variant.",
    {slideId:uuid,variantId:uuid,revision:z.number().int().min(1).optional()},true,
    async a=>activateVariant(a.slideId,a.variantId,a.revision));

  register("prepare_export","Préparer l'exportation",
    "Open the private Web editor for PPTX generation (faithful or editable), or issue a short-lived signed HTML/JSON download URL. PowerPoint rendering must run in a browser and is NOT generated by this MCP call.",
    {presentationId:uuid,format:z.enum(["pptx","html","json"]).default("pptx"),
      mode:z.enum(["faithful","editable"]).default("faithful")},false,
    async a=>{
      const deck=await getDeck(a.presentationId,"outline",0,1);
      const {sign}=await import("../../src/mcp/security");
      const editor=ORIGIN+"/?deck="+encodeURIComponent(a.presentationId)+"&export="+a.mode;
      if(a.format==="pptx") return {format:"pptx",mode:a.mode,presentation:deck.presentation,
        editorUrl:editor,action:"Open the private editor, choose the export mode and click Télécharger PPTX. No server-side PPTX job has run."};
      const expires=Date.now()+10*60*1000;
      const payload=[a.presentationId,a.format,expires].join(":");
      const ticket=Buffer.from(payload).toString("base64url")+"."+sign(payload);
      return {format:a.format,downloadUrl:ORIGIN+"/exports/"+a.format+"?ticket="+encodeURIComponent(ticket),
        expiresAt:new Date(expires).toISOString(),privateLink:true};
    });
  return server;
}
export default async function handler(request: Request): Promise<Response> {
  if(request.method==="GET")return new Response("MCP Streamable HTTP accepts POST. Use OAuth to connect from ChatGPT.",
    {status:405,headers:{Allow:"POST", "Cache-Control":"no-store"}});
  if(request.method!=="POST")return new Response(null,{status:405,headers:{Allow:"POST"}});
  const length=Number(request.headers.get("content-length")??"0");
  if(length>2_500_000)return Response.json({error:"payload_too_large"},{status:413});
  try {
    if(!await authorizeBearer(request,"read"))return oauthError();
    const server=createServer(request);
    const transport=new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator:undefined,
      enableJsonResponse:true,
    });
    await server.connect(transport);
    const response=await transport.handleRequest(request);
    response.headers.set("Cache-Control","no-store");
    response.headers.set("X-Content-Type-Options","nosniff");
    return response;
  }catch(e){
    console.error("MCP transport failure",e instanceof Error?e.message:String(e));
    return Response.json({error:"mcp_unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});
  }
}
export const config={path:"/mcp",rateLimit:{windowSize:60,windowLimit:120,aggregateBy:"ip" as const}};
