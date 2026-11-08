import { useEffect,useState } from "react";
import type { SlideDocument } from "../domain/slide";
import { command,readSlideHistory } from "../lib/api";
import { SlideThumbnail } from "./SlideThumbnail";

type Checkpoint={id:string;name:string;created_at:string;notes:string;document:SlideDocument};
type Props={
  token:string;slideId:string;revision:number;dirty:boolean;
  onClose:()=>void;onRestored:()=>Promise<void>;
};
export function HistoryStudio({token,slideId,revision,dirty,onClose,onRestored}:Props){
  const [items,setItems]=useState<Checkpoint[]>([]);
  const [selected,setSelected]=useState<string>("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    let disposed=false;
    void readSlideHistory(token,slideId,20).then(list=>{
      if(disposed)return;
      setItems(list.items);setSelected(list.items[0]?.id??"");setLoading(false);
    }).catch(e=>{if(disposed)return;setError(e instanceof Error?e.message:String(e));setLoading(false);});
    return()=>{disposed=true;};
  },[token,slideId]);
  const preview=items.find(x=>x.id===selected);
  async function restore(){
    if(!preview||busy)return;
    if(dirty){setError("Enregistrez ou abandonnez le brouillon avant de restaurer une version.");return;}
    if(!window.confirm("Restaurer « "+preview.name+" » ? La version actuelle sera elle aussi conservée dans l'historique."))return;
    setBusy(true);setError("");
    try{
      await command(token,{action:"restoreSlideHistory",slideId,checkpointId:preview.id,revision});
      await onRestored();
      onClose();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  return <div className="studio-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="studio-dialog history-studio" role="dialog" aria-modal="true" aria-label="Historique de la diapositive">
      <header className="studio-header">
        <div><strong>Historique des modifications</strong>
          <span>Versions conservées dans Neon, y compris les changements issus du MCP.</span></div>
        <button className="studio-close" onClick={onClose} aria-label="Fermer l'historique">×</button>
      </header>
      {error&&<p className="error-line" role="alert">{error}</p>}
      {loading?<p className="studio-empty">Lecture de l'historique…</p>:items.length===0?
        <p className="studio-empty">Aucune version antérieure enregistrée. Les prochaines sauvegardes apparaîtront ici.</p>:
        <div style={{display:"grid",gridTemplateColumns:"minmax(220px,1fr) minmax(260px,1.7fr)",gap:22,padding:22}}>
          <div style={{maxHeight:430,overflowY:"auto",display:"grid",gap:8,alignContent:"start"}}>
            {items.map(item=><button type="button" key={item.id}
              className={"subtle-btn"+(selected===item.id?" selected":"")}
              style={{display:"block",textAlign:"left",padding:12,whiteSpace:"normal"}}
              onClick={()=>setSelected(item.id)}>
              <strong>{item.name}</strong>
              <span style={{display:"block",fontSize:12,opacity:.72,marginTop:4}}>{new Date(item.created_at).toLocaleString("fr-FR")}</span>
            </button>)}
          </div>
          <div>
            {preview&&<>
              <div style={{width:"100%",aspectRatio:"16 / 9",overflow:"hidden",borderRadius:8}}>
                <SlideThumbnail document={preview.document} index={0}/>
              </div>
              <p style={{fontSize:13,marginTop:10,whiteSpace:"pre-wrap"}}>{preview.notes?.slice(0,240)||"Sans notes pour cette version."}</p>
            </>}
          </div>
        </div>}
      <footer className="studio-variant-footer">
        <span>{items.length} version{items.length>1?"s":""} disponible{items.length>1?"s":""} ; les 60 dernières sont conservées.</span>
        <button onClick={onClose}>Fermer</button>
        <button className="primary" disabled={!preview||dirty||busy} onClick={()=>void restore()}>
          {busy?"Restauration…":"Restaurer cette version"}
        </button>
      </footer>
    </section>
  </div>;
}
