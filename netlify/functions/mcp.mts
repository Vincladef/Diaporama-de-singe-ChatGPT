import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { DiagramSchema, composeDiagram, type Diagram } from "../../src/graphics/diagrams";
import { compareOneVariant } from "../../src/variants/compare";
import { fingerprint } from "../../src/mcp/fingerprint";
import { listSlideHistory } from "../../src/mcp/history";
import { getCreationInstructions, saveCreationInstructions } from "../../src/mcp/instructions";
import { curateCandidates } from "../../src/images/curate";
import { editImageStyles } from "../../src/images/edit";
import { trackUnsplashDownload } from "../../src/images/track";
import { searchImages, getSourceStatuses, ImageSourceSchema } from "../../src/images/search";
import { proposeGraphicVariants } from "../../src/variants/propose";
import { authorizeBearer, oauthChallenge, oauthError, ORIGIN, RESOURCE } from "../../src/mcp/security";
import { InitialSlideSchema, SlideOperationSchema, type SlideOperation } from "../../src/mcp/documents";
import { AnimationStepSchema, type AnimationStep, type SlideDocument, type SlideElement } from "../../src/domain/slide";
import { buildPlaybackPlan,timelineTarget } from "../../src/animation/timeline";
import { auditDeck } from "../../src/quality/audit";
import { inspectExport } from "../../src/export/preflight";
import { composeDocument, CompositionSchema, reviewDocument, repairDocument, type Composition } from "../../src/mcp/visual";
import {
  activateVariant, addSlides, createDeck, createVariants, deleteDeck, duplicateSlide, editSlides, getDeck, getSlide,
  listAssets, listDecks, listFolders, listVariants, manageFolder, removeSlides, reorderSlides,
  saveAssets, saveAssetsIfMissing, getVariant, reviseVariant, updateDeck, type DbSlide
} from "../../src/mcp/store";

type JsonObject = Record<string, unknown>;
type ToolSchema = Record<string,z.ZodTypeAny>;
const uuid = z.uuid();
const uuidArray = z.array(uuid);

const ImagePlacementSchema=z.object({
  slideId:uuid,revision:z.number().int().min(1),
  elementId:z.string().min(1).max(128).optional(),
  url:z.url().refine(u=>u.startsWith("https://")).optional(),
  frame:z.object({
    x:z.number().min(-20000).max(20000).optional(),
    y:z.number().min(-20000).max(20000).optional(),
    width:z.number().min(10).max(20000).optional(),
    height:z.number().min(10).max(20000).optional(),
    opacity:z.number().min(0).max(1).optional(),
  }).strict().optional(),
  adjustments:z.object({
    brightness:z.number().min(0).max(300).optional(),contrast:z.number().min(0).max(300).optional(),
    saturate:z.number().min(0).max(300).optional(),grayscale:z.number().min(0).max(100).optional(),
    blur:z.number().min(0).max(40).optional(),cropX:z.number().min(0).max(100).optional(),
    cropY:z.number().min(0).max(100).optional(),rotation:z.number().min(-180).max(180).optional(),
    fit:z.enum(["cover","contain","fill"]).optional(),
  }).strict().optional(),
  credit:z.object({
    label:z.string().max(140).optional(),source:z.string().max(140).optional(),
    rights:z.string().max(400).optional(),downloadLocation:z.url().optional(),
  }).strict().optional(),
}).strict();
type ImagePlacement=z.infer<typeof ImagePlacementSchema>;

const slim = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value)
  ? value as JsonObject : { result: value };

