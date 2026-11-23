import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import type { SlideDocument, SlideElement } from "../domain/slide.ts";
import { inspectMarkupMedia } from "../quality/markupMedia.ts";
import { getCreationReferenceFile } from "./creationReferences.ts";
import { getSlide, editSlides } from "./store.ts";

const MAX_BYTES = 3_000_000;
const MAX_PIXELS = 40_000_000;
const MAX_BASE64_LENGTH = Math.ceil(MAX_BYTES / 3) * 4 + 128;

export const SourceImagePlacementSchema = z.object({
  presentationId: z.uuid(),
  slideId: z.uuid(),
  revision: z.number().int().min(1),
  imageBase64: z.string().max(MAX_BASE64_LENGTH).optional(),
  referenceId: z.uuid().optional(),
  sourceSlideId: z.uuid().optional(),
  sourceImageIndex: z.number().int().min(0).max(499).optional(),
  elementId: z.string().min(1).max(128).optional(),
  alt: z.string().max(350).optional(),
  x: z.number().min(-20000).max(20000).optional(),
  y: z.number().min(-20000).max(20000).optional(),
  width: z.number().min(10).max(20000).optional(),
  height: z.number().min(10).max(20000).optional(),
  fit: z.enum(["contain", "cover", "fill"]).default("contain"),
}).strict().refine(value =>
  Number(value.imageBase64 !== undefined) + Number(value.referenceId !== undefined) +
    Number(value.sourceSlideId !== undefined) === 1,
  { message: "Provide exactly one of imageBase64, referenceId or sourceSlideId." });

