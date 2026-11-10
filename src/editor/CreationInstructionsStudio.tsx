import { useEffect, useState } from "react";
import { readCreationInstructions, writeCreationInstructions } from "../lib/api";

export function CreationInstructionsStudio({
  token,presentationId,presentationTitle,onClose
}:{
  token:string;presentationId?:string;presentationTitle?:string;onClose:()=>void;
}) {
  const [global,setGlobal]=useState("");
  const [local,setLocal]=useState("");
  const [savedGlobal,setSavedGlobal]=useState("");
  const [savedLocal,setSavedLocal]=useState("");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  useEffect(()=>{
    let active=true;
    setLoading(true);setError("");setSuccess("");
    void readCreationInstructions(token,presentationId).then(data=>{
      if(!active)return;
      setGlobal(data.global);setLocal(data.presentation);
      setSavedGlobal(data.global);setSavedLocal(data.presentation);
    }).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[token,presentationId]);

  const dirty=global!==savedGlobal || (!!presentationId && local!==savedLocal);
  async function save() {
    if(saving||loading)return;
    setSaving(true);setError("");setSuccess("");
    try{
      if(global!==savedGlobal){
        await writeCreationInstructions(token,"global",global);
        setSavedGlobal(global);
      }
      if(presentationId && local!==savedLocal){
        await writeCreationInstructions(token,"presentation",local,presentationId);
        setSavedLocal(local);
      }
      setSuccess("Instructions enregistrées ; elles sont accessibles depuis le MCP.");
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setSaving(false);}
  }
  return <div className="studio-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!dirty)onClose();}}>
    <section className="studio-dialog creation-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="creation-settings-heading">
      <header className="studio-header">
        <div><strong id="creation-settings-heading">Instructions de création</strong>
          <span>Paramètres de Diaporama de singe · enregistrés dans Neon</span></div>
        <button className="studio-close" aria-label="Fermer les paramètres"
          onClick={()=>{if(!dirty||window.confirm("Fermer sans enregistrer les instructions ?"))onClose();}}>×</button>
      </header>
      <div className="creation-settings-content">
        {loading?<p>Chargement des instructions…</p>:<>
          <div className="creation-settings-section">
            <div className="creation-settings-heading">
              <h3>Instructions permanentes</h3>
              <span>Pour toutes les nouvelles présentations</span>
            </div>
            <p>Définis ici ton style préféré, les images, les animations et les règles de conception. Tu peux écrire un prompt complet.</p>
            <label htmlFor="creation-global">Instructions globales</label>
            <textarea id="creation-global" value={global} rows={12}
              onChange={e=>{setGlobal(e.target.value);setSuccess("");}}
              spellCheck autoComplete="off" placeholder="Ex. : grandes photographies, compositions éditoriales, schémas qui apparaissent au clic…" />
            <small>{global.length.toLocaleString("fr-FR")} caractères</small>
          </div>
          {presentationId && <div className="creation-settings-section">
            <div className="creation-settings-heading">
              <h3>Instructions de cette présentation</h3>
              <span>{presentationTitle||"Présentation actuelle"}</span>
            </div>
            <p>Ces consignes complètent les préférences générales. En cas de contradiction, elles sont prioritaires.</p>
            <label htmlFor="creation-local">Instructions particulières</label>
            <textarea id="creation-local" value={local} rows={6}
              onChange={e=>{setLocal(e.target.value);setSuccess("");}}
              placeholder="Ex. : palette archive et illustrations historiques ; animations en étapes." />
            <div className="creation-settings-local-footer"><small>{local.length.toLocaleString("fr-FR")} caractères</small>
              <button type="button" className="text-btn" disabled={!local.length}
                onClick={()=>{setLocal("");setSuccess("");}}>Effacer la consigne locale</button></div>
          </div>}
          <p className="creation-settings-explain">ChatGPT retrouve ces instructions grâce à l’outil MCP « get_creation_instructions ». Aucun paramètre n’est conservé uniquement sur cet appareil.</p>
        </>}
        {error&&<p className="creation-settings-error" role="alert">{error}</p>}
        {success&&<p className="creation-settings-success" role="status">{success}</p>}
      </div>
      <footer className="creation-settings-footer">
        <button className="subtle-btn" onClick={()=>{if(!dirty||window.confirm("Fermer sans enregistrer les instructions ?"))onClose();}}>Fermer</button>
        <button className="primary" disabled={loading||saving||!dirty} onClick={()=>void save()}>
          {saving?"Enregistrement…":"Enregistrer les instructions"}
        </button>
      </footer>
    </section>
  </div>;
}
