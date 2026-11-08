/** Pure geometry helpers shared by native PowerPoint conversion and tests. */
export function cssLength(value: unknown, reference: number, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return fallback;
  const v = value.trim().toLowerCase();
  if (/^-?\d+(\.\d+)?%$/.test(v)) return Number.parseFloat(v) * reference / 100;
  if (/^-?\d+(\.\d+)?px$/.test(v)) return Number.parseFloat(v);
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number.parseFloat(v);
  return fallback;
}
export function pptxInches(pixelValue: number, canvasPixels: number, pptxInches: number): number {
  return pixelValue / canvasPixels * pptxInches;
}
export function asColor(value: unknown, fallback = "26342C"): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(v)) return v.toUpperCase();
  if (/^[0-9a-f]{3}$/i.test(v)) return v.split("").map(c => c + c).join("").toUpperCase();
  const rgb = value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) {
    const channels = rgb.slice(1, 4).map(x => Math.max(0, Math.min(255, Number(x))));
    return channels.map(x => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  return fallback;
}
export function safeDownloadName(title: string): string {
  return (title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 _-]+/gi, "")
    .trim().replace(/\s+/g, "-").slice(0, 90) || "Diaporama-de-singe") + ".pptx";
}