export type SourceImagePlacement = z.infer<typeof SourceImagePlacementSchema>;
export type SourceVisual = {
  kind: "element" | "html-image" | "css-background";
  sourceIndex: number;
  elementId?: string;
  fingerprint: string;
  type: "embedded" | "remote";
  format: string;
};
export function visualFingerprint(src: string): string {
  return createHash("sha256").update(src).digest("hex");
}
function visualIdentity(src: string) {
  const embedded = /^data:image\/(png|jpeg|webp|gif);base64,/i.exec(src);
  if (embedded) return { type: "embedded" as const, format: embedded[1]!.toLowerCase() };
  try {
    const url = new URL(src);
    if (url.protocol === "https:") return { type: "remote" as const, format: url.hostname.toLowerCase() };
  } catch { /* unsupported URL */ }
  throw new Error("unsupported_source_image");
}
export function inventorySourceVisuals(document: SlideDocument): { count: number; images: SourceVisual[]; svgCount: number } {
  const media = inspectMarkupMedia(document);
  const images: SourceVisual[] = [];
  const push = (kind: SourceVisual["kind"], src: string, index: number, elementId?: string) => {
    const identity = visualIdentity(src);
    images.push({ kind, sourceIndex: index, ...(elementId ? { elementId } : {}),
      fingerprint: visualFingerprint(src), ...identity });
  };
  document.elements.filter(el => el.type === "image" && el.src).forEach((el, i) =>
    push("element", el.src!, i, el.id));
  media.imageUrls.forEach((src, i) => push("html-image", src, i));
  media.backgroundUrls.forEach((src, i) => push("css-background", src, i));
  return { count: images.length, images, svgCount:
    document.elements.filter(el => el.type === "svg").length +
    [...(document.freeform?.html ?? "").matchAll(/<svg\b/gi)].length };
}
function mimeForImage(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "image/gif";
  throw new Error("unsupported_image_format");
}
export async function decodeSourceImage(value: string): Promise<{
  src: string; mimeType: string; width: number; height: number; sizeBytes: number; fingerprint: string;
}> {
  const raw = value.replace(/^data:image\/(?:png|jpe?g|gif|webp);base64,/i, "").trim();
  if (!raw || raw.length > MAX_BASE64_LENGTH || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw))
    throw new Error("invalid_image_base64");
  const bytes = Buffer.from(raw, "base64");
  if (!bytes.length || bytes.length > MAX_BYTES) throw new Error("image_too_large");
  if (bytes.toString("base64") !== raw) throw new Error("invalid_image_base64");
  const mimeType = mimeForImage(bytes);
  const metadata = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata()
    .catch(() => { throw new Error("invalid_image_pixels"); });
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS)
    throw new Error("invalid_image_dimensions");
  return { src: "data:" + mimeType + ";base64," + raw,
    mimeType, width: metadata.width, height: metadata.height,
    sizeBytes: bytes.length, fingerprint: visualFingerprint(bytes.toString("base64")) };
}
async function resolveSource(a: SourceImagePlacement): Promise<{
  src: string; mimeType?: string; width?: number; height?: number; sizeBytes?: number; fingerprint: string;
}> {
  if (a.imageBase64 !== undefined) return decodeSourceImage(a.imageBase64);
  if (a.referenceId) {
    const reference = await getCreationReferenceFile(a.referenceId);
    if (!reference || !reference.mimeType.startsWith("image/")) throw new Error("reference_image_not_found");
    return decodeSourceImage(reference.base64);
  }
  const previous = await getSlide(a.sourceSlideId!, "full");
  if (!("document" in previous)) throw new Error("source_slide_not_found");
  if (previous.presentation_id !== a.presentationId) throw new Error("foreign_source_slide");
  const visuals = inventorySourceVisuals(previous.document).images
    .filter(image => image.kind !== "css-background");
  const selected = visuals[a.sourceImageIndex ?? 0];
  if (!selected) throw new Error("source_image_not_found");
  let src: string | undefined;
  if (selected.kind === "element") src =
    previous.document.elements.find(e => e.id === selected.elementId)?.src;
  else src = inspectMarkupMedia(previous.document).imageUrls[selected.sourceIndex];
  if (!src) throw new Error("source_image_not_found");
  if (src.startsWith("data:")) return decodeSourceImage(src);
  visualIdentity(src);
  return { src, fingerprint: visualFingerprint(src) };
}
export async function placeSourceImage(raw: SourceImagePlacement) {
  const a = SourceImagePlacementSchema.parse(raw);
  const slide = await getSlide(a.slideId, "full");
  if (!("document" in slide)) throw new Error("slide_not_found");
  if (slide.presentation_id !== a.presentationId) throw new Error("foreign_presentation");
  if (slide.revision !== a.revision) throw new Error("revision_conflict");
  const source = await resolveSource(a);
  const id = a.elementId ?? ("source-image-" + source.fingerprint.slice(0,12));
  const prior = slide.document.elements.find(e => e.id === id);
  if (prior && prior.type !== "image") throw new Error("element_is_not_an_image");
  const styles: SlideElement["styles"] = { ...prior?.styles,
    left: (a.x ?? 0) + "px", top: (a.y ?? 0) + "px",
    width: (a.width ?? slide.document.canvas.width) + "px",
    height: (a.height ?? slide.document.canvas.height) + "px",
    objectFit: a.fit, objectPosition: "center" };
  const element: SlideElement = { id, type:"image", src:source.src, alt:a.alt ?? prior?.alt ?? "",
    name: prior?.name ?? "Image source conservée", styles };
  const outcome = await editSlides(a.presentationId, [{ id: a.slideId, revision: a.revision,
    operations:[{ op:"upsert_element", element }] }]);
  return { slideId:a.slideId, elementId:id, revision:outcome.slides?.[0]?.revision,
    originalImagePreserved:true, placed:true, source:{ fingerprint:source.fingerprint,
      ...(source.mimeType ? { mimeType:source.mimeType, width:source.width,
        height:source.height, sizeBytes:source.sizeBytes } : { type:"https" }) },
    note:"Image insérée comme objet éditable ; le contenu et les animations existants restent inchangés." };
}
