import { createHash } from "node:crypto";
import type { SlideDocument } from "../domain/slide.ts";

/** Server-only CAS hash. Never imported into the browser bundle. */
export function fingerprint(value:{name:string;notes:string;document:SlideDocument}):string{
  return createHash("sha256").update(JSON.stringify({
    name:value.name,notes:value.notes,document:value.document
  })).digest("hex");
}
