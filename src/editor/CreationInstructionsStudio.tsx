import { useEffect, useState, type ChangeEvent } from "react";
import { readCreationInstructions, writeCreationInstructions, uploadCreationReference,
  deleteCreationReference, downloadCreationReference, type CreationReference } from "../lib/api";

export function CreationInstructionsStudio({
  token,presentationId,presentationTitle,onClose
}:{
  token:string;presentationId?:string;presentationTitle?:string;onClose:()=>void;
}) {
  const [global,setGlobal]=useState("");
  const [local,setLocal]=useState("");
  const [savedGlobal,setSavedGlobal]=useState("");
  const [savedLocal,setSavedLocal]=useState("");
  const [references,setReferences]=useState<CreationReference[]>([]);
  const [uploading,setUploading]=useState(false);
  const [removing,setRemoving]=useState<string|null>(null);
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
      setReferences(data.references??[]);
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
  async function attachFiles(event:ChangeEvent<HTMLInputElement>) {
    const files=Array.from(event.currentTarget.files??[]);
    event.currentTarget.value="";
    if(!files.length)return;
    if(references.length+files.length>8){
      setError("Huit fichiers de référence au maximum ; retire un ancien exemple avant d’en ajouter.");
      return;
    }
    setUploading(true);setError("");setSuccess("");
    try{
      for(const file of files){
        if(file.size>4_000_000)throw Error(file.name+" dépasse la limite de 4 Mo.");
        const reference=await uploadCreationReference(token,file);
        setReferences(previous=>[reference,...previous]);
      }
      setSuccess("Exemple(s) enregistré(s) ; ils seront consultables par ChatGPT pour les prochaines créations.");
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setUploading(false);}
  }
  async function removeReference(id:string) {
    setRemoving(id);setError("");setSuccess("");
    try{
      await deleteCreationReference(token,id);
      setReferences(items=>items.filter(item=>item.id!==id));
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setRemoving(null);}
  }
  async function downloadReference(reference:CreationReference) {
    try{await downloadCreationReference(token,reference);}
    catch(e){setError(e instanceof Error?e.message:String(e));}
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
            <div className="creation-references" aria-label="Présentations de référence">
              <div className="creation-references-title">
                <div><strong>Exemples visuels</strong>
                  <span>Joins des présentations dont tu apprécies la mise en page, la typographie ou les animations.</span></div>
                <span>{references.length} / 8</span>
              </div>
              {references.length>0&&<div className="creation-reference-list">
                {references.map(reference=><div key={reference.id} className="creation-reference-item">
                  <span className="creation-reference-icon" aria-hidden="true">▤</span>
                  <button type="button" className="creation-reference-name" title="Télécharger l’exemple"
                    onClick={()=>void downloadReference(reference)}>{reference.filename}
                    <small>{(reference.sizeBytes/1_000_000).toFixed(2)} Mo</small>
                  </button>
                  <button type="button" className="creation-reference-remove" title={"Retirer "+reference.filename}
                    aria-label={"Retirer "+reference.filename} disabled={removing===reference.id||uploading}
                    onClick={()=>void removeReference(reference.id)}>×</button>
                </div>)}
              </div>}
              <label className={"creation-reference-upload"+(uploading||references.length>=8?" is-disabled":"")}>
                <span>{uploading?"Envoi en cours…":"+ Joindre un fichier"}</span>
                <input type="file" multiple accept=".pptx,.pdf,.png,.jpg,.jpeg,.webp,.html,.htm,.json"
                  aria-label="Joindre des exemples de diaporamas" disabled={uploading||references.length>=8}
                  onChange={e=>void attachFiles(e)}/>
              </label>
              <small>PowerPoint, PDF, image, HTML ou JSON ; 4 Mo par fichier. Les captures d’écran peuvent être examinées directement par l’IA. Les fichiers sont enregistrés indépendamment du texte ci-dessus.</small>
            </div>
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
