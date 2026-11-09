import { z } from "zod";

export const SlideElementSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.enum(["text", "image", "shape", "svg", "group"]),
  text: z.string().optional(),
  src: z.url().optional(),
  alt: z.string().max(350).optional(),
  parentId: z.string().optional(),
  name: z.string().max(140).optional(),
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
  groupId: z.string().max(128).optional(),
  groupName: z.string().max(140).optional(),
  linkFrom: z.string().min(1).max(128).optional(),
  linkTo: z.string().min(1).max(128).optional(),
  styles: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
}).strict();

/** Timeline cues are stored in the same versioned JSON document edited through MCP. */
export const AnimationStepSchema = z.object({
  id: z.string().min(1).max(128),
  targetElementId: z.string().min(1).max(128).optional(),
  /** CSS selector for elements inside freely authored HTML; no JavaScript is executed. */
  targetSelector: z.string().min(1).max(240).optional(),
  order: z.number().int().min(0),
  trigger: z.enum(["click", "after-previous"]),
  effect: z.enum(["appear", "fade", "move", "scale", "wipe", "highlight", "dim", "hide", "custom"]),
  durationMs: z.number().int().min(0).max(60000).default(350),
  delayMs: z.number().int().min(0).max(30000).optional(),
  easing: z.enum(["linear", "ease", "ease-in", "ease-out", "ease-in-out"]).optional(),
  offsetX: z.number().min(-4096).max(4096).optional(),
  offsetY: z.number().min(-4096).max(4096).optional(),
  /** Browser Web Animations API keyframes, e.g. opacity/transform/filter/clipPath. */
  keyframes: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).min(2).max(16).optional(),
}).strict().refine(step => !!(step.targetElementId || step.targetSelector),
  {message:"An animation must target an element or a CSS selector."});

export const SlideDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(["structured", "freeform", "hybrid"]),
  canvas: z.object({
    width: z.number().int().min(320).max(8192),
    height: z.number().int().min(240).max(8192),
  }).strict(),
  elements: z.array(SlideElementSchema).max(1000),
  freeform: z.object({ html: z.string(), css: z.string() }).strict().optional(),
  animations: z.array(AnimationStepSchema).max(1000),
}).strict();

export type SlideDocument = z.infer<typeof SlideDocumentSchema>;
export type SlideElement = z.infer<typeof SlideElementSchema>;
export type AnimationStep = z.infer<typeof AnimationStepSchema>;

export function createEmptySlideDocument(): SlideDocument {
  return {
    schemaVersion: 1,
    mode: "structured",
    canvas: { width: 1920, height: 1080 },
    elements: [],
    animations: [],
  };
}
