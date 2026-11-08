import { useEffect, useMemo, useRef, useState } from "react";
import { SlideDocumentSchema, type SlideDocument, type SlideElement } from "./domain/slide";
import { renderSlideHtml } from "./engine/render";
import { exportPowerPoint, type ExportReport, type PowerPointMode } from "./export/pptx";
import { ApiError, command, listPresentations, readPresentation, type DeckSummary, type PresentationDetail, type SlideRecord } from "./lib/api";

const SESSION_KEY = "diaporama-chatgpt-owner-token";
const DECK_KEY = "diaporama-chatgpt-current-deck";
type EditorTab = "html" | "css" | "elements";

function Canvas({ document }: { document: SlideDocument }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) setWidth(entries[0].contentRect.width);
    });
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  const srcDoc = useMemo(() => renderSlideHtml(document), [document]);
  const scale = width / document.canvas.width;
  return (
    <div className="canvas-box" ref={box} style={{ aspectRatio: document.canvas.width + " / " + document.canvas.height }}>
      <iframe
        title="Aperçu sécurisé de la diapositive"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        style={{ width: document.canvas.width, height: document.canvas.height, transform: "scale(" + scale + ")", transformOrigin: "top left" }}
      />
    </div>
  );
}

function ErrorMessage({ text, clear }: { text: string; clear: () => void }) {
  if (!text) return null;
  return <div role="alert" className="error-line">{text} <button className="text-btn" onClick={clear}>Fermer</button></div>;
}

