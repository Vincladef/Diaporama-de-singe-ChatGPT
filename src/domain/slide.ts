import { z } from "zod";

export const SlideElementSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.enum(["text", "image", "shape", "svg", "group"]),
  text: z.string().optional(),
  src: z.url().optional(),
  parentId: z.string().optional(),
  styles: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
}).strict();

export const AnimationStepSchema = z.object({
  id: z.string().min(1),
  targetElementId: z.string().min(1),
  order: z.number().int().min(0),
  trigger: z.enum(["click", "after-previous"]),
  effect: z.enum(["appear", "fade", "move", "scale"]),
  durationMs: z.number().int().min(0).max(60000).default(350),
}).strict();

export const SlideDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(["structured", "freeform", "hybrid"]),
  canvas: z.object({
    width: z.number().int().min(320).max(8192),
    height: z.number().int().min(240).max(8192),
  }).strict(),
  elements: z.array(SlideElementSchema).max(1000),
  freeform: z.object({ html: z.string(), css: z.string() }).strict().optional(),
  animations: z.array(AnimationStepSchema),
}).strict();

export type SlideDocument = z.infer<typeof SlideDocumentSchema>;
export type SlideElement = z.infer<typeof SlideElementSchema>;

export function createEmptySlideDocument(): SlideDocument {
  return {
    schemaVersion: 1,
    mode: "structured",
    canvas: { width: 1920, height: 1080 },
    elements: [],
    animations: [],
  };
}
