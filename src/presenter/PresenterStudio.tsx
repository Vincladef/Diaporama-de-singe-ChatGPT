import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PresentationDetail } from "../lib/api";
import { buildPlaybackPlan, gotoSlide, nextPosition, previousPosition,
  type PlaybackPosition } from "../animation/timeline";
import { ProjectionStage } from "./ProjectionStage";
import { presenterChannel, type PresenterMessage, type SessionSlide } from "./session";

export type PresentMode = "slides" | "speaker";
type Props = { detail: PresentationDetail; initialSlideId?: string | null;
  mode: PresentMode; sessionId: string; initialPopup?: Window | null; onClose: () => void };

/** Only the projected slide is mounted in this window.
 * The private speaker notes are rendered exclusively in /presenter.
 */
export function PresenterStudio({ detail, initialSlideId, mode, sessionId, initialPopup, onClose }: Props) {
  const [snapshot] = useState(() => ({
    title: detail.presentation.title,
    slides: detail.slides.map((s): SessionSlide => ({
      id: s.id, document: structuredClone(s.document), notes: s.notes
    }))
  }));
  const documents = useMemo(() => snapshot.slides.map(s => s.document), [snapshot]);
  const first = Math.max(0, snapshot.slides.findIndex(s => s.id === initialSlideId));
  const [position, setPosition] = useState<PlaybackPosition>({ slide: first, reveal: 0 });
  const [blackout, setBlackout] = useState(false);
  const [busy, setBusy] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const popup = useRef<Window | null>(initialPopup ?? null);
  const positionRef = useRef(position);
  const blackoutRef = useRef(blackout);
  const busyRef = useRef(busy); // Snapshot for private-console handshakes, never a navigation lock.
  const publicRoot = useRef<HTMLElement>(null);
  const embeddedKey = useRef<(event: KeyboardEvent) => void>(() => {});
  const enteredFullscreen = useRef(Boolean(document.fullscreenElement));
  const ending = useRef(false);
  positionRef.current = position;
  blackoutRef.current = blackout;
  busyRef.current = busy;

  // An input must never be discarded while a reveal transition is playing.
  // The animation player cancels the previous seek when the desired position changes.
  const webCommand = useCallback((action:"next"|"previous") => {
    window.dispatchEvent(new CustomEvent("singe-web-command",{detail:action}));
    channel.current?.postMessage({type:"web-command",sessionId,command:action} satisfies PresenterMessage);
  },[sessionId]);
  const next = useCallback(() => {
    if(documents[positionRef.current.slide]?.webPage){webCommand("next");return;}
    setPosition(old => nextPosition(documents, old));
  }, [documents,webCommand]);
  const previous = useCallback(() => {
    if(documents[positionRef.current.slide]?.webPage){webCommand("previous");return;}
    setPosition(old => previousPosition(documents, old));
  }, [documents,webCommand]);

  const close = useCallback(() => {
    if (ending.current) return;
    ending.current = true;
    channel.current?.postMessage({ type: "close", sessionId } satisfies PresenterMessage);
    try { popup.current?.close(); } catch { /* blocked cross-window close */ }
    // Do not mount another presentation while the previous fullscreen session
    // is still exiting. Its late fullscreenchange could close the next session.
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {}).finally(onClose);
    } else {
      onClose();
    }
  }, [onClose, sessionId]);

  useEffect(() => {
    const bus = new BroadcastChannel(presenterChannel(sessionId));
    channel.current = bus;
    bus.onmessage = (event: MessageEvent<PresenterMessage>) => {
      const message = event.data;
      if (!message || message.sessionId !== sessionId) return;
      if (message.type === "hello" && mode === "speaker") {
        bus.postMessage({
          type: "init", sessionId, title: snapshot.title, slides: snapshot.slides,
          position: positionRef.current, blackout: blackoutRef.current, busy: busyRef.current
        } satisfies PresenterMessage);
      } else if (message.type === "command" && mode === "speaker") {
        if (message.command === "next") next();
        if (message.command === "previous") previous();
        if (message.command === "toggleBlackout") setBlackout(value => !value);
        if (message.command === "goto" &&
          typeof message.slide === "number" && Number.isInteger(message.slide) &&
          message.slide >= 0 && message.slide < documents.length) {
          setPosition(gotoSlide(documents, message.slide));
        }
      }
    };
    return () => { bus.close(); if (channel.current === bus) channel.current = null; };
  }, [mode, sessionId, snapshot, documents, next, previous]);

  useEffect(() => {
    channel.current?.postMessage({
      type: "state", sessionId, position, blackout, busy
    } satisfies PresenterMessage);
  }, [sessionId, position, blackout, busy]);

  useEffect(() => {
    const onFullscreen = () => {
      if (document.fullscreenElement) enteredFullscreen.current = true;
      else if (enteredFullscreen.current) close();
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    // If fullscreen was entered before the component was mounted, retain that state.
    if (document.fullscreenElement) enteredFullscreen.current = true;
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, [close]);

  // Entering fullscreen can leave keyboard focus on the editor behind the
  // overlay. Keep the projected root focused, including after window switches.
  useEffect(() => {
    const focusProjection = () => publicRoot.current?.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(focusProjection);
    window.addEventListener("focus", focusProjection);
    document.addEventListener("fullscreenchange", focusProjection);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("focus", focusProjection);
      document.removeEventListener("fullscreenchange", focusProjection);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof HTMLElement &&
          event.target.closest("input,textarea,select,[contenteditable=true]")) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(event.key)) {
        event.preventDefault(); next();
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(event.key)) {
        event.preventDefault(); previous();
      } else if (event.key === "Home") {
        event.preventDefault(); setPosition({ slide: 0, reveal: 0 });
      } else if (event.key === "End") {
        event.preventDefault(); setPosition({
          slide: documents.length - 1,
          reveal: buildPlaybackPlan(documents[documents.length - 1]!.animations).clicks.length
        });
      } else if (event.key.toLowerCase() === "b") {
        event.preventDefault(); setBlackout(value => !value);
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        void fullscreen();
      } else if (event.key.toLowerCase() === "n" && mode === "speaker") {
        // Reopen the private presenter console without displaying any public controls.
        event.preventDefault();
        openSpeaker();
      } else if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        const answer = window.prompt("Aller à la diapositive (1 à " +
          documents.length + ")", String(positionRef.current.slide + 1));
        if (answer !== null) {
          const index = Number(answer) - 1;
          if (Number.isInteger(index) && index >= 0 && index < documents.length) {
            setPosition(gotoSlide(documents, index));
          }
        }
      } else if (event.key === "Escape" && !document.fullscreenElement) {
        event.preventDefault(); close();
      }
    };
    embeddedKey.current = onKey;
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [documents, next, previous, close, mode]);

  async function fullscreen() {
    if (document.fullscreenElement) return;
    try { await document.documentElement.requestFullscreen(); }
    catch { /* The browser may deny fullscreen; F11 remains available. */ }
  }

  function openSpeaker() {
    if (popup.current && !popup.current.closed) {
      popup.current.focus(); return;
    }
    const opened = window.open("/presenter#" + encodeURIComponent(sessionId),
      "diaporama-presentateur-" + sessionId, "popup=yes,width=1050,height=740");
    if (!opened) return; // Pop-up permission can be retried with N, without public UI.
    popup.current = opened;
    opened.focus();
  }

  const active = snapshot.slides[position.slide]!;

  return <main ref={publicRoot} tabIndex={-1} className="presentation-public"
      role="dialog" aria-modal="true" aria-busy={busy} aria-label="Projection publique des diapositives"
      onPointerDownCapture={() => publicRoot.current?.focus({ preventScroll: true })}>
    <ProjectionStage slide={active} reveal={position.reveal} onAdvance={next}
      onBusyChange={setBusy} onEmbeddedKeyDown={event => embeddedKey.current(event)}
      title={"Diapositive " + (position.slide + 1)}/>
    {blackout && <div className="presentation-blackout" role="status"
      aria-label="Écran public noir" onClick={() => setBlackout(false)}/>}
  </main>;
}
