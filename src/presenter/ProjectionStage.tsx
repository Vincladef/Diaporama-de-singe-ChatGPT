import { useCallback, useEffect, useRef, useState } from "react";
import type { SlideDocument } from "../domain/slide";
import { renderSlideHtml } from "../engine/render";
import { SlideAnimationPlayer } from "../animation/runtime";

export type PlayableSlide = { id: string; document: SlideDocument };
type Props = {
  slide: PlayableSlide;
  reveal: number;
  onAdvance?: () => void;
  onBusyChange?: (busy: boolean) => void;
  title?: string;
  onReady?: () => void;
  /** Key events inside the sandboxed iframe do not bubble to the parent window. */
  onEmbeddedKeyDown?: (event: KeyboardEvent) => void;
  /** Resolve a future click state instantly when used as a next-step preview. */
  animateTransitions?: boolean;
};

/**
 * Two-slot projector. The visible iframe stays on screen until another one has
 * been prepared. In particular, going BACK reuses the previous iframe and its
 * animation player instead of replacing it and waiting for a second load.
 *
 * A slide is considered ready after its HTML and embedded CSS are parsed. The
 * previous version waited up to 4.5 seconds for external images and fonts on
 * each transition; those resources now load independently of navigation.
 */
export function ProjectionStage({ slide, reveal, onAdvance, onBusyChange, title, onReady,
  onEmbeddedKeyDown, animateTransitions = true }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const frames = useRef<(HTMLIFrameElement | null)[]>([null, null]);
  const players = useRef<(SlideAnimationPlayer | null)[]>([null, null]);
  const activeIndex = useRef(0);
  const desired = useRef({ slide, reveal });
  desired.current = { slide, reveal };

  const busyCallback = useRef(onBusyChange);
  const readyCallback = useRef(onReady);
  const keyCallback = useRef(onEmbeddedKeyDown);
  busyCallback.current = onBusyChange;
  readyCallback.current = onReady;
  keyCallback.current = onEmbeddedKeyDown;

  // Token lets us distinguish the new srcDoc DOM from the old about:blank or
  // previous document while the browser is still loading external assets.
  const tokens = useRef(new WeakMap<SlideDocument, string>());
  const serial = useRef(0);
  const processing = useRef(new WeakSet<Document>());
  const keyListeners = useRef(new WeakSet<Document>());
  const activation = useRef(0);
  const tokenFor = useCallback((document: SlideDocument) => {
    let token = tokens.current.get(document);
    if (!token) {
      token = "singe-" + (++serial.current);
      tokens.current.set(document, token);
    }
    return token;
  }, []);

  const [slots, setSlots] = useState<[PlayableSlide | null, PlayableSlide | null]>([slide, null]);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const [visible, setVisible] = useState(0);
  const [ready, setReady] = useState(false);
  const [area, setArea] = useState({ width: 800, height: 500 });
  const last = useRef<{ id: string; reveal: number } | null>(null);

  const activate = useCallback((index: number, id: string, step: number) => {
    activeIndex.current = index;
    last.current = { id, reveal: step };
    setVisible(index);
    setReady(true);
    busyCallback.current?.(false);
    readyCallback.current?.();
  }, []);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const update = () => setArea({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const load = useCallback(async (index: number, id: string, document: SlideDocument) => {
    const iframe = frames.current[index];
    const dom = iframe?.contentDocument;
    if (!iframe || !dom?.body || dom.readyState === "loading" ||
      dom.body.dataset.singeProjectionToken !== tokenFor(document) ||
      processing.current.has(dom)) return;
    // This also works when the iframe currently holds the keyboard focus.
    if (!keyListeners.current.has(dom)) {
      dom.addEventListener("keydown", event => keyCallback.current?.(event), true);
      keyListeners.current.add(dom);
    }
    processing.current.add(dom);
    if (slotsRef.current[index]?.id !== id ||
      slotsRef.current[index]?.document !== document) return;

    players.current[index]?.dispose();
    const engine = new SlideAnimationPlayer(dom, document);
    players.current[index] = engine;
    const firstStep = desired.current.slide.id === id ? desired.current.reveal : 0;
    await engine.seek(firstStep, { animate: false });

    // A neighboring slide may have been requested while this one prepared.
    if (slotsRef.current[index]?.id !== id ||
      slotsRef.current[index]?.document !== document ||
      desired.current.slide.id !== id) return;

    const latestStep = desired.current.reveal;
    if (firstStep !== latestStep) await engine.seek(latestStep, { animate: false });
    if (desired.current.slide.id === id && slotsRef.current[index]?.document === document) {
      activate(index, id, latestStep);
    }
  }, [activate, tokenFor]);

  // Returning to a cached frame must not depend on iframe onLoad, which will
  // not necessarily fire again when React renders an identical srcDoc string.
  useEffect(() => {
    const current = slotsRef.current[activeIndex.current];
    if (current?.id === slide.id && current.document === slide.document) return;
    const standby = 1 - activeIndex.current;
    const cached = slotsRef.current[standby];

    if (cached?.id === slide.id && cached.document === slide.document) {
      const engine = players.current[standby];
      if (engine) {
        const request = ++activation.current;
        const step = desired.current.reveal;
        void engine.seek(step, { animate: false }).then(() => {
          if (request !== activation.current ||
            desired.current.slide.id !== slide.id ||
            slotsRef.current[standby]?.document !== slide.document) return;
          activate(standby, slide.id, desired.current.reveal);
        });
      } else {
        void load(standby, slide.id, slide.document);
      }
      return;
    }

    ++activation.current;
    players.current[standby]?.dispose();
    players.current[standby] = null;
    setSlots(old => {
      const next: [PlayableSlide | null, PlayableSlide | null] = [old[0], old[1]];
      next[standby] = slide;
      return next;
    });
  }, [slide.id, slide.document, activate, load]);

  // DOMContentLoaded happens before image/font load, but iframe onLoad happens
  // after them. Poll only while an iframe is being prepared so remote images
  // cannot block slide navigation for seconds.
  useEffect(() => {
    let timer: number | undefined;
    const prepare = () => {
      slotsRef.current.forEach((entry, index) => {
        if (entry && !players.current[index]) void load(index, entry.id, entry.document);
      });
      if (slotsRef.current.every((entry, index) => !entry || players.current[index])) {
        window.clearInterval(timer);
      }
    };
    timer = window.setInterval(prepare, 25);
    prepare();
    return () => window.clearInterval(timer);
  }, [slots, load]);

  useEffect(() => {
    const current = slotsRef.current[activeIndex.current];
    const engine = players.current[activeIndex.current];
    if (!ready || !engine || current?.id !== slide.id ||
      current.document !== slide.document) return;
    if (last.current?.id === slide.id && last.current.reveal === reveal) return;
    const animate = animateTransitions &&
      last.current?.id === slide.id && reveal === last.current.reveal + 1;
    last.current = { id: slide.id, reveal };
    void engine.seek(reveal, { animate, onBusy: state => busyCallback.current?.(state) });
  }, [slide.id, slide.document, reveal, ready, visible, animateTransitions]);

  useEffect(() => () => {
    players.current.forEach(p => p?.dispose());
    players.current = [null, null];
    // In React StrictMode, effects are replayed on the same iframe document.
    // Allow its player to be initialized again after the development-only cleanup.
    processing.current = new WeakSet<Document>();
    busyCallback.current?.(false);
  }, []);

  return <div className="projection-stage" ref={host} data-testid="projection-stage"
    aria-label={title ?? "Diapositive projetée"} onClick={onAdvance}
    style={{ cursor: onAdvance ? "pointer" : "default" }}>
    {slots.map((entry, index) => {
      if (!entry) return null;
      const { width, height } = entry.document.canvas;
      const scale = Math.max(.03, Math.min(area.width / width, area.height / height));
      // Unique token is embedded in the actual document body and verifies that
      // the parsed iframe content matches this slot before initialization.
      const html = renderSlideHtml(entry.document).replace(
        "<body>", '<body data-singe-projection-token="' + tokenFor(entry.document) + '">'
      );
      return <div key={index} className="projection-artboard" aria-hidden={index !== visible}
        style={{
          width: width * scale, height: height * scale, position: "absolute",
          left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          opacity: index === visible ? 1 : 0,
          zIndex: index === visible ? 2 : 1,
          transition: "opacity 90ms ease-out",
          pointerEvents: "none", background: "#101715",
        }}>
        <iframe ref={node => { frames.current[index] = node; }}
          title={title ?? "Diapositive"} srcDoc={html}
          sandbox="allow-same-origin" referrerPolicy="no-referrer" loading="eager"
          onLoad={() => void load(index, entry.id, entry.document)}
          style={{
            display: "block", width, height, position: "absolute", inset: 0,
            border: 0, transform: "scale(" + scale + ")",
            transformOrigin: "top left", pointerEvents: "none",
            background: "#101715",
          }} />
      </div>;
    })}
    {!ready && <div className="projection-loading">Préparation de la diapositive…</div>}
  </div>;
}
