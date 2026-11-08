import { useMemo } from "react";
import type { PresentationDetail } from "../lib/api";
import { auditDeck } from "./audit";

type Props={detail:PresentationDetail;onClose:()=>void;onFocus:(index:number)=>void};
const severityLabel={error:"À corriger",warning:"À vérifier",info:"Information"} as const;
export function QualityStudio({detail,onClose,onFocus}:Props){
  const summary=useMemo(()=>auditDeck(detail.slides),[detail]);
  return <div className="studio-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="studio-dialog quality-dialog" role="dialog" aria-modal="true"
      aria-label="Contrôle qualité des diapositives">
      <header className="studio-header"><div><strong>Vérifier la présentation</strong>
        <span>{detail.presentation.title} · Contrôle local avant projection ou export</span></div>
        <button className="studio-close" onClick={onClose} aria-label="Fermer la vérification">×</button></header>
      <div className="quality-content">
        <div className="quality-overview">
          <div><strong>{summary.slideCount}</strong><span>diapositives</span></div>
          <div><strong>{summary.errorCount}</strong><span>à corriger</span></div>
          <div><strong>{summary.warningCount}</strong><span>à vérifier</span></div>
          <div><strong>{summary.infoCount}</strong><span>précisions</span></div>
        </div>
        <p className="quality-lead">{summary.readyToProject?
          "Aucun blocage structurel détecté. Contrôlez la lisibilité, les images externes et le résultat de l'export sur l'appareil cible.":
          "Des problèmes susceptibles d'empêcher une projection correcte ont été détectés. Sélectionnez une diapositive pour la corriger."}</p>
        {summary.findings.length===0?<div className="quality-empty">Aucun problème détecté par les contrôles automatiques.</div>:
          <div className="quality-findings">
            {summary.findings.map((finding,i)=><div key={i}
              className={"quality-finding quality-"+finding.severity}>
              <div className="quality-finding-type">{severityLabel[finding.severity]}</div>
              <div className="quality-finding-body"><strong>Diapositive {finding.slideIndex+1}</strong>
                <p>{finding.message}</p></div>
              <button className="subtle-btn" onClick={()=>onFocus(finding.slideIndex)}>Voir</button>
            </div>)}
          </div>}
        <p className="quality-disclaimer">Ce contrôle examine le document JSON et les styles. Il ne remplace pas l'essai visuel en plein écran ; les problèmes de chargement d'une image distante et de polices ne peuvent pas tous être détectés hors ligne.</p>
      </div>
      <footer className="import-footer"><span>Le moteur graphique, le MCP et l'éditeur lisent le même contrat de diapositives.</span>
        <button className="subtle-btn" onClick={onClose}>Fermer</button></footer>
    </section>
  </div>;
}
