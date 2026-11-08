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
};

/**
 * Double-buffered projection. Keep the previous slide visible while the next
 * sandboxed document loads, settles its fonts/media and prepares its timeline.
 * Never expose a newly-created white iframe between slide changes.
 */
export function ProjectionStage({ slide, reveal, onAdvance, onBusyChange, title, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const frames = useRef<(HTMLIFrameElement | null)[]>([null, null]);
  const players = useRef<(SlideAnimationPlayer | null)[]>([null, null]);
  const activeIndex = useRef(0);
  const desired = useRef({ slide, reveal });
  desired.current = { slide, reveal };
  const busyCallback = useRef(onBusyChange);
  const readyCallback = useRef(onReady);
  busyCallback.current = onBusyChange;
  readyCallback.current = onReady;

  const [slots, setSlots] = useState<[PlayableSlide | null, PlayableSlide | null]>([slide, null]);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const [visible, setVisible] = useState(0);
  const [ready, setReady] = useState(false);
  const [area, setArea] = useState({ width: 800, height: 500 });
  const last = useRef<{ id: string; reveal: number } | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const update = () => setArea({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const current = slotsRef.current[activeIndex.current];
    if (current?.id === slide.id && current.document === slide.document) return;
    const standby = 1 - activeIndex.current;
    players.current[standby]?.dispose();
    players.current[standby] = null;
    setSlots(old => {
      const next: [PlayableSlide | null, PlayableSlide | null] = [...old];
      next[standby] = slide;
      return next;
    });
    // Deliberately DO NOT clear 'ready' or hide the current slide here.
  }, [slide.id, slide.document]);

  const load = useCallback(async (index: number, id: string, document: SlideDocument) => {
    const iframe = frames.current[index];
    const dom = iframe?.contentDocument;
    if (!iframe || !dom?.body) return;
    // The old frame stays visible. The standby iframe can never flash on stage.
    try {
      await Promise.race([
        Promise.all([
          dom.fonts.ready.catch(() => undefined),
          Promise.all([...dom.images].map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise<void>(resolve => {
              const done = () => resolve();
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
            });
          })),
        ]),
        new Promise<void>(resolve => window.setTimeout(resolve, 4500)),
      ]);
    } catch { /* A missing remote asset must not block navigation. */ }
    if (slotsRef.current[index]?.id !== id || slotsRef.current[index]?.document !== document) return;
    players.current[index]?.dispose();
    const engine = new SlideAnimationPlayer(dom, document);
    players.current[index] = engine;
    const requested = desired.current;
    const initialReveal = requested.slide.id === id ? requested.reveal : 0;
    await engine.seek(initialReveal, { animate: false });
    if (slotsRef.current[index]?.id !== id || desired.current.slide.id !== id ||
      slotsRef.current[index]?.document !== document) return;
    const count = desired.current.reveal;
    if (count !== initialReveal) await engine.seek(count, { animate: false });
    activeIndex.current = index;
    last.current = { id, reveal: count };
    setVisible(index);
    setReady(true);
    busyCallback.current?.(false);
    readyCallback.current?.();
  }, []);

  useEffect(() => {
    const current = slotsRef.current[activeIndex.current];
    const engine = players.current[activeIndex.current];
    if (!ready || !engine || current?.id !== slide.id) return;
    if (last.current?.id === slide.id && last.current.reveal === reveal) return;
    const animate = last.current?.id === slide.id && reveal === last.current.reveal + 1;
    last.current = { id: slide.id, reveal };
    void engine.seek(reveal, { animate, onBusy: state => busyCallback.current?.(state) });
  }, [slide.id, reveal, ready, visible]);

  useEffect(() => () => {
    players.current.forEach(p => p?.dispose());
    players.current = [null, null];
    busyCallback.current?.(false);
  }, []);

  return <div className="projection-stage" ref={host} data-testid="projection-stage"
    aria-label={title ?? "Diapositive projetée"} onClick={onAdvance}
    style={{ cursor: onAdvance ? "pointer" : "default" }}>
    {slots.map((entry, index) => {
      if (!entry) return null;
      const { width, height } = entry.document.canvas;
      const scale = Math.max(.03, Math.min(area.width / width, area.height / height));
      return <div key={index} className="projection-artboard" aria-hidden={index !== visible}
        style={{
          width: width * scale, height: height * scale, position: "absolute",
          left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          opacity: index === visible ? 1 : 0,
          zIndex: index === visible ? 2 : 1,
          transition: "opacity 130ms ease-out",
          pointerEvents: "none", background: "#101715",
        }}>
        <iframe ref={node => { frames.current[index] = node; }}
          title={title ?? "Diapositive"} srcDoc={renderSlideHtml(entry.document)}
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
