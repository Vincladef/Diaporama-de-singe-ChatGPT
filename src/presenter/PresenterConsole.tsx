import { useEffect, useMemo, useRef, useState } from "react";
import { SlideThumbnail } from "../editor/SlideThumbnail";
import type { PlaybackPosition } from "../animation/timeline";
import { isSessionId, presenterChannel, type PresenterMessage, type SessionSlide } from "./session";

type Show = { title: string; slides: SessionSlide[] };
const formatDuration = (seconds: number) =>
  [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(value => String(value).padStart(2, "0")).join(":");

/** Separate browser window: notes never enter the projected view. */
export function PresenterConsole() {
  const sessionId = useMemo(() => decodeURIComponent(window.location.hash.slice(1)), []);
  const [show, setShow] = useState<Show | null>(null);
  const [position, setPosition] = useState<PlaybackPosition>({ slide: 0, reveal: 0 });
  const [blackout, setBlackout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ended, setEnded] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const channel = useRef<BroadcastChannel | null>(null);
  const connected = useRef(false);

  useEffect(() => {
    if (!isSessionId(sessionId)) return;
    const bus = new BroadcastChannel(presenterChannel(sessionId));
    channel.current = bus;
    bus.onmessage = (event: MessageEvent<PresenterMessage>) => {
      const message = event.data;
      if (!message || message.sessionId !== sessionId) return;
      if (message.type === "init" && Array.isArray(message.slides)) {
        connected.current = true;
        setEnded(false);
        setShow({ title: message.title, slides: message.slides });
        setPosition(message.position);
        setBlackout(message.blackout);
        setBusy(message.busy);
      } else if (message.type === "state") {
        setPosition(message.position);
        setBlackout(message.blackout);
        setBusy(message.busy);
      } else if (message.type === "close") {
        connected.current = false;
        setShow(null);
        setEnded(true);
      }
    };
    const hello = () => {
      if (!connected.current) bus.postMessage({ type: "hello", sessionId } satisfies PresenterMessage);
    };
    hello();
    const retry = window.setInterval(hello, 900);
    return () => { window.clearInterval(retry); bus.close(); channel.current = null; };
  }, [sessionId]);

  useEffect(() => {
    if (!show || paused) return;
    const timer = window.setInterval(() => setSeconds(value => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [show, paused]);

  function send(command: "next" | "previous" | "goto" | "toggleBlackout", slide?: number) {
    if (!show || busy) return;
    channel.current?.postMessage({ type: "command", sessionId, command, slide } satisfies PresenterMessage);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement &&
          event.target.closest("input,select,textarea,[contenteditable=true]")) return;
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(event.key)) {
        event.preventDefault(); send("next");
      } else if (["ArrowLeft", "PageUp", "Backspace"].includes(event.key)) {
        event.preventDefault(); send("previous");
      } else if (event.key.toLowerCase() === "b") {
        event.preventDefault(); send("toggleBlackout");
      } else if (event.key === "Escape") {
        window.close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const active = show?.slides[position.slide];
  const following = show?.slides[position.slide + 1];
  const controls = <div className="presenter-console-timer">
    <strong aria-label="Durée de présentation">{formatDuration(seconds)}</strong>
    <button onClick={() => setPaused(value => !value)}>{paused ? "Reprendre" : "Pause"}</button>
    <button onClick={() => setSeconds(0)} aria-label="Réinitialiser le chronomètre">Réinitialiser</button>
  </div>;

  if (!show || !active) return <main className="presenter-console-waiting">
    <h1>Mode Présentateur</h1>
    <p>{ended ? "Cette présentation est terminée." :
      isSessionId(sessionId) ? "Connexion à la présentation en cours…" :
      "Lien de présentation invalide."}</p>
    <button onClick={() => window.close()}>Fermer cette fenêtre</button>
  </main>;

  return <main className="presenter-console">
    <header className="presenter-console-header">
      <div className="presenter-console-title">
        <strong>{show.title}</strong><span>Mode Présentateur · fenêtre privée</span>
      </div>
      <button onClick={() => window.close()} aria-label="Fermer les notes du présentateur">Fermer</button>
    </header>
    <div className="presenter-console-columns">
      <section className="presenter-console-left" aria-label="Commandes et aperçu">
        {controls}
        <label className="presenter-console-slide-label" htmlFor="presenter-slide-select">Diapositive</label>
        <select id="presenter-slide-select" value={position.slide}
          onChange={event => send("goto", Number(event.target.value))}>
          {show.slides.map((slide, index) => <option value={index} key={slide.id}>
            Diapositive {index + 1} sur {show.slides.length}
          </option>)}
        </select>
        <div className="presenter-console-preview">
          <SlideThumbnail document={active.document} index={position.slide + 1}/>
        </div>
        <div className="presenter-console-next">
          <span>Diapositive suivante</span>
          {following ? <button onClick={() => send("goto", position.slide + 1)}
              aria-label="Aller à la diapositive suivante">
            <SlideThumbnail document={following.document} index={position.slide + 2}/>
          </button> : <p>Fin du diaporama</p>}
        </div>
        <nav className="presenter-console-navigation" aria-label="Naviguer dans le diaporama">
          <button onClick={() => send("previous")} disabled={busy || (position.slide === 0 && position.reveal === 0)}>
            ← Précédent
          </button>
          <button onClick={() => send("next")} disabled={busy}>Suivant →</button>
        </nav>
      </section>
      <section className="presenter-console-right" aria-label="Notes du présentateur">
        <header className="presenter-console-notes-heading">
          <div><strong>Notes du présentateur</strong>
            <span>Diapositive {position.slide + 1} sur {show.slides.length}</span></div>
          <div className="presenter-console-font">
            <button aria-label="Réduire la taille des notes"
              onClick={() => setFontSize(size => Math.max(12, size - 2))}>−</button>
            <button aria-label="Augmenter la taille des notes"
              onClick={() => setFontSize(size => Math.min(30, size + 2))}>+</button>
          </div>
        </header>
        <div className="presenter-console-notes" style={{ fontSize }}>
          {active.notes?.trim() || <span className="presenter-console-placeholder">
            Aucune note pour cette diapositive.
          </span>}
        </div>
        <footer className="presenter-console-foot">
          <button onClick={() => send("toggleBlackout")}>
            {blackout ? "Rallumer l'écran public" : "Écran public noir (B)"}
          </button>
          <span>Seule la fenêtre des diapositives doit être partagée en visioconférence.</span>
        </footer>
      </section>
    </div>
  </main>;
}