export default function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem(SESSION_KEY) ?? "");
  const [entry, setEntry] = useState("");
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [current, setCurrent] = useState<PresentationDetail | null>(null);
  const [slideId, setSlideId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SlideDocument | null>(null);
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<EditorTab>("html");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [exportMode, setExportMode] = useState<PowerPointMode>("faithful");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [exportReport, setExportReport] = useState<ExportReport | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listPresentations(token).then(items => {
      if (cancelled) return;
      setDecks(items);
      const remembered = sessionStorage.getItem(DECK_KEY);
      if (remembered && items.some(item => item.id === remembered)) {
        void readPresentation(token, remembered).then(data => {
          if (!cancelled) {
            setCurrent(data);
            const first = data.slides[0];
            setSlideId(first?.id ?? null);
            setDraft(first?.document ?? null);
            setNotes(first?.notes ?? "");
            setDirty(false);
          }
        }).catch(e => { if (!cancelled) setError(String(e.message ?? e)); });
      }
    }).catch(e => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : "Accès impossible.");
      if (e instanceof ApiError && e.status === 401) { sessionStorage.removeItem(SESSION_KEY); setToken(""); }
    });
    return () => { cancelled = true; };
  }, [token]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    const key = entry.trim();
    if (!key) return;
    setLoginBusy(true); setError("");
    try {
      const items = await listPresentations(key);
      sessionStorage.setItem(SESSION_KEY, key);
      setDecks(items);
      setEntry(""); setToken(key);
    } catch (e) { setError(e instanceof Error ? e.message : "Connexion impossible."); }
    finally { setLoginBusy(false); }
  }

  function logout() {
    if (dirty && !window.confirm("Quitter sans enregistrer les modifications ?")) return;
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(DECK_KEY);
    setToken(""); setDecks([]); setCurrent(null); setSlideId(null); setDraft(null); setNotes(""); setDirty(false);
  }

  function pickSlide(slide?: SlideRecord) {
    setSlideId(slide?.id ?? null);
    setDraft(slide ? structuredClone(slide.document) : null);
    setNotes(slide?.notes ?? "");
    setSelected(null); setDirty(false); setTab("html");
  }
  function confirmLeave() { return !dirty || window.confirm("Quitter sans enregistrer les modifications ?"); }
  async function refreshList() { setDecks(await listPresentations(token)); }
  async function loadDeck(id: string, preferred?: string) {
    const detail = await readPresentation(token, id);
    setCurrent(detail);
    sessionStorage.setItem(DECK_KEY, id);
    pickSlide(detail.slides.find(s => s.id === preferred) ?? detail.slides[0]);
  }
  async function openDeck(id: string) {
    if (!confirmLeave()) return;
    setBusy(true); setError("");
    try { await loadDeck(id); } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  }
  async function createDeck() {
    const title = window.prompt("Titre de la présentation", "Sans titre");
    if (!title?.trim() || !confirmLeave()) return;
    setBusy(true); setError("");
    try {
      const response = await command<{ presentation: { id: string } }>(token, { action: "createPresentation", title: title.trim() });
      await refreshList(); await loadDeck(response.presentation.id);
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  }
  async function renameDeck() {
    if (!current) return;
    const title = window.prompt("Nouveau titre", current.presentation.title);
    if (!title?.trim()) return;
    setBusy(true); setError("");
    try {
      await command(token, { action: "renamePresentation", id: current.presentation.id, title: title.trim() });
      setCurrent({ ...current, presentation: { ...current.presentation, title: title.trim() } });
      await refreshList();
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  }
  async function deleteDeck() {
    if (!current || !window.confirm("Supprimer cette présentation et toutes ses diapositives ?")) return;
    setBusy(true); setError("");
    try {
      await command(token, { action: "deletePresentation", id: current.presentation.id });
      setCurrent(null); setDraft(null); setDirty(false); setSlideId(null); sessionStorage.removeItem(DECK_KEY);
      await refreshList();
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  }
  async function slideAction(action: "addSlide" | "duplicateSlide" | "deleteSlide") {
    if (!current || !confirmLeave()) return;
    const currentId = current.presentation.id;
    if (action === "deleteSlide" && !window.confirm("Supprimer cette diapositive ?")) return;
    if (action !== "addSlide" && !slideId) return;
    setBusy(true); setError("");
    try {
      const output = await command<{ slide?: { id: string } }>(token, {
        action, ...(action === "addSlide" ? { presentationId: currentId } : { id: slideId }),
      });
      await loadDeck(currentId, action === "deleteSlide" ? undefined : output.slide?.id);
      await refreshList();
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  }
  function editDocument(next: SlideDocument) { setDraft(next); setDirty(true); }
  function updateFreeform(part: "html" | "css", value: string) {
    if (!draft) return;
    const freeform = { html: draft.freeform?.html ?? "", css: draft.freeform?.css ?? "", [part]: value };
    editDocument({ ...draft, freeform, mode: draft.elements.length ? "hybrid" : "freeform" });
  }
  function addObject(type: "text" | "image" | "shape") {
    if (!draft) return;
    const src = type === "image" ? window.prompt("Adresse HTTPS de l'image") : null;
    if (type === "image" && !src) return;
    const id = crypto.randomUUID();
    const element: SlideElement = {
      id, type,
      ...(type === "text" ? { text: "Nouveau texte" } : {}),
      ...(type === "image" ? { src: src ?? "" } : {}),
      styles: type === "text"
        ? { top: "120px", left: "130px", fontSize: "84px", fontFamily: "Georgia, serif", color: "#192a21", width: "1450px" }
        : type === "image"
        ? { top: "220px", left: "130px", width: "840px", height: "500px", objectFit: "cover" }
        : { top: "260px", left: "200px", width: "520px", height: "260px", backgroundColor: "#a4bdac", borderRadius: "8px" },
    };
    editDocument({ ...draft, mode: draft.mode === "freeform" ? "hybrid" : draft.mode, elements: [...draft.elements, element] });
    setTab("elements"); setSelected(id);
  }
  function updateObject(id: string, patch: Partial<SlideElement>) {
    if (!draft) return;
    editDocument({ ...draft, elements: draft.elements.map(item => item.id === id ? { ...item, ...patch } : item) });
  }
  function deleteObject(id: string) {
    if (!draft) return;
    editDocument({ ...draft, elements: draft.elements.filter(item => item.id !== id && item.parentId !== id) });
    setSelected(null);
  }
  async function save() {
    if (!draft || !slideId || !current) return;
    const check = SlideDocumentSchema.safeParse(draft);
    if (!check.success) { setError("Document invalide : " + check.error.issues[0]?.message); return; }
    const old = current.slides.find(s => s.id === slideId);
    if (!old) return;
    setBusy(true); setError("");
    try {
      const result = await command<{ slide: { revision: number; updated_at: string } }>(token, {
        action: "saveSlide", id: slideId, revision: old.revision, document: check.data, notes,
      });
      setCurrent({
        ...current,
        slides: current.slides.map(s => s.id === slideId
          ? { ...s, document: check.data, notes, revision: result.slide.revision, updated_at: result.slide.updated_at }
          : s),
      });
      setDirty(false);
    } catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { setBusy(false); }
  }

  async function downloadPowerPoint() {
    if (!current || exportBusy) return;
    if (dirty) { setError("Enregistrez vos modifications avant l'exportation."); return; }
    setExportBusy(true); setExportReport(null); setExportProgress("Préparation…"); setError("");
    try {
      const report = await exportPowerPoint(current, exportMode, ({ completed, total }) =>
        setExportProgress("Diapositive " + completed + "/" + total));
      setExportReport(report);
      setExportProgress("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'exportation n'a pas abouti.");
      setExportProgress("");
    } finally { setExportBusy(false); }
  }

  const active = current?.slides.find(s => s.id === slideId);
  const chosen = draft?.elements.find(e => e.id === selected);
  const statusText = dirty ? "Modifications non enregistrées" : "Enregistré";

  if (!token) return (
    <main className="login-screen">
      <form className="login-card" onSubmit={login}>
        <div className="brand-chip">◆</div>
        <h1>Diaporama de singe</h1>
        <p>Espace personnel · édition ChatGPT</p>
        <label htmlFor="access-code">Code d'accès privé</label>
        <input id="access-code" type="password" autoComplete="off" value={entry} onChange={e => setEntry(e.target.value)} placeholder="Code d'accès" autoFocus />
        <button type="submit" className="primary" disabled={loginBusy || !entry.trim()}>{loginBusy ? "Vérification…" : "Ouvrir l'atelier"}</button>
        <ErrorMessage text={error} clear={() => setError("")} />
        <small>Ce code reste dans votre session de navigateur. Les présentations sont conservées dans Neon.</small>
      </form>
    </main>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="identity"><span className="identity-mark">◆</span><strong>Diaporama<br />de singe</strong></div>
        <div className="edition">ÉDITION CHATGPT</div>
        <div className="list-heading"><span>PRÉSENTATIONS</span><button onClick={() => void createDeck()} disabled={busy} title="Nouvelle présentation">+</button></div>
        <div className="deck-list">
          {decks.map(deck =>
            <button key={deck.id} className={"deck-item " + (current?.presentation.id === deck.id ? "active" : "")}
              onClick={() => void openDeck(deck.id)} disabled={busy}>
              <span className="deck-name">{deck.title}</span>
              <small>{deck.slide_count} diapo{deck.slide_count !== 1 ? "s" : ""}</small>
            </button>
          )}
          {decks.length === 0 && <p className="sidebar-hint">Aucune présentation</p>}
        </div>
        <div className="sidebar-bottom">
          <span className="connected-dot" /> Stockage privé
          <button className="text-btn logout" onClick={logout}>Quitter</button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">{current ? current.presentation.title : "Mes présentations"}</div>
          {current && <div className="header-actions">
            <button className="subtle-btn" onClick={() => void renameDeck()} disabled={busy}>Renommer</button>
            <button className="subtle-btn danger-text" onClick={() => void deleteDeck()} disabled={busy}>Supprimer</button>
          </div>}
        </header>
        <ErrorMessage text={error} clear={() => setError("")} />
        {!current ? (
          <section className="home-content">
            <span className="eyebrow">ATELIER DE CRÉATION · HTML/CSS</span>
            <h1>Vos présentations.</h1>
            <p>Créez une présentation, puis composez librement chaque diapositive.</p>
            <button className="primary" onClick={() => void createDeck()} disabled={busy}>+ Nouvelle présentation</button>
          </section>
        ) : (
          <div className="editing-area">
            <div className="editor-topline">
              <div><strong>{current.presentation.title}</strong><span> {current.slides.length} diapositive{current.slides.length > 1 ? "s" : ""}</span></div>
              <div className="save-row">
                <span className={dirty ? "dirty-indicator" : "saved-indicator"}>{statusText}</span>
                <button className="primary small-primary" onClick={() => void save()} disabled={!dirty || busy || !active || exportBusy}>Enregistrer</button>
                <label className="export-mode-label" htmlFor="export-mode">Export
                  <select id="export-mode" value={exportMode} disabled={exportBusy || busy}
                    onChange={e => setExportMode(e.target.value as PowerPointMode)}>
                    <option value="faithful">Visuel fidèle</option>
                    <option value="editable">Objets modifiables</option>
                  </select>
                </label>
                <button className="subtle-btn export-action" onClick={() => void downloadPowerPoint()} disabled={exportBusy || busy || dirty || !current.slides.length}>
                  {exportBusy ? (exportProgress || "Export en cours…") : "Télécharger PPTX"}
                </button>
              </div>
            </div>
            {exportReport && <div className="export-report" role="status">
              <strong>PowerPoint prêt : {exportReport.fileName}</strong>
              <span>{exportReport.slideCount} diapositive{exportReport.slideCount > 1 ? "s" : ""} · {exportReport.mode === "faithful" ? "Rendu en images" : "Éléments éditables lorsque compatibles"}.</span>
              {exportReport.warnings.length > 0 && <details><summary>{exportReport.warnings.length} précision{exportReport.warnings.length > 1 ? "s" : ""} sur la compatibilité</summary>
                <ul>{exportReport.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
              </details>}
              <span>Pour Google Slides, importez ce fichier PPTX dans <a target="_blank" rel="noopener noreferrer" href="https://drive.google.com/drive/u/0/my-drive">Google Drive</a>, puis ouvrez-le avec Google Slides. L'édition directe dans votre compte Google n'est pas encore connectée.</span>
            </div>}
            <div className="editor-layout">
              <aside className="slide-rail">
                <div className="rail-heading"><span>DIAPOSITIVES</span><button onClick={() => void slideAction("addSlide")} disabled={busy}>+</button></div>
                {current.slides.map((s, i) =>
                  <button key={s.id} className={"slide-tile " + (s.id === slideId ? "selected" : "")} onClick={() => {
                    if (confirmLeave()) pickSlide(s);
                  }}>
                    <div className="slide-mini">{String(i + 1).padStart(2, "0")}</div>
                    <span>Diapositive {i + 1}</span>
                  </button>
                )}
                {active && <div className="rail-tools">
                  <button onClick={() => void slideAction("duplicateSlide")} disabled={busy}>Dupliquer</button>
                  <button onClick={() => void slideAction("deleteSlide")} disabled={busy} className="danger-text">Supprimer</button>
                </div>}
              </aside>
              <section className="editor-main">
                {draft ? <>
                  <div className="section-caption"><span>APERÇU · {draft.canvas.width} × {draft.canvas.height}</span><span>HTML/CSS</span></div>
                  <Canvas document={draft} />
                  <div className="canvas-footer">Aperçu isolé : JavaScript désactivé. Les modifications s'affichent immédiatement.</div>
                  <div className="notes-row">
                    <label htmlFor="slide-notes">Notes du présentateur</label>
                    <textarea id="slide-notes" rows={3} value={notes} onChange={e => { setNotes(e.target.value); setDirty(true); }} placeholder="Notes facultatives…" />
                  </div>
                </> : <div className="no-slide">Aucune diapositive. <button className="primary" onClick={() => void slideAction("addSlide")}>Ajouter une diapositive</button></div>}
              </section>
              {draft && <aside className="inspector">
                <div className="inspector-heading">Composition</div>
                <div className="editor-tabs">
                  <button className={tab === "html" ? "current" : ""} onClick={() => setTab("html")}>HTML</button>
                  <button className={tab === "css" ? "current" : ""} onClick={() => setTab("css")}>CSS</button>
                  <button className={tab === "elements" ? "current" : ""} onClick={() => setTab("elements")}>Objets</button>
                </div>
                {tab === "html" && <div className="property-panel">
                  <label htmlFor="html-editor">Code HTML de la diapositive</label>
                  <textarea id="html-editor" className="code-editor" spellCheck={false}
                    placeholder="<h1>Votre composition</h1>" value={draft.freeform?.html ?? ""}
                    onChange={e => updateFreeform("html", e.target.value)} />
                  <p className="field-help">Structure libre. Le HTML est rendu dans un cadre sécurisé.</p>
                </div>}
                {tab === "css" && <div className="property-panel">
                  <label htmlFor="css-editor">Styles CSS libres</label>
                  <textarea id="css-editor" className="code-editor" spellCheck={false}
                    placeholder="h1 { font-size: 100px; }" value={draft.freeform?.css ?? ""}
                    onChange={e => updateFreeform("css", e.target.value)} />
                  <p className="field-help">Toutes les compositions CSS sont possibles ; les scripts restent désactivés.</p>
                </div>}
                {tab === "elements" && <div className="property-panel">
                  <div className="object-buttons">
                    <button onClick={() => addObject("text")}>+ Texte</button>
                    <button onClick={() => addObject("image")}>+ Image</button>
                    <button onClick={() => addObject("shape")}>+ Forme</button>
                  </div>
                  <div className="object-list">
                    {draft.elements.map(item => <button key={item.id} className={selected === item.id ? "selected" : ""}
                      onClick={() => setSelected(item.id)}>{item.type === "text" ? "Texte" : item.type === "image" ? "Image" : item.type === "shape" ? "Forme" : item.type} · {item.id.slice(0, 8)}</button>)}
                  </div>
                  {chosen && <>
                    {chosen.type === "text" && <label>Texte <textarea rows={3} value={chosen.text ?? ""} onChange={e => updateObject(chosen.id, { text: e.target.value })} /></label>}
                    {chosen.type === "image" && <label>Adresse de l'image <input type="url" value={chosen.src ?? ""} onChange={e => updateObject(chosen.id, { src: e.target.value })} /></label>}
                    {(["left", "top", "width", "height", "fontSize", "color", "backgroundColor"] as const).map(prop =>
                      <label key={prop}>{({ left: "Gauche", top: "Haut", width: "Largeur", height: "Hauteur", fontSize: "Taille du texte", color: "Couleur", backgroundColor: "Fond" })[prop]}
                        <input value={String(chosen.styles[prop] ?? "")} placeholder="Ex. 120px" onChange={e => updateObject(chosen.id, { styles: { ...chosen.styles, [prop]: e.target.value } })} /></label>
                    )}
                    <button className="subtle-btn danger-text" onClick={() => deleteObject(chosen.id)}>Supprimer cet objet</button>
                  </>}
                  {draft.elements.length === 0 && <p className="field-help">Ajoutez un objet pour le modifier individuellement ; HTML/CSS reste entièrement libre.</p>}
                </div>}
              </aside>}
            </div>
          </div>
        )}
        <footer className="footer">Diaporama de singe · Version ChatGPT <span>Neon · Netlify</span></footer>
      </main>
    </div>
  );
}
