import test from "node:test";
import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import JSZip from "jszip";
import {composeElkDiagram} from "../graphics/elkLayout.ts";
import {DiagramSchema} from "../graphics/diagrams.ts";
import type {PresentationDetail} from "../lib/api.ts";

test("exports a genuine PPTX from the real editable-slide exporter",{timeout:120_000},async()=>{
 await mkdir("artifacts",{recursive:true});
 const path=resolve("artifacts/real-pptx-export.mjs");
 await build({entryPoints:["src/export/pptx.ts"],platform:"node",format:"esm",
   outfile:path,bundle:true,packages:"external",logLevel:"silent"});
 const module=await import(pathToFileURL(path).href);
 const document=await composeElkDiagram(DiagramSchema.parse({
   kind:"flow",title:"Modèle de maintien social",
   nodes:[{id:"a",label:"Attention centrée sur soi"},
     {id:"b",label:"Perception négative de soi"},
     {id:"c",label:"Stratégies de sécurité"}],
   edges:[{from:"a",to:"b",label:"oriente"},{from:"b",to:"c",label:"favorise"}],
 }));
 const deck={
   presentation:{id:"00000000-0000-4000-8000-000000000001",title:"Vérification de schéma ELK"},
   slides:[{id:"00000000-0000-4000-8000-000000000002",position:0,
     document,notes:"Source : Clark et Wells (1995), modèle théorique.",revision:1}],
 } as unknown as PresentationDetail;
 const artifact=await module.buildPowerPoint(deck,"editable",undefined,"static");
 assert.ok(artifact.blob.size>4000);
 assert.equal(artifact.slideCount,1);
 const bytes=Buffer.from(await artifact.blob.arrayBuffer());
 assert.equal(bytes.subarray(0,2).toString("utf8"),"PK");
 const zip=await JSZip.loadAsync(bytes);
 assert.ok(zip.file("ppt/slides/slide1.xml"),"native slide XML present");
 const xml=await zip.file("ppt/slides/slide1.xml")!.async("string");
 assert.ok(xml.includes("Attention centrée sur soi"),"editable native text is in PPTX XML");
 assert.ok(xml.includes("Stratégies de sécurité"),"all scientific node labels retained");
 const media=Object.keys(zip.files).filter(name=>name.startsWith("ppt/media/")&&name.endsWith(".svg"));
 assert.ok(media.length>=1,"SVG connectors remain vector image assets");
 assert.ok(Object.keys(zip.files).some(name=>name.startsWith("ppt/notesSlides/notesSlide1.xml")));
 await writeFile("artifacts/elk-editable-export.pptx",bytes);
});
