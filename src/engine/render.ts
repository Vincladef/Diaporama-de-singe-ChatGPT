import type { SlideDocument, SlideElement } from "../domain/slide.ts";

/** Isolated, deterministic rendering. The consuming iframe MUST use sandbox="" without allow-scripts. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function safeImageUrl(src: string | undefined): string {
  if (!src) return "";
  try {
    const url = new URL(src);
    if (url.protocol === "https:" || (url.protocol === "data:" && /^data:image\/(png|jpeg|gif|webp);/i.test(src))) return escapeHtml(src);
  } catch { /* Invalid URL */ }
  return "";
}
function cssStyle(styles: SlideElement["styles"]): string {
  const result = ["position:absolute"];
  for (const [name, value] of Object.entries(styles)) {
    if (!/^(--[\w-]+|[a-zA-Z][a-zA-Z0-9]*)$/.test(name)) continue;
    const key = name.startsWith("--") ? name : name.replace(/[A-Z]/g, x => "-" + x.toLowerCase());
    result.push(key + ":" + String(value).replace(/[;"<>]/g, ""));
  }
  return escapeHtml(result.join(";"));
}
function renderObjects(document: SlideDocument): string {
  const children = new Map<string, SlideElement[]>();
  const known = new Set(document.elements.map(item => item.id));
  for (const item of document.elements) {
    const parent = item.parentId && known.has(item.parentId) ? item.parentId : "_root";
    children.set(parent, [...(children.get(parent) ?? []), item]);
  }
  const seen = new Set<string>();
  const walk = (parent: string, depth: number): string => {
    if (depth > 25) return "";
    return (children.get(parent) ?? []).map(item => {
      if (seen.has(item.id)) return "";
      seen.add(item.id);
      if(item.hidden)return "";
      const style = cssStyle(item.styles);
      const id = escapeHtml(item.id);
      const inner = walk(item.id, depth + 1);
      if (item.type === "image") return '<img data-id="' + id + '" alt="" src="' + safeImageUrl(item.src) + '" style="' + style + '"/>';
      if (item.type === "svg") return '<div data-id="' + id + '" style="' + style + '">' + (item.text ?? "") + inner + "</div>";
      if (item.type === "shape" || item.type === "group") return '<div data-id="' + id + '" style="' + style + '">' + inner + "</div>";
      return '<div data-id="' + id + '" style="' + style + '">' + escapeHtml(item.text ?? "") + inner + "</div>";
    }).join("");
  };
  return walk("_root", 0);
}
export function renderSlideHtml(document: SlideDocument): string {
  const { width, height } = document.canvas;
  const free = document.mode === "structured" ? undefined : document.freeform;
  // Prevent user CSS from escaping the style element. User HTML may be arbitrary inside the sandbox.
  const css = (free?.css ?? "").replace(/<\/style/gi, "<\\/style");
  const body = (free ? "<!--singe-free-start-->" + free.html + "<!--singe-free-end-->" : "") + (document.mode === "freeform" ? "" : renderObjects(document));
  const csp = "default-src 'none'; img-src https: data: blob:; style-src 'unsafe-inline' https:; font-src https: data:; media-src https: data: blob:; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
  return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + escapeHtml(csp) + '"><meta name="viewport" content="width=' + width + ',initial-scale=1">' +
    '<style>*,*::before,*::after{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{position:relative;background:#101715;}' +
    css + '</style></head><body>' + body + '</body></html>';
}
