import { useEffect,useState } from "react";
import type { ImageCandidate, ImageSearchResult, ImageSource } from "../images/search";
import type { SlideElement } from "../domain/slide";
import { directImageUrl } from "../images/direct";
import type {PhotoInspection} from "../images/inspection";

type Props={
  token:string;
  onClose:()=>void;
  onPick:(photo:ImageCandidate)=>void;
  selectedImage?:SlideElement;
  searchTerm?:string;
};
const ALL:ImageSource[]=["openverse","wikimedia","pexels","unsplash","google"];
const titles:Record<ImageSource,string>={openverse:"Openverse",wikimedia:"Wikimedia",pexels:"Pexels",unsplash:"Unsplash",google:"Google Images"};
function queryUrl(query:string,sources:ImageSource[],page:number,orientation:"any"|"landscape"|"portrait"|"square"){
  const u=new URL("/.netlify/functions/image-search",window.location.origin);
  u.searchParams.set("q",query);u.searchParams.set("sources",sources.join(","));u.searchParams.set("perSource","20");u.searchParams.set("page",String(page));u.searchParams.set("orientation",orientation);
  return u.toString();
}
export function ImageStudio({token,onClose,onPick,selectedImage,searchTerm}:Props){
  const [query,setQuery]=useState(searchTerm??"");
  const [sources,setSources]=useState<ImageSource[]>(["openverse","wikimedia"]);
  const [available,setAvailable]=useState<ImageSource[]>(["openverse","wikimedia"]);
  const [page,setPage]=useState(1);
  const [orientation,setOrientation]=useState<"any"|"landscape"|"portrait"|"square">("landscape");
  const [result,setResult]=useState<ImageSearchResult|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [manual,setManual]=useState("");
  const [chosen,setChosen]=useState<ImageCandidate|null>(null);
  const [inspection,setInspection]=useState<PhotoInspection|null>(null);
  const [inspectBusy,setInspectBusy]=useState(false);
  const [inspectError,setInspectError]=useState("");
  const [cropMode,setCropMode]=useState<"center"|"attention"|"entropy">("center");

  useEffect(()=>{
    let active=true;
    const url=new URL("/.netlify/functions/image-search",window.location.origin);
    url.searchParams.set("op","sources");
    void fetch(url,{headers:{Authorization:"Bearer "+token},cache:"no-store"})
      .then(async response=>response.ok?await response.json():null)
      .then((data:{sources?:Array<{source:ImageSource;enabled:boolean}>}|null)=>{
        if(!active||!data?.sources)return;
        const usable=data.sources.filter(x=>x.enabled).map(x=>x.source);
        setAvailable(usable);
        setSources(usable.filter(x=>x!=="google"&&x!=="pexels").slice(0,3));
      }).catch(()=>{});
    return()=>{active=false;};
  },[token]);
  useEffect(()=>{
    if(!chosen){setInspection(null);setInspectError("");return;}
    const controller=new AbortController();
    setInspection(null);setInspectError("");setInspectBusy(true);setCropMode("center");
    const w=Math.max(200,Math.min(2560,Number.parseInt(String(selectedImage?.styles.width??"1200"))||1200));
    const h=Math.max(150,Math.min(1600,Number.parseInt(String(selectedImage?.styles.height??"675"))||675));
    void fetch("/.netlify/functions/image-inspect",{
      method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify({url:chosen.imageUrl,target:{width:w,height:h}}),
      signal:controller.signal,cache:"no-store",
    }).then(async response=>{
      const result=await response.json();
      if(!response.ok)throw Error(result.error??"Photo inaccessible");
      setInspection(result.inspection as PhotoInspection);
    }).catch(e=>{
      if(!controller.signal.aborted)setInspectError(
        String(e instanceof Error?e.message:e)==="unsupported_image_host"
          ?"Ce fournisseur ne permet pas encore une inspection serveur ; vérifie manuellement sa résolution et ses droits."
          :"Impossible de vérifier ce fichier. L'image pourrait être absente ou protégée.");
    }).finally(()=>{if(!controller.signal.aborted)setInspectBusy(false);});
    return()=>controller.abort();
  },[chosen?.imageUrl,token,selectedImage?.styles.width,selectedImage?.styles.height]);
  useEffect(()=>{
    const close=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};
    window.addEventListener("keydown",close);
    return()=>window.removeEventListener("keydown",close);
  },[onClose]);
  async function search(nextPage=1){
    if(query.trim().length<2)return;
    setLoading(true);setError("");setChosen(null);setPage(nextPage);
    try{
      const response=await fetch(queryUrl(query.trim(),sources,nextPage,orientation),{headers:{authorization:"Bearer "+token},cache:"no-store"});
      const json:unknown=await response.json();
      if(!response.ok)throw new Error("Recherche indisponible : HTTP "+response.status);
      setResult(json as ImageSearchResult);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  }
  function toggle(source:ImageSource){
    setSources(current=>current.includes(source)?(current.length>1?current.filter(s=>s!==source):current):[...current,source]);
  }
  function useManual(){
    try{
      const direct=directImageUrl(manual);
      onPick({id:"manual:"+direct.slice(0,120),provider:"google",title:"Image externe",alt:"Image externe",
        imageUrl:direct,previewUrl:direct,pageUrl:direct,creator:"",license:"Droits non vérifiés",
        attribution:"Adresse fournie par l'utilisateur",width:0,height:0});
    }catch(e){setError(e instanceof Error?e.message:"Adresse invalide");}
  }
  async function pasteImageAddress(){
    try{
      const copied=await navigator.clipboard.readText();
      const direct=directImageUrl(copied);
      setManual(direct);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Impossible de lire le presse-papiers. Collez directement l'URL.");}
  }
  const googleLink="https://www.google.com/search?tbm=isch&q="+encodeURIComponent(query);
  return (
    <div className="studio-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <section className="studio-dialog image-studio" role="dialog" aria-modal="true" aria-label="Rechercher et choisir une image">
        <header className="studio-header"><div><strong>Photothèque</strong><span>Rechercher, comparer et insérer des images</span></div>
          <button className="studio-close" onClick={onClose} aria-label="Fermer la photothèque">×</button></header>
        <form className="studio-search" onSubmit={e=>{e.preventDefault();void search(1);}}>
          <input aria-label="Rechercher des images" value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="Montagne au crépuscule, équipe au travail, portrait…" autoFocus/>
          <button type="submit" className="primary" disabled={loading||query.trim().length<2}>{loading?"Recherche…":"Rechercher"}</button>
        </form>
        <div className="studio-sources">
          {ALL.filter(source=>available.includes(source)).map(s=><label key={s} className="studio-source">
            <input type="checkbox" checked={sources.includes(s)} onChange={()=>toggle(s)}/>
            {s==="google"?"Google Images (API facultative)":titles[s]}
          </label>)}
          <label>Format <select aria-label="Orientation des photographies" value={orientation} onChange={e=>setOrientation(e.target.value as typeof orientation)}><option value="landscape">Paysage</option><option value="portrait">Portrait</option><option value="square">Carré</option><option value="any">Indifférent</option></select></label>
          <a target="_blank" rel="noopener noreferrer" href={googleLink} className="studio-google-link">Google Images ↗</a>
        </div>
        <div className="studio-content">
          {error&&<div role="alert" className="error-line">{error}</div>}
          {result&&<div className="studio-notes">
            <span>{result.images.length} images sur cette page</span>
            {Object.entries(result.providers).filter(([s])=>sources.includes(s as ImageSource)).map(([name,s])=>
              <span key={name} className={s.status==="ok"?"source-ok":"source-warning"}>{titles[name as ImageSource]} : {s.status==="ok"?s.count:s.reason??s.status}</span>)}
          </div>}
          {result?.images.length ? <div className="image-gallery">
            {result.images.map(img=><button key={img.id+"-"+img.imageUrl} className={"image-choice"+(chosen?.id===img.id?" chosen":"")}
              onClick={()=>setChosen(img)} title={img.title}>
              <img src={img.previewUrl} alt={img.alt} loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.classList.add("failed-image");}}/>
              <span className="image-choice-credit">{img.creator||titles[img.provider]} · {titles[img.provider]}</span>
            </button>)}
          </div>:result?<div className="studio-empty">Aucune image exploitable. Essaie une autre expression ou source.</div>:
          <div className="studio-empty">Recherche simultanément parmi les collections accessibles. Jusqu'à vingt propositions par source, sur chaque page.</div>}
          {chosen&&<div className="image-details">
            <img alt={chosen.alt} src={chosen.previewUrl}/>
            <div><strong>{chosen.title}</strong><p>{chosen.attribution||chosen.provider} ; {chosen.license}</p>
              <a href={chosen.pageUrl} target="_blank" rel="noopener noreferrer">Voir la source et les droits ↗</a>
            </div>
            <button className="primary" onClick={()=>onPick({...chosen,...(inspection?{
              focalX:inspection.crops.find(c=>c.id===cropMode)?.focalX??50,
              focalY:inspection.crops.find(c=>c.id===cropMode)?.focalY??50
            }:{})})}>{selectedImage?"Remplacer l'image":"Insérer cette image"}</button>
          </div>}
          {chosen&&<div className="image-crop-panel">
            <div className="image-crop-heading">
              <strong>Vérification et cadrages</strong>
              {inspectBusy&&<span>Analyse de l'image…</span>}
              {inspection&&<span>{inspection.width} × {inspection.height} px ·
                {inspection.resolution==="adequate"?" résolution adaptée":inspection.resolution==="limited"?" définition limitée":" résolution insuffisante"}</span>}
            </div>
            {inspection?.warning&&<p role="status" className="image-crop-warning">{inspection.warning}</p>}
            {inspectError&&<p className="image-crop-warning">{inspectError}</p>}
            {inspection&&<div className="image-crop-grid">
              {inspection.crops.map(crop=><button type="button" key={crop.id}
                aria-pressed={cropMode===crop.id}
                className={"image-crop-choice"+(cropMode===crop.id?" selected":"")}
                onClick={()=>setCropMode(crop.id)}>
                <img alt={crop.label+" · prévisualisation"} src={"data:"+crop.mimeType+";base64,"+crop.previewBase64}/>
                <span>{crop.label} · point focal {crop.focalX}% / {crop.focalY}%</span>
              </button>)}
            </div>}
            <small>Prévisualisations Sharp réelles. Le cadrage retenu reste modifiable ; source et licence conservées.</small>
          </div>}
          <div className="studio-pagination">
            <button disabled={!result||page===1||loading} onClick={()=>void search(page-1)}>← Précédentes</button>
            <span>Page {page}</span>
            <button disabled={!result||loading||result.images.length===0} onClick={()=>void search(page+1)}>Suivantes →</button>
          </div>
        </div>
        <footer className="studio-footer">
          <label>Coller l'adresse directe d'une image Google ou d'un autre site
            <input type="url" placeholder="https://..." value={manual} onChange={e=>setManual(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();useManual();}}}/>
          </label>
          <button type="button" onClick={()=>void pasteImageAddress()}>Coller depuis le presse-papiers</button>
          <button type="button" onClick={useManual} disabled={!manual.trim()}>Insérer l'image</button>
          <small>Google Images ne nécessite pas de clé pour la recherche externe : ouvrez Google, copiez l'adresse directe de la photographie, puis collez-la ici. Les résultats Google ne sont pas automatiquement importés et les droits doivent être vérifiés. Unsplash apparaît ici si sa clé est active.</small>
        </footer>
      </section>
    </div>
  );
}
