import {useEffect,useState} from "react";

export function ExampleImage({src,alt,className}:{
 src:string;alt:string;className?:string;
}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[src]);
 return failed?
  <div className={"prompt-image-unavailable "+(className??"")} role="img" aria-label={"Image indisponible : "+alt}>
   <span>Image indisponible</span>
   <small>Vérifier l’URL dans la fiche</small>
  </div>:
  <img className={className} src={src} alt={alt} loading="lazy"
   onError={()=>setFailed(true)}/>;
}

export function PromptExampleGallery({title,urls,onOpen}:{
 title:string;urls:string[];onOpen:(urls:string[],index:number)=>void;
}){
 const [active,setActive]=useState(0);
 const validUrls=urls.map(s=>s.trim()).filter(Boolean);
 const selected=Math.min(active,Math.max(0,validUrls.length-1));
 if(!validUrls.length)return <div className="prompt-gallery-no-image">
   <span>Pas encore d’image d’exemple</span><small>Ajouter des URL dans la fiche</small>
 </div>;
 return <div className="prompt-example-gallery">
  <button type="button" className="prompt-gallery-cover" onClick={()=>onOpen(validUrls,selected)}
   aria-label={"Agrandir l’exemple "+(selected+1)+" de "+title}>
   <ExampleImage src={validUrls[selected]!} alt={"Exemple "+(selected+1)+" : "+title}/>
   <span className="prompt-gallery-zoom">⤢ Agrandir</span>
  </button>
  <div className="prompt-gallery-strip" aria-label={"Galerie de "+title}>
   {validUrls.map((url,i)=><button type="button" key={url+"-"+i}
     className={"prompt-gallery-thumb"+(i===selected?" is-current":"")}
     onClick={()=>setActive(i)} aria-label={"Voir l’exemple "+(i+1)+" de "+title}
     aria-pressed={i===selected}>
      <ExampleImage src={url} alt={"Miniature "+(i+1)+" de "+title}/>
     </button>)}
   <span className="prompt-gallery-count">{selected+1} / {validUrls.length}</span>
  </div>
 </div>;
}
