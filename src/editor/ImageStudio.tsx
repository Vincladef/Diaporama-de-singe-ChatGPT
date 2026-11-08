import { useEffect,useState } from "react";
import type { ImageCandidate, ImageSearchResult, ImageSource } from "../images/search";
import type { SlideElement } from "../domain/slide";

type Props={
  token:string;
  onClose:()=>void;
  onPick:(photo:ImageCandidate)=>void;
  selectedImage?:SlideElement;
  searchTerm?:string;
};
const ALL:ImageSource[]=["openverse","wikimedia","pexels","unsplash","google"];
const titles:Record<ImageSource,string>={openverse:"Openverse",wikimedia:"Wikimedia",pexels:"Pexels",unsplash:"Unsplash",google:"Google Images"};
function queryUrl(query:string,sources:ImageSource[],page:number){
  const u=new URL("/.netlify/functions/image-search",window.location.origin);
  u.searchParams.set("q",query);u.searchParams.set("sources",sources.join(","));u.searchParams.set("perSource","20");u.searchParams.set("page",String(page));
  return u.toString();
}
export function ImageStudio({token,onClose,onPick,selectedImage,searchTerm}:Props){
  const [query,setQuery]=useState(searchTerm??"");
  const [sources,setSources]=useState<ImageSource[]>(["openverse","wikimedia"]);
  const [page,setPage]=useState(1);
  const [result,setResult]=useState<ImageSearchResult|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [manual,setManual]=useState("");
  const [chosen,setChosen]=useState<ImageCandidate|null>(null);

  useEffect(()=>{
    const close=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};
    window.addEventListener("keydown",close);
    return()=>window.removeEventListener("keydown",close);
  },[onClose]);
  async function search(nextPage=1){
    if(query.trim().length<2)return;
    setLoading(true);setError("");setChosen(null);setPage(nextPage);
    try{
      const response=await fetch(queryUrl(query.trim(),sources,nextPage),{headers:{authorization:"Bearer "+token},cache:"no-store"});
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
      const url=new URL(manual.trim());
      if(url.protocol!=="https:")throw Error("L'image doit utiliser HTTPS.");
      onPick({id:"manual:"+url.toString().slice(0,120),provider:"google",title:"Image externe",alt:"Image externe",
        imageUrl:url.toString(),previewUrl:url.toString(),pageUrl:url.toString(),creator:"",license:"Droits non vérifiés",
        attribution:"Adresse fournie par l'utilisateur",width:0,height:0});
    }catch(e){setError(e instanceof Error?e.message:"Adresse invalide");}
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
          {ALL.map(s=><label key={s} className="studio-source">
            <input type="checkbox" checked={sources.includes(s)} onChange={()=>toggle(s)}/>
            {s==="google"?"Google Images (API facultative)":titles[s]}
          </label>)}
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
            <button className="primary" onClick={()=>onPick(chosen)}>{selectedImage?"Remplacer l'image":"Insérer cette image"}</button>
          </div>}
          <div className="studio-pagination">
            <button disabled={!result||page===1||loading} onClick={()=>void search(page-1)}>← Précédentes</button>
            <span>Page {page}</span>
            <button disabled={!result||loading||result.images.length===0} onClick={()=>void search(page+1)}>Suivantes →</button>
          </div>
        </div>
        <footer className="studio-footer">
          <label>Insérer depuis une adresse HTTPS
            <input type="url" placeholder="https://..." value={manual} onChange={e=>setManual(e.target.value)}/>
          </label>
          <button onClick={useManual} disabled={!manual.trim()}>Insérer l'URL</button>
          <small>Les licences varient selon la source. Google Images s'ouvre dans un autre onglet ; copie ensuite l'adresse d'une image autorisée.</small>
        </footer>
      </section>
    </div>
  );
}
