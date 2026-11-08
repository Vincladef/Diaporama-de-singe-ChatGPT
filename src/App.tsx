import { useEffect, useState } from "react";
import { checkHealth, type HealthResult } from "./lib/api";

type ApiState = { state: "loading" } | { state: "error" } | { state: "done"; data: HealthResult };

function Status({ api }: { api: ApiState }) {
  const live = api.state === "done" && api.data.ok && api.data.schema === "ready";
  const label = api.state === "loading" ? "Vérification…" : live ? "Neon connecté" :
    api.state === "done" && api.data.ok ? "Schéma à vérifier" : "Connexion à vérifier";
  return (
    <div className="health-indicator" aria-live="polite">
      <span className={live ? "health-dot health-dot--online" : "health-dot"} />
      <span>{label}</span>
    </div>
  );
}

export default function App() {
  const [api, setApi] = useState<ApiState>({ state: "loading" });
  useEffect(() => {
    const ctrl = new AbortController();
    checkHealth(ctrl.signal).then(data => setApi({ state: "done", data }))
      .catch(error => { if (error?.name !== "AbortError") setApi({ state: "error" }); });
    return () => ctrl.abort();
  }, []);

  return (
    <div className="app">
      <aside className="sidebar">
        <a className="identity" href="/" aria-label="Accueil Diaporama de singe">
          <span className="identity-mark" aria-hidden="true"><span /><span /></span>
          <span>Diaporama <br />de singe</span>
        </a>
        <div className="edition">ÉDITION CHATGPT</div>
        <nav aria-label="Navigation principale">
          <div className="nav-item nav-item--current"><span className="nav-icon" aria-hidden="true">▤</span>Présentations</div>
        </nav>
        <div className="sidebar-bottom">
          <Status api={api} />
          <span className="sidebar-footnote">Fondations techniques · v0.1</span>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar"><span>Présentations</span><span className="topbar-label">Espace personnel</span></header>
        <section className="page">
          <div className="page-intro">
            <div className="eyebrow">DIAPORAMA DE SINGE / CHATGPT</div>
            <h1>Votre espace de présentation.</h1>
            <p>Un atelier de création visuelle pensé pour les présentations HTML/CSS et leur pilotage par intelligence artificielle.</p>
          </div>
          <div className="section-heading"><h2>Mes présentations</h2></div>
          <div className="empty-state">
            <div className="empty-illustration" aria-hidden="true"><span className="illustration-page"/><span className="illustration-line"/><span className="illustration-block"/></div>
            <h3>Aucune présentation pour le moment</h3>
            <p>Les fondations sont installées. La création et l'édition de diapositives seront développées à la prochaine étape.</p>
          </div>
        </section>
        <footer className="footer"><span>Diaporama de singe · Version ChatGPT</span><span>GitHub · Netlify · Neon</span></footer>
      </main>
    </div>
  );
}