function createServer(request: Request): McpServer {
  const server = new McpServer({
    name: "diaporama-de-singe-chatgpt", version: "0.12.0",
  }, { instructions: "You are controlling ONLY the private Diaporama de singe ChatGPT project. Prefer create_presentation with multiple slides, edit_slides with multiple operations, and short outline reads. For visual work supply full freeform HTML/CSS; never assume a fixed template. Respect revision conflicts. Avoid changing the independent Codex project. For complete AI workflows, prefer compose_slides (graphic scenes), review_slides (diagnostics plus signed browser previews), repair_slides (safe bulk corrections), then review again. For creative work choose compose_diagrams, generate_variants, compare_variants, revise_variant and curate_images. For selected images, apply_images edits them with tracked credits. Templates are optional: preserve full HTML/CSS freedom. Use list_slide_history and restore_slide_revision for persistent recovery of saved edits; restoration requires a known revision. Before creating or improving ANY presentation, call get_creation_instructions, using presentationId for edits, and honor the stored global and presentation-specific rules (specific rules take priority if they conflict). Do not assume the instructions are empty. If toolCount exceeds the client-visible tool count, tell the user to refresh the plugin tools. Exports: PowerPoint rendering currently runs in the authenticated Web editor. Use prepare_export to guide the owner." });

  const publishedToolNames: string[] = [];
  function register(name: string, title: string, description: string, schema: ToolSchema, write: boolean,
    handler: (args: any) => Promise<unknown>, destructive = false) {
    publishedToolNames.push(name);
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
    async()=>({project:"Diaporama de singe ChatGPT",version:"0.12.0",storage:"Neon",transport:"Streamable HTTP",
      toolCount:publishedToolNames.length,toolNames:publishedToolNames,toolCatalogVersion:"0.12.0",
      website:ORIGIN,mcp:RESOURCE,formats:["structured","freeform","hybrid"],
      exports:["PPTX fidèle (dans le navigateur)","PPTX éditable (dans le navigateur)","HTML/JSON via lien signé"],
      capabilities:["bulk_create","batch_edit_atomic","reorder","folders","assets","variants","animations_data","click_reveals","projection_mode","import_pptx","deck_quality_audit","visual_copy","restyling_brief","signed_previews","visual_layout_review","bulk_auto_repair","high_level_compositions","tool_catalog_inventory","diagram_and_mindmap_generator","six_art_directions","variant_comparison_and_revision","image_multisearch_curation","batch_photo_treatments","persistent_slide_history","restorable_versions","export_preflight","persistent_creation_instructions"]}));

  register("get_creation_instructions","Lire les instructions de création",
    "MANDATORY before creating, improving or restyling slides: read the persistent artistic and animation instructions. Pass presentationId when working on an existing presentation. Presentation-specific instructions take precedence over global rules in case of conflict.",
    {presentationId:uuid.optional()},false,
    async a=>getCreationInstructions(a.presentationId));

  register("update_creation_instructions","Enregistrer les instructions de création",
    "Update persistent creation instructions (global or for one presentation). An empty presentation-specific value clears its override, restoring global rules. The instructions are shared with the Web editor.",
    {scope:z.enum(["global","presentation"]),instructions:z.string().max(12000),
      presentationId:uuid.optional()},true,
    async a=>saveCreationInstructions(a.scope,a.instructions,a.presentationId));

  register("list_presentations","Lister les présentations",
    "Fast paginated list; title and slide counts only. Use before requesting full HTML.",
    {search:z.string().max(100).default(""),limit:z.number().int().min(1).max(100).default(30),offset:z.number().int().min(0).default(0)},false,
    async a=>listDecks(a.search,a.limit,a.offset));

  register("get_presentation","Lire une présentation",
    "Retrieve its slides as compact outlines by default; set scope=full to retrieve HTML/CSS and all objects. Paginate long decks.",
    {id:uuid,scope:z.enum(["outline","full"]).default("outline"),offset:z.number().int().min(0).default(0),
      limit:z.number().int().min(1).max(100).default(30)},false,
    async a=>getDeck(a.id,a.scope,a.offset,a.limit));

  register("audit_presentation","Vérifier une présentation avant projection ou export",
    "Check in one compact call all slides for missing images, broken animation references, invisible objects, oversized data, mixed aspect ratios and PPTX rasterization caveats. Shared with the manual editor's 'Vérifier' panel. Does not modify content.",
    {presentationId:uuid,maxFindings:z.number().int().min(1).max(200).default(60)},false,
    async a=>{
      const deck=await getDeck(a.presentationId,"full",0,100);
      const full=deck.slides.filter((s):s is DbSlide=>"document" in s);
      const result=auditDeck(full);
      return {presentationId:a.presentationId,slideCount:result.slideCount,
        readyToProject:result.readyToProject,
        errors:result.errorCount,warnings:result.warningCount,infos:result.infoCount,
        findings:result.findings.slice(0,a.maxFindings),
        omitted:Math.max(0,result.findings.length-a.maxFindings),
        ...(deck.nextOffset===null?{}:{partial:true,note:"Audit is limited to 100 slides per request."})};
    });

  register("get_improvement_brief","Préparer l'amélioration d'une présentation",
    "Read get_creation_instructions with presentationId first. Summarize the COMPLETE slide deck for AI restyling in a single token-efficient call. Preserves important text, notes, source image origins and revision numbers without sending full HTML/CSS or embedded base64. Use before edit_slides and create_variants.",
    {presentationId:uuid,maxCharsPerSlide:z.number().int().min(200).max(3000).default(900),
      includeNotes:z.boolean().default(true)},false,
    async a=>{
      const deck=await getDeck(a.presentationId,"full",0,100);
      if(deck.nextOffset!==null)throw new Error("brief_limit_100_slides");
      const slides=deck.slides.filter((s):s is DbSlide=>"document" in s).map(s=>{
        const html=s.document.freeform?.html??"";
        const htmlText=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
          .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
          .replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
        const text=s.document.elements.filter(e=>e.type==="text").map(e=>e.text??"").join("\n").trim();
        const images=s.document.elements.filter(e=>e.type==="image");
        const domains=images.map(e=>{
          try{return new URL(e.src??"").protocol==="data:"?"embedded":new URL(e.src??"").hostname;}
          catch{return "unknown";}
        });
        return {id:s.id,revision:s.revision,position:s.position,
          mode:s.document.mode,canvas:s.document.canvas,
          text:(text+(htmlText?"\n"+htmlText:"")).slice(0,a.maxCharsPerSlide),
          notes:a.includeNotes?s.notes.slice(0,700):undefined,
          images:images.length,imageOrigins:[...new Set(domains)].slice(0,10),
          editableElements:s.document.elements.length,
          animations:s.document.animations.length};
      });
      return {presentation:{id:deck.presentation.id,title:deck.presentation.title},
        slides,totalSlides:slides.length,
        instruction:"Keep all intellectual content, numeric data, citations and notes unchanged; improve visual expression using HTML/CSS or structured layers, then apply with edit_slides and revision checks."};
    });

  register("make_visual_copy","Créer une copie graphique de toute la présentation",
    "Create a NEW presentation from an existing deck using one of three deterministic graphic directions, preserving text, image URLs, HTML and notes. Source is never overwritten. For genuinely original AI design, use get_improvement_brief then edit_slides or create_variants.",
    {presentationId:uuid,direction:z.enum(["immersive","editorial","typographic"]).default("editorial"),
      title:z.string().min(1).max(180).optional()},true,
    async a=>{
      const source=await getDeck(a.presentationId,"full",0,100);
      if(source.nextOffset!==null||source.slides.length>40)throw new Error("visual_copy_limit_40_slides");
      const map={immersive:0,editorial:1,typographic:2} as const;
      const styles=source.slides.filter((s):s is DbSlide=>"document" in s).map(s=>({
        document:proposeGraphicVariants(s.document)[map[a.direction as keyof typeof map]]!.document,
        notes:s.notes,
      }));
      const created=await createDeck(a.title??(source.presentation.title+" · "+a.direction).slice(0,180),
        styles);
      return {sourceId:a.presentationId,createdId:created.id,
        slides:created.slides,direction:a.direction,originalPreserved:true};
    });

  register("get_slide","Lire une diapositive",
    "Fetch a full slide, only its HTML/CSS, its structured elements, or a short summary to save tokens.",
    {id:uuid,scope:z.enum(["summary","full","html","elements"]).default("full")},false,
    async a=>getSlide(a.id,a.scope));

  register("create_presentation","Créer une présentation complète",
    "Read get_creation_instructions first to apply the saved user preferences. Create up to 40 slides in ONE call. IMPORTANT: prefer structured or hybrid slide elements for editable PowerPoint/Google Slides output (native text, images, shapes, SVG). Arbitrary freeform HTML is visually flexible; HTML text can be made editable, but CSS décor and photographs embedded in HTML may remain rasterized. Animations export as successive editable reveal views, not native effects. One initial slide if omitted.",
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
    "Append 1–40 slides in ONE call. Prefer native structured elements for editable exports; freeform HTML/CSS still works but complex graphics may rasterize. Supports notes and animations.",
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


  register("review_slides","Prévisualiser et analyser visuellement plusieurs diapositives",
    "ONE call reviews up to 40 consecutive slides with layout warnings, textual fit checks, overlap detection, source quality checks, and optional short-lived browser preview links. Open a signed preview in a browser/screenshot-capable client for real pixel inspection; diagnostics alone are heuristic.",
    {presentationId:uuid,offset:z.number().int().min(0).default(0),limit:z.number().int().min(1).max(40).default(40),
      maxFindingsPerSlide:z.number().int().min(1).max(40).default(12),includePreviews:z.boolean().default(true)},false,
    async a=>{
      const deck=await getDeck(a.presentationId,"full",a.offset,a.limit);
      const expires=Date.now()+10*60*1000;
      const {sign}=await import("../../src/mcp/security");
      const slides=deck.slides.filter((s):s is DbSlide=>"document" in s).map(s=>{
        const review=reviewDocument(s.document,s.position);
        const payload=s.id+":preview:"+expires;
        const ticket=Buffer.from(payload).toString("base64url")+"."+sign(payload);
        return {id:s.id,position:s.position,revision:s.revision,metrics:review.metrics,
          findings:review.issues.slice(0,a.maxFindingsPerSlide),
          omitted:Math.max(0,review.issues.length-a.maxFindingsPerSlide),
          ...(a.includePreviews?{previewUrl:ORIGIN+"/previews/slide?ticket="+encodeURIComponent(ticket)}:{})};
      });
      return {presentationId:a.presentationId,slideCount:slides.length,slides,
        nextOffset:deck.nextOffset,previewExpiresAt:a.includePreviews?new Date(expires).toISOString():undefined,
        methodology:"Static geometry is approximate. Signed previews enable browser-based image inspection; links expire after 10 minutes and should not be shared publicly."};
    });

  register("repair_slides","Corriger automatiquement la mise en page de plusieurs diapositives",
    "Conservatively repair up to 40 structured or hybrid slides in ONE atomic batch: place out-of-bounds objects back on canvas, constrain dimensions, set image object-fit, and optionally raise tiny text to 24px. HTML/CSS freeform and intentional full-bleed backgrounds are preserved. dryRun defaults to true; supply observed revisions to prevent accidental overwrite. No automatic pixel-based judgment.",
    {presentationId:uuid,targets:z.array(z.object({slideId:uuid,revision:z.number().int().min(1)})).min(1).max(40),
      mode:z.enum(["safe","readability"]).default("safe"),dryRun:z.boolean().default(true)},true,
    async a=>{
      if(new Set(a.targets.map((t:{slideId:string})=>t.slideId)).size!==a.targets.length)
        throw new Error("duplicate_slide_id");
      const data=await Promise.all(a.targets.map(async(t:{slideId:string;revision:number})=>{
        const current=await getSlide(t.slideId,"full");
        if(!("document" in current))throw new Error("slide_not_found");
        if(current.presentation_id!==a.presentationId)throw new Error("invalid_presentation_scope");
        if(current.revision!==t.revision)throw new Error("revision_conflict:"+t.slideId);
        const before=reviewDocument(current.document,current.position);
        const repaired=repairDocument(current.document,a.mode);
        const after=reviewDocument(repaired.document,current.position);
        return {id:t.slideId,revision:t.revision,before:before.issues.length,after:after.issues.length,
          actions:repaired.changes,document:repaired.document};
      }));
      const changed=data.filter(d=>d.actions.length);
      if(!a.dryRun&&changed.length){
        await editSlides(a.presentationId,changed.map(d=>({id:d.id,revision:d.revision,
          operations:[{op:"replace_document" as const,document:d.document}]})),false);
      }
      return {presentationId:a.presentationId,dryRun:a.dryRun,changedSlides:changed.length,
        saved:!a.dryRun&&changed.length>0,
        slides:data.map(d=>({id:d.id,revision:d.revision+(a.dryRun||!d.actions.length?0:1),
          proposedActions:d.actions,findingsBefore:d.before,findingsAfter:d.after}))};
    });

  register("compose_slides","Créer des compositions graphiques en une opération",
    "ONE call composes up to 40 slides with structured editable text, images and shapes from semantic content using hero, section, split, quote, cards, comparison or timeline scenes. No CSS or coordinates required, with optional full-width imagery. action=append creates slides; action=replace requires exact observed revisions and confirmReplace=true because it replaces existing visual content. Existing notes are kept unless new notes are provided. Supports dryRun.",
    {presentationId:uuid,action:z.enum(["append","replace"]).default("append"),
      slides:z.array(z.object({slideId:uuid.optional(),revision:z.number().int().min(1).optional(),
        composition:CompositionSchema})).min(1).max(40),
      confirmReplace:z.boolean().default(false),dryRun:z.boolean().default(false)},true,
    async a=>{
      const prepared:{slideId?:string;revision?:number;composition:Composition;document:SlideDocument}[]=a.slides.map((s:{slideId?:string;revision?:number;composition:Composition})=>({
        ...s,document:composeDocument(s.composition)
      }));
      if(a.action==="append"){
        if(prepared.some(s=>s.slideId||s.revision))throw new Error("invalid_append_targets");
        if(a.dryRun){
          await getDeck(a.presentationId,"outline",0,1);
          return {dryRun:true,action:"append",count:prepared.length,
            previews:prepared.map(s=>({layout:s.composition.layout,elements:s.document.elements.length,
              issues:reviewDocument(s.document).issues.length}))};
        }
        const outcome=await addSlides(a.presentationId,prepared.map(s=>({
          document:s.document,notes:s.composition.notes??""
        })));
        return {action:"append",created:outcome.created,slides:outcome.slides,
          layouts:prepared.map(s=>s.composition.layout)};
      }
      if(!a.confirmReplace)throw new Error("invalid_replace_requires_confirmation");
      if(prepared.some(s=>!s.slideId||!s.revision))throw new Error("invalid_replace_requires_ids_and_revisions");
      const changes=prepared.map(s=>({
        id:s.slideId!,revision:s.revision!,
        operations:([{op:"replace_document" as const,document:s.document},
          ...(s.composition.notes!==undefined?[{op:"set_notes" as const,notes:s.composition.notes}]:[])]),
      }));
      const result=await editSlides(a.presentationId,changes,a.dryRun);
      return {action:"replace",dryRun:a.dryRun,
        slides:result.slides??result.changes,
        layouts:prepared.map(s=>s.composition.layout)};
    });


  register("compose_diagrams","Créer des diagrammes et cartes mentales",
    "Create or replace up to 20 visual teaching diagrams with editable native text/cards and separate SVG connector imagery. Supported: mind maps, processes, cycles, hierarchical trees, causal chains, and matrices. AI supplies semantic nodes and relationships; editable text cards and vector connectors are generated automatically. Existing HTML/CSS freedom remains available in edit_slides. For replacement use exact slide revisions and confirmReplace=true.",
    {presentationId:uuid,action:z.enum(["append","replace"]).default("append"),
      slides:z.array(z.object({slideId:uuid.optional(),revision:z.number().int().min(1).optional(),
        diagram:DiagramSchema})).min(1).max(20),
      confirmReplace:z.boolean().default(false),dryRun:z.boolean().default(false)},true,
    async a=>{
      const specs=(a.slides as Array<{slideId?:string;revision?:number;diagram:Diagram}>)
        .map(s=>({...s,document:composeDiagram(s.diagram)}));
      if(a.action==="append"){
        if(specs.some(s=>s.slideId||s.revision))throw new Error("invalid_append_targets");
        if(a.dryRun){
          await getDeck(a.presentationId,"outline",0,1);
          return {dryRun:true,action:"append",previews:specs.map(s=>({
            kind:s.diagram.kind,nodes:s.diagram.nodes.length,
            relationships:s.diagram.edges.length,
            elements:s.document.elements.length}))};
        }
        const outcome=await addSlides(a.presentationId,specs.map(s=>({
          document:s.document,notes:s.diagram.notes??""
        })));
        return {action:"append",created:outcome.created,slides:outcome.slides,
          kinds:specs.map(s=>s.diagram.kind)};
      }
      if(!a.confirmReplace)throw new Error("invalid_replace_requires_confirmation");
      if(specs.some(s=>!s.slideId||!s.revision))throw new Error("invalid_replace_requires_ids_and_revisions");
      const outcome=await editSlides(a.presentationId,specs.map(s=>({
        id:s.slideId!,revision:s.revision!,operations:[
          {op:"replace_document" as const,document:s.document},
          ...(s.diagram.notes!==undefined?[{op:"set_notes" as const,notes:s.diagram.notes}]:[])
        ]
      })),a.dryRun);
      return {action:"replace",dryRun:a.dryRun,slides:outcome.slides??outcome.changes,
        kinds:specs.map(s=>s.diagram.kind)};
    });


  register("list_slide_history","Lister les versions conservées d'une diapositive",
    "Retrieve up to 60 persisted pre-edit snapshots from both MCP and editor, without unrelated artistic variants. Returns short source labels, timestamps and optional full slide documents. Use before restoring a previous revision.",
    {slideId:uuid,limit:z.number().int().min(1).max(60).default(20),
      includeDocuments:z.boolean().default(false)},false,
    async a=>listSlideHistory(a.slideId,a.limit,a.includeDocuments));

  register("restore_slide_revision","Restaurer un ancien état enregistré",
    "Restore exactly one previously saved slide snapshot, preserving the version currently active as a new undo checkpoint. Requires an observed current slide revision, so newer edits cannot be overwritten by stale requests.",
    {slideId:uuid,checkpointId:uuid,revision:z.number().int().min(1)},true,
    async a=>{
      const history=await listSlideHistory(a.slideId,60,false);
      if(!history.items.some(row=>row.id===a.checkpointId))throw new Error("history_not_found");
      return activateVariant(a.slideId,a.checkpointId,a.revision);
    });
  register("get_animation_plan","Lire la chronologie des animations",
    "Compact click-by-click sequence of a slide, grouping automatic after-previous cues. No HTML/CSS payload. Use this to understand the projected teaching order with minimal tokens.",
    {slideId:uuid},false,
    async a=>{
      const slide=await getSlide(a.slideId,"full");
      if(!("document" in slide))throw new Error("slide_not_found");
      const plan=buildPlaybackPlan(slide.document.animations);
      const format=(c:typeof plan.all[number])=>({
        id:c.id,target:timelineTarget(c,slide.document),effect:c.effect,trigger:c.trigger,
        durationMs:c.durationMs,delayMs:c.delayMs??0
      });
      return {slideId:a.slideId,revision:slide.revision,clicks:plan.clicks.length,
        introduction:plan.intro.map(format),steps:plan.clicks.map((group,i)=>({click:i+1,cues:group.map(format)}))};
    });

  register("add_reveal_sequence","Créer une séquence d'apparitions en un appel",
    "High-level shortcut for teaching presentations: list editable element IDs or freeform CSS selectors prefixed with css:; choose one reveal per click, all in one click (sequential), or an automatic intro. Preserves existing cues unless replace=true. An entire pedagogical sequence is saved in ONE MCP request.",
    {presentationId:uuid,slideId:uuid,targets:z.array(z.string().min(1).max(240)).min(1).max(60),
      mode:z.enum(["each","together","automatic"]).default("each"),
      effect:z.enum(["appear","fade","move","scale","wipe","highlight","dim","hide"]).default("fade"),
      durationMs:z.number().int().min(0).max(60000).default(420),
      staggerMs:z.number().int().min(0).max(30000).default(80),
      replace:z.boolean().default(false),dryRun:z.boolean().default(false),
      revision:z.number().int().min(1).optional()},true,
    async a=>{
      const slide=await getSlide(a.slideId,"full");
      if(!("document" in slide))throw new Error("slide_not_found");
      if(slide.presentation_id!==a.presentationId)throw new Error("foreign_presentation");
      const base=a.replace?0:Math.max(-1,...slide.document.animations.map(c=>c.order))+1;
      const cues:AnimationStep[]=(a.targets as string[]).map((target:string,index:number)=>{
        const free=target.startsWith("css:");
        const selector=free?target.slice(4).trim():"";
        if(free&&(!selector||/[<>]/.test(selector)))throw new Error("invalid_css_selector");
        if(!free&&!slide.document.elements.some(e=>e.id===target))throw new Error("target_element_not_found:"+target);
        const trigger=a.mode==="automatic"?"after-previous":
          a.mode==="together"&&index>0?"after-previous":"click";
        return AnimationStepSchema.parse({
          id:randomUUID(),...(free?{targetSelector:selector}:{targetElementId:target}),
          order:base+index,trigger,effect:a.effect,durationMs:a.durationMs,
          delayMs:trigger==="after-previous"&&index>0?a.staggerMs:0,easing:"ease-out"
        });
      });
      const operations:SlideOperation[]=a.replace?
        [{op:"set_animations",animations:cues}]:
        cues.map(animation=>({op:"append_animation",animation}));
      const outcome=await editSlides(a.presentationId,[{id:a.slideId,revision:a.revision,operations}],a.dryRun);
      return {slideId:a.slideId,created:cues.length,mode:a.mode,
        newRevision:outcome.slides?.[0]?.revision??null,dryRun:a.dryRun,
        ...("updated" in outcome?{updated:outcome.updated}:{})};
    });

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

  register("search_images","Rechercher des images",
    "Search multiple photo libraries in ONE call. Openverse and Wikimedia work without keys; Pexels and Unsplash are enabled when API keys exist. Google Images returns an external search URL (Google's legacy image API is closed to new customers). 20 candidates per source by default; compact output saves tokens.",
    {query:z.string().min(2).max(160),sources:z.array(ImageSourceSchema).min(1).max(5).default(["openverse","wikimedia"]),
      page:z.number().int().min(1).max(15).default(1),perSource:z.number().int().min(1).max(30).default(20),
      orientation:z.enum(["any","landscape","portrait","square"]).default("any"),
      compact:z.boolean().default(true)},false,
    async a=>{
      const found=await searchImages(a);
      return {...found,images:a.compact?found.images.map(i=>({
        id:i.id,source:i.provider,url:i.imageUrl,preview:i.previewUrl,
        title:i.title,credit:i.attribution,license:i.license,sourcePage:i.pageUrl
      })):found.images};
    });

  register("image_sources","Sources d'images disponibles",
    "List usable providers, missing API keys without revealing secrets, and the external Google Images option.",{},false,
    async()=>({sources:getSourceStatuses()}));


  register("curate_images","Rechercher et sélectionner des photographies multisources",
    "Search up to four queries in parallel across Openverse, Wikimedia, Pexels, Unsplash and Google Images (SerpApi when configured). Return a compact deduplicated shortlist ranked by topic, dimensions, orientation and provider diversity, with license and source links. Ranking does not imply copyright clearance.",
    {queries:z.array(z.string().trim().min(2).max(160)).min(1).max(4),
      sources:z.array(ImageSourceSchema).min(1).max(5).default(["openverse","wikimedia"]),
      orientation:z.enum(["any","landscape","portrait","square"]).default("landscape"),
      perSource:z.number().int().min(2).max(15).default(8),
      limit:z.number().int().min(2).max(30).default(16),
      minWidth:z.number().int().min(0).max(10000).default(1200),
      minHeight:z.number().int().min(0).max(10000).default(650)},false,
    async a=>{
      const queries=[...new Set(a.queries as string[])];
      const results=await Promise.all(queries.map(query=>searchImages({
        query,sources:a.sources,page:1,perSource:a.perSource,orientation:a.orientation
      })));
      const best=curateCandidates(results.map((r,i)=>({query:queries[i]!,images:r.images})),{
        orientation:a.orientation,preferLarge:true,minWidth:a.minWidth,minHeight:a.minHeight
      },a.limit);
      return {queries,sources:getSourceStatuses(),shortlist:best.map(image=>({
        id:image.id,provider:image.provider,query:image.matchedQuery,
        url:image.imageUrl,preview:image.previewUrl,title:image.title,
        credit:image.attribution,license:image.license,sourcePage:image.pageUrl,
        dimensions:{width:image.width,height:image.height},relevanceScore:Number(image.score.toFixed(2)),
        ...(image.downloadLocation?{downloadLocation:image.downloadLocation}:{})
      })),providerResults:results.map(r=>({query:r.query,providers:r.providers,
        googleSearchUrl:r.googleSearchUrl})),
        note:"Confirm usage rights on the source page. Keys for Pexels, Unsplash or SerpApi must be configured on Netlify for integrated search."};
    });

  register("apply_images","Sélectionner, enregistrer et retoucher des images en lot",
    "Insert, replace or transform up to 40 photos across 40 slides atomically using checked revisions. Crop, filters, rotation, opacity and framing remain editable structured properties; preserve unrelated image styles. Record source metadata without duplicating known asset URLs. No image download. If present, Unsplash tracking attempted after save.",
    {presentationId:uuid,images:z.array(ImagePlacementSchema).min(1).max(40),
      dryRun:z.boolean().default(false)},true,
    async a=>{
      const photos=a.images as ImagePlacement[];
      const slideIds=[...new Set(photos.map(p=>p.slideId))];
      if(slideIds.length>40)throw new Error("too_many_slides");
      const group=await Promise.all(slideIds.map(async slideId=>{
        const items=photos.filter(p=>p.slideId===slideId);
        if(new Set(items.map(p=>p.revision)).size>1)throw new Error("revision_conflict:"+slideId);
        const current=await getSlide(slideId,"full");
        if(!("document" in current))throw new Error("slide_not_found");
        if(current.presentation_id!==a.presentationId)throw new Error("invalid_presentation_scope");
        if(current.revision!==items[0]!.revision)throw new Error("revision_conflict:"+slideId);
        const ids=new Set<string>();
        const ops:SlideOperation[]=[];
        const saved:{id:string;url:string}[]=[];
        for(const photo of items){
          const id=photo.elementId??randomUUID();
          if(ids.has(id))throw new Error("duplicate_image_target");ids.add(id);
          const original=current.document.elements.find(e=>e.id===id);
          if(original&&original.type!=="image")throw new Error("invalid_image_target");
          const src=photo.url??original?.src;
          if(!src||!src.startsWith("https://"))throw new Error("invalid_image_source");
          const frame=photo.frame;
          const styles:SlideElement["styles"]={left:"150px",top:"150px",width:"1200px",height:"675px",
            objectFit:"cover",objectPosition:"50% 50%",...(original?.styles??{})};
          if(frame){
            if(frame.x!==undefined)styles.left=frame.x+"px";
            if(frame.y!==undefined)styles.top=frame.y+"px";
            if(frame.width!==undefined)styles.width=frame.width+"px";
            if(frame.height!==undefined)styles.height=frame.height+"px";
            if(frame.opacity!==undefined)styles.opacity=frame.opacity;
          }
          const element=editImageStyles({id,type:"image",src,styles},photo.adjustments??{});
          ops.push({op:"upsert_element",element});
          saved.push({id,url:src});
        }
        return {id:slideId,revision:items[0]!.revision,operations:ops,images:saved};
      }));
      const outcome=await editSlides(a.presentationId,group.map(({id,revision,operations})=>({
        id,revision,operations
      })),a.dryRun);
      if(a.dryRun)return {dryRun:true,slides:group.map(g=>({id:g.id,images:g.images}))};
      const credits=photos.filter(p=>p.url).map(p=>({
        url:p.url!,label:p.credit?.label??"",
        source:p.credit?.source??"Source non renseignée",
        rights:p.credit?.rights??"Droits non vérifiés"
      }));
      let assets:{added:number;existing:number}|undefined,metadataWarning:string|undefined;
      try{assets=await saveAssetsIfMissing(a.presentationId,credits);}
      catch{metadataWarning="Image changes saved, but asset credits could not be indexed.";}
      const tracking=await Promise.all(photos.filter(p=>p.credit?.downloadLocation)
        .map(async p=>({slideId:p.slideId,...await trackUnsplashDownload(p.credit!.downloadLocation!)})));
      return {dryRun:false,updated:outcome.updated,slides:outcome.slides,
        assets,tracking,...(metadataWarning?{warning:metadataWarning}:{}),
        rightsNotice:"Image usage permissions must still be verified on each publisher's source page."};
    });

  register("generate_variants","Proposer jusqu’à six variantes graphiques",
    "Generate and SAVE 3 to 6 optional directions: immersive, editorial, manifesto, scientific atlas, archive paper and cinematic. Preserves source text, notes and image links; current slide stays unchanged. For original HTML/CSS art, use create_variants.",
    {slideId:uuid,count:z.number().int().min(3).max(6).default(6)},true,
    async a=>{
      const slide=await getSlide(a.slideId,"full");
      if(!("document" in slide))throw new Error("slide_not_found");
      const proposed=proposeGraphicVariants(slide.document,a.count as 3|4|5|6);
      return {slideId:a.slideId,...await createVariants(a.slideId,
        proposed.map(v=>({name:v.name,slide:{document:v.document,notes:slide.notes}})))};
    });

  register("place_image","Placer ou remplacer une image",
    "One-call shortcut to insert a freely positioned, editable photo, or replace an existing image layer. Optionally track its source, attribution and rights. Supports crop, object fit and optional image filters.",
    {presentationId:uuid,slideId:uuid,elementId:z.string().min(1).max(128).optional(),
      url:z.url().refine(u=>u.startsWith("https:"),"An HTTPS URL is required"),
      x:z.number().min(-20000).max(20000).optional(),y:z.number().min(-20000).max(20000).optional(),
      width:z.number().min(10).max(20000).optional(),height:z.number().min(10).max(20000).optional(),
      fit:z.enum(["cover","contain","fill"]).optional(),
      filter:z.string().max(300).optional(),revision:z.number().int().min(1).optional(),
      label:z.string().max(140).optional(),source:z.string().max(140).optional(),rights:z.string().max(400).optional()},true,
    async a=>{
      const previous=await getSlide(a.slideId,"full");
      if(!("document" in previous))throw new Error("slide_not_found");
      if(previous.presentation_id!==a.presentationId)throw new Error("foreign_presentation");
      const id=a.elementId??randomUUID();
      const exists=previous.document.elements.find(e=>e.id===id);
      if(exists&&exists.type!=="image")throw new Error("element_is_not_an_image");
      const styles={...(exists?.styles??{}),
        left:a.x!==undefined?a.x+"px":String(exists?.styles.left??"0px"),
        top:a.y!==undefined?a.y+"px":String(exists?.styles.top??"0px"),
        width:a.width!==undefined?a.width+"px":String(exists?.styles.width??"960px"),
        height:a.height!==undefined?a.height+"px":String(exists?.styles.height??"540px"),
        objectFit:a.fit??exists?.styles.objectFit??"cover",...(a.filter?{filter:a.filter}:{})};
      const edited=await editSlides(a.presentationId,[{id:a.slideId,revision:a.revision,
        operations:[{op:"upsert_element",element:{id,type:"image",src:a.url,styles}}]}]);
      let assetNote:string|undefined;
      try{
        await saveAssets(a.presentationId,[{url:a.url,label:a.label,source:a.source,rights:a.rights}]);
      }catch{assetNote="Image placed but source metadata could not be saved.";}
      return {slideId:a.slideId,elementId:id,updated:edited.updated,newRevision:edited.slides?.[0]?.revision,
        ...(assetNote?{warning:assetNote}:{})};
    });

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


  register("compare_variants","Comparer les variantes et leurs aperçus graphiques",
    "Compare active slide with up to eight saved variations in one compact call: text/image/notes preservation, distinct fonts and palettes, heuristic layout warnings and 10-minute signed preview URLs for side-by-side visual inspection. These indicators are not a subjective quality score. Returns a hash usable with revise_variant.",
    {slideId:uuid,limit:z.number().int().min(1).max(8).default(8),
      includePreviews:z.boolean().default(true)},false,
    async a=>{
      const current=await getSlide(a.slideId,"full");
      if(!("document" in current))throw new Error("slide_not_found");
      const stored=(await listVariants(a.slideId,true)).slice(0,a.limit) as Array<{
        id:string;name:string;notes:string;document:SlideDocument;created_at:string
      }>;
      const baseline={name:"Version actuelle",document:current.document,notes:current.notes};
      const {sign}=await import("../../src/mcp/security");
      const expires=Date.now()+10*60*1000;
      const token=(payload:string)=>ORIGIN+"/previews/slide?ticket="+encodeURIComponent(
        Buffer.from(payload).toString("base64url")+"."+sign(payload));
      return {slideId:a.slideId,revision:current.revision,
        current:{...compareOneVariant(baseline,baseline),
          ...(a.includePreviews?{previewUrl:token(a.slideId+":preview:"+expires)}:{})},
        variants:stored.map(v=>({...compareOneVariant(baseline,v),fingerprint:fingerprint(v),
          ...(a.includePreviews?{previewUrl:token(a.slideId+":"+v.id+":variant-preview:"+expires)}:{})})),
        previewExpiresAt:a.includePreviews?new Date(expires).toISOString():undefined,
        comparisonMethod:"Static hints and preservation flags; open the signed preview URLs in a browser to inspect rendering, typography and images."};
    });

  register("revise_variant","Modifier une variante sans écraser la diapositive",
    "Edit a SAVED variant in place with up to 80 targeted slide operations (HTML/CSS, text, image layers, notes, animations), while leaving the active slide unchanged. Requires the exact fingerprint returned by compare_variants to avoid concurrent overwrites.",
    {slideId:uuid,variantId:uuid,
      expectedFingerprint:z.string().regex(/^[0-9a-f]{64}$/),
      name:z.string().trim().min(1).max(120).optional(),
      operations:z.array(SlideOperationSchema).min(1).max(80)},true,
    async a=>reviseVariant(a.slideId,a.variantId,a.expectedFingerprint,a.operations,a.name));

  register("activate_variant","Choisir une variante",
    "Make a saved design the active slide. Current design is stored as a backup variant.",
    {slideId:uuid,variantId:uuid,revision:z.number().int().min(1).optional()},true,
    async a=>activateVariant(a.slideId,a.variantId,a.revision));

  register("prepare_export","Préparer l'exportation",
    "Open the private Web editor for PPTX generation (faithful or editable), or issue a short-lived signed HTML/JSON download URL. PowerPoint rendering must run in a browser and is NOT generated by this MCP call.",
    {presentationId:uuid,format:z.enum(["pptx","html","json"]).default("pptx"),
      mode:z.enum(["faithful","editable"]).default("editable")},false,
    async a=>{
      const deck=await getDeck(a.presentationId,"full",0,100);
      if(deck.nextOffset!==null)throw new Error("export_limit_100_slides");
      const exportPlan=inspectExport(deck.slides.filter((s):s is DbSlide=>"document" in s));
      const {sign}=await import("../../src/mcp/security");
      const editor=ORIGIN+"/?deck="+encodeURIComponent(a.presentationId)+"&export="+a.mode;
      if(a.format==="pptx") return {format:"pptx",mode:a.mode,presentation:deck.presentation,
        editorUrl:editor,preflight:{
          slideCount:exportPlan.slideCount,fullyNative:exportPlan.fullyNative,
          mixedEditable:exportPlan.mixedEditable,rasterOnly:exportPlan.rasterOnly,
          totalRemoteImages:exportPlan.totalRemoteImages,animatedSlides:exportPlan.animatedSlides,
          warnings:exportPlan.warnings,googleSlides:exportPlan.googleSlides
        },action:"Open the private editor, choose the export mode and click Télécharger PPTX. No server-side PPTX job has run."};
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
