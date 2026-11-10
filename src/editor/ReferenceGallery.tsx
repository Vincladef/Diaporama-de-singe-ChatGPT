import {useEffect,useState} from "react";
import {
  readReferencePages,renderReferencePages,loadReferencePageImage,
  saveReferenceSelection,saveReferenceKind,
  type CreationReference,type ReferencePageInfo,type ReferencePageCollection,type VisualKind
} from "../lib/api";

const options:{value:VisualKind;label:string}[]=[
  {value:"photographique",label:"Photo"},{value:"documentaire",label:"Document"},
  {value:"graphique",label:"Graphique"},{value:"schématique",label:"Schéma"},
  {value:"comparatif",label:"Comparaison"},{value:"typographique",label:"Typographie"},
  {value:"mixte",label:"Mixte"}
];

function ReferenceThumb({token,id,page}:{token:string;id:string;page:number}){
  const [src,setSrc]=useState("");
  const [error,setError]=useState(false);
  useEffect(()=>{
    let active=true,url="";
    setSrc("");setError(false);
    void loadReferencePageImage(token,id,page).then(blob=>{
      if(!active)return;
      url=URL.createObjectURL(blob);setSrc(url);
    }).catch(()=>{if(active)setError(true);});
    return()=>{active=false;if(url)URL.revokeObjectURL(url);};
  },[token,id,page]);
  return src?<img className="reference-gallery-thumb" src={src} alt={"Aperçu réel de la diapositive "+page} loading="lazy"/>:
    <div className="reference-gallery-placeholder" aria-label={error?"Aperçu indisponible":"Chargement de l'aperçu"}>
      {error?"Aperçu indisponible":"Chargement…"}
    </div>;
}

export function ReferenceGallery({token,reference}:{token:string;reference:CreationReference}){
  const [opened,setOpened]=useState(true);
  const [collection,setCollection]=useState<ReferencePageCollection|null>(null);
  const [progress,setProgress]=useState("");
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const isPptx=reference.mimeType.includes("presentationml.presentation");

  useEffect(()=>{
    if(!opened||!isPptx)return;
    let active=true;
    const run=async()=>{
      setError("");setProgress("");
      try{
        let data=await readReferencePages(token,reference.id);
        if(!active)return;
        setCollection(data);
        if(data.totalSlides<1)return;
        const completed=new Set(data.pages.map(page=>page.slideNumber));
        for(let start=1;start<=data.totalSlides;start+=3){
          if(!active)return;
          const missing=[start,start+1,start+2].filter(page=>page<=data.totalSlides&&!completed.has(page));
          if(!missing.length)continue;
          setProgress("Création des aperçus : "+completed.size+" / "+data.totalSlides);
          const result=await renderReferencePages(token,reference.id,start,3);
          if(!active)return;
          for(const page of result.rendered)completed.add(page.slideNumber);
          data=await readReferencePages(token,reference.id);
          if(active)setCollection(data);
          if(!result.rendered.length)throw Error("Le moteur n'a produit aucune image pour ce lot.");
        }
        if(active)setProgress("");
      }catch(e){if(active){setProgress("");setError(e instanceof Error?e.message:String(e));}}
    };
    void run();
    return()=>{active=false;};
  },[token,reference.id,opened,isPptx]);

  async function selectPages(pages:number[]){
    if(!collection||saving)return;
    setSaving(true);setError("");
    try{
      const selected=await saveReferenceSelection(token,reference.id,pages);
      setCollection(prev=>prev?{...prev,pages:prev.pages.map(p=>({...p,selected:selected.includes(p.slideNumber)}))}:prev);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setSaving(false);}
  }
  async function changeKind(page:ReferencePageInfo,kind:VisualKind){
    if(saving)return;
    setSaving(true);setError("");
    try{
      await saveReferenceKind(token,reference.id,page.slideNumber,kind);
      setCollection(prev=>prev?{...prev,pages:prev.pages.map(p=>p.slideNumber===page.slideNumber?{...p,visualKind:kind}:p)}:prev);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setSaving(false);}
  }
  const selected=collection?.pages.filter(p=>p.selected).map(p=>p.slideNumber)??[];
  return <div className="reference-gallery">
    <button type="button" className="reference-gallery-toggle" aria-expanded={opened}
      onClick={()=>setOpened(v=>!v)}>
      {opened?"▾":"▸"} Diapositives de référence
      {collection?<span>{selected.length} / {collection.totalSlides} sélectionnées</span>:null}
    </button>
    {opened&&<>
      {!isPptx?<p className="reference-gallery-description">Cette référence est conservée dans sa forme originale. Les miniatures automatiques concernent les fichiers PowerPoint.</p>:<>
        {collection&&collection.pages.length>0&&<div className="reference-gallery-actions">
          <button type="button" disabled={saving} onClick={()=>void selectPages(collection.pages.map(p=>p.slideNumber))}>Tout sélectionner</button>
          <button type="button" disabled={saving} onClick={()=>void selectPages([])}>Tout désélectionner</button>
        </div>}
        {progress&&<p className="reference-gallery-progress" role="status">{progress}</p>}
        {error&&<p className="creation-settings-error" role="alert">{error}</p>}
        {!collection&&!error&&<p className="reference-gallery-progress">Préparation de la galerie…</p>}
        {collection&&<div className="reference-gallery-grid">
          {collection.pages.map(page=><div className={"reference-gallery-tile"+(page.selected?" is-selected":"")} key={page.slideNumber}>
            <ReferenceThumb token={token} id={reference.id} page={page.slideNumber}/>
            <div className="reference-gallery-tile-bottom">
              <label className="reference-gallery-check">
                <input type="checkbox" checked={page.selected} disabled={saving}
                  onChange={event=>void selectPages(event.target.checked?
                    [...selected,page.slideNumber]:selected.filter(n=>n!==page.slideNumber))}/>
                <span>Diapo {page.slideNumber}</span>
              </label>
              <select aria-label={"Type de la diapositive "+page.slideNumber}
                value={page.visualKind} disabled={saving}
                onChange={event=>void changeKind(page,event.target.value as VisualKind)}>
                {options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="reference-gallery-summary" title={page.layout.composition||""}>
              {page.layout.composition||"Composition à examiner"}
            </div>
            {page.renderWarning&&<small title={page.renderWarning}>Rendu approximatif possible</small>}
          </div>)}
        </div>}
        {collection&&collection.renderedCount<collection.totalSlides&&!progress&&
          <p className="reference-gallery-description">Certaines pages n'ont pas pu être rendues. Les miniatures disponibles restent utilisables.</p>}
        <p className="reference-gallery-description">Les miniatures proviennent d'un moteur de rendu PowerPoint indépendant. Certains effets et polices peuvent différer du fichier d'origine. L'IA peut examiner les images des pages sélectionnées ; elle ne reprend pas leur texte.</p>
      </>}
    </>}
  </div>;
}
