import {useState} from "react";
import {DiagramSchema,type Diagram} from "../graphics/diagrams.ts";
import {composeElkDiagram} from "../graphics/elkLayout.ts";
import {renderSlideHtml} from "../engine/render.ts";
import type {SlideDocument} from "../domain/slide.ts";

type Props={onClose:()=>void;onCreate:(document:SlideDocument,notes:string)=>Promise<void>};
export function DiagramStudio({onClose,onCreate}:Props){
 const [title,setTitle]=useState("");
 const [kind,setKind]=useState<"flow"|"causal"|"hierarchy">("causal");
 const [nodes,setNodes]=useState("");
 const [links,setLinks]=useState("");
 const [notes,setNotes]=useState("");
 const [busy,setBusy]=useState(false);
 const [preview,setPreview]=useState<SlideDocument|null>(null);
 const [error,setError]=useState("");
 async function generate(){
   setBusy(true);setError("");
   try{
     const parsedNodes=nodes.split("\n").map(x=>x.trim()).filter(Boolean).map((text,i)=>{
       const [left,...rest]=text.split("|").map(x=>x.trim());
       return rest.length
         ?{id:left,label:rest[0]??"",...(rest[1]?{detail:rest.slice(1).join(" | ")}:{})}
         :{id:"n"+(i+1),label:left};
     });
     const parsedEdges=links.split("\n").map(x=>x.trim()).filter(Boolean).map(line=>{
       const found=line.match(/^([\w-]+)\s*->\s*([\w-]+)(?:\s*:\s*(.+))?$/);
       if(!found)throw Error("Lien invalide : "+line+" ; format : source -> cible : explication.");
       return {from:found[1]!,to:found[2]!,...(found[3]?{label:found[3]}:{})};
     });
     const spec=DiagramSchema.parse({kind,title,nodes:parsedNodes,edges:parsedEdges,
       notes:notes.trim()||undefined,theme:"paper"});
     const doc=await composeElkDiagram(spec as Diagram);
     setPreview(doc);
   }catch(e){setError(e instanceof Error?e.message:"Schéma non valide.");}
   finally{setBusy(false);}
 }
 return <div className="studio-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <section className="studio-dialog diagram-studio" role="dialog" aria-modal="true" aria-label="Composer un schéma scientifique">
   <header className="studio-header"><div><strong>Schéma scientifique</strong>
     <span>Placement calculé par ELK ; objets et textes modifiables</span></div>
     <button className="studio-close" onClick={onClose} aria-label="Fermer">×</button></header>
   <div className="diagram-form">
     <label>Titre<input value={title} maxLength={175} placeholder="Le modèle à représenter…" onChange={e=>setTitle(e.target.value)}/></label>
     <label>Relation<select value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setPreview(null);}}>
       <option value="causal">Réseau de relations</option><option value="flow">Processus</option>
       <option value="hierarchy">Hiérarchie</option></select></label>
     <label>Nœuds <span>Un par ligne : identifiant | libellé | détail facultatif</span>
       <textarea value={nodes} rows={5} onChange={e=>{setNodes(e.target.value);setPreview(null);}}
         placeholder={"attention | Attention sur soi\nimage | Image mentale négative\nsecurite | Comportements de sécurité"}/></label>
     <label>Liens <span>Un par ligne : source -&gt; cible : libellé facultatif</span>
       <textarea value={links} rows={4} onChange={e=>{setLinks(e.target.value);setPreview(null);}}
         placeholder={"attention -> image\nimage -> securite"}/></label>
     <label>Notes et références <textarea value={notes} rows={2}
       onChange={e=>setNotes(e.target.value)} placeholder="Sources scientifiques, limites d'interprétation…"/></label>
     <div className="diagram-form-actions">
       <button disabled={busy||nodes.trim().length<4||!title.trim()} onClick={()=>void generate()}>
         {busy?"Calcul du schéma…":"Prévisualiser le schéma"}</button>
       <button className="primary" disabled={busy||!preview} onClick={()=>{if(preview)void onCreate(preview,notes);}}>
         Créer une diapositive modifiable
       </button>
     </div>
     {error&&<p role="alert" className="error-line">{error}</p>}
     {preview&&<div className="diagram-preview" aria-label="Aperçu en 16:9">
       <iframe title="Aperçu du schéma calculé" sandbox="" width="1920" height="1080"
         srcDoc={renderSlideHtml(preview)}/>
       </div>}
     <small>Les textes, les flèches SVG et les notes restent distincts. Les nœuds apparaissent progressivement au clic. Les relations sont des hypothèses ou descriptions, jamais des preuves à elles seules.</small>
   </div>
  </section>
 </div>;
}
