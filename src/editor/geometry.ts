import type { SlideDocument, SlideElement } from "../domain/slide.ts";

export type Box = { x: number; y: number; w: number; h: number };
export type TransformMode = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

export function lengthToPx(input: string | number | undefined, reference: number, fallback = 0): number {
  if (typeof input === "number") return Number.isFinite(input) ? input : fallback;
  if (typeof input !== "string" || !input.trim()) return fallback;
  const v = input.trim();
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  if (/^-?(?:\d+\.?\d*|\.\d+)%$/.test(v)) return n * reference / 100;
  if (/^-?(?:\d+\.?\d*|\.\d+)(px)?$/.test(v)) return n;
  return fallback;
}
const rounded = (n: number) => Math.round(n * 10) / 10;

export function elementBox(element: SlideElement, doc: SlideDocument): Box {
  const { width, height } = doc.canvas;
  const font = lengthToPx(element.styles.fontSize, width, 62);
  return {
    x: lengthToPx(element.styles.left, width),
    y: lengthToPx(element.styles.top, height),
    w: Math.max(1, lengthToPx(element.styles.width, width, element.type === "text" ? Math.min(850, width * .55) : Math.min(600, width / 2))),
    h: Math.max(1, lengthToPx(element.styles.height, height, element.type === "text" ? font * 1.5 : height / 3)),
  };
}
export function worldBox(element: SlideElement, doc: SlideDocument): Box {
  const result = elementBox(element, doc);
  let parentId = element.parentId;
  const visited = new Set([element.id]);
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = doc.elements.find(e => e.id === parentId);
    if (!parent) break;
    const b = elementBox(parent, doc);
    result.x += b.x;
    result.y += b.y;
    parentId = parent.parentId;
  }
  return result;
}
export function snap(value: number, grid: number): number {
  return grid > 0 ? Math.round(value / grid) * grid : rounded(value);
}
export function clampBox(box: Box): Box {
  return { x: rounded(box.x), y: rounded(box.y), w: Math.max(12, rounded(box.w)), h: Math.max(12, rounded(box.h)) };
}
/** Apply a pointer delta to a single box. Deltas are expressed in source canvas pixels. */
export function transformBox(initial: Box, dx: number, dy: number, mode: TransformMode, grid = 0): Box {
  let { x, y, w, h } = initial;
  if (mode === "move") {
    x = snap(x + dx, grid);
    y = snap(y + dy, grid);
  } else {
    const right = mode.includes("e"), left = mode.includes("w");
    const bottom = mode.includes("s"), top = mode.includes("n");
    if (left) { x = snap(x + dx, grid); w = initial.w + initial.x - x; }
    if (right) w = snap(initial.w + dx, grid);
    if (top) { y = snap(y + dy, grid); h = initial.h + initial.y - y; }
    if (bottom) h = snap(initial.h + dy, grid);
    if (w < 12) { if (left) x = initial.x + initial.w - 12; w = 12; }
    if (h < 12) { if (top) y = initial.y + initial.h - 12; h = 12; }
  }
  return clampBox({ x, y, w, h });
}
export function withElementBoxes(doc: SlideDocument, changes: Record<string, Box>): SlideDocument {
  const elements = doc.elements.map(e => {
    const world = changes[e.id];
    if (!world) return e;
    const parent = e.parentId ? doc.elements.find(p => p.id === e.parentId) : undefined;
    const parentBox = parent ? worldBox(parent, doc) : {x: 0,y: 0,w: 0,h: 0};
    return { ...e, styles: { ...e.styles,
      left: rounded(world.x - parentBox.x) + "px",
      top: rounded(world.y - parentBox.y) + "px",
      width: rounded(world.w) + "px",
      height: rounded(world.h) + "px",
    }};
  });
  return {...doc, elements};
}
export function alignElements(doc: SlideDocument, ids: string[], type: "left" | "right" | "center" | "top" | "middle" | "bottom"): SlideDocument {
  const selected = doc.elements.filter(e => ids.includes(e.id));
  if (selected.length < 2) return doc;
  const boxes = selected.map(e => ({id: e.id,box:worldBox(e, doc)}));
  const left = Math.min(...boxes.map(b => b.box.x));
  const top = Math.min(...boxes.map(b => b.box.y));
  const right = Math.max(...boxes.map(b => b.box.x + b.box.w));
  const bottom = Math.max(...boxes.map(b => b.box.y + b.box.h));
  const changes: Record<string, Box> = {};
  for (const {id,box} of boxes) {
    const next = {...box};
    if(type === "left")next.x=left;
    if(type === "right")next.x=right-next.w;
    if(type === "center")next.x=(left+right-next.w)/2;
    if(type === "top")next.y=top;
    if(type === "middle")next.y=(top+bottom-next.h)/2;
    if(type === "bottom")next.y=bottom-next.h;
    changes[id]=next;
  }
  return withElementBoxes(doc,changes);
}
export function duplicateElements(doc: SlideDocument, ids: string[], makeId: () => string): { document: SlideDocument; created: string[] } {
  const selected = doc.elements.filter(e => ids.includes(e.id));
  const newIds = new Map(selected.map(e => [e.id, makeId()]));
  const elements = selected.map(e => ({
    ...structuredClone(e),
    id: newIds.get(e.id)!,
    parentId: e.parentId ? newIds.get(e.parentId) ?? e.parentId : undefined,
    styles: {
      ...e.styles,
      left: rounded(lengthToPx(e.styles.left,doc.canvas.width) + 30) + "px",
      top: rounded(lengthToPx(e.styles.top,doc.canvas.height) + 30) + "px",
    },
  }));
  return {document: {...doc,elements:[...doc.elements,...elements]},created:elements.map(e=>e.id)};
}
