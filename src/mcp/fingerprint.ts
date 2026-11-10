import { createHash } from "node:crypto";
import type { SlideDocument } from "../domain/slide.ts";

/** Server-only CAS hash. Never imported into the browser bundle. */
export function fingerprint(value:{name:string;notes:string;document:SlideDocument}):string{
  // PostgreSQL jsonb and Zod can serialize object properties in different orders.
  // Canonical sorting prevents false revision conflicts for an unchanged document.
  const stable=JSON.stringify({
    name:value.name,notes:value.notes,document:value.document
  },(_key,entry:unknown)=>{
    if(entry&&typeof entry==="object"&&!Array.isArray(entry)){
      const obj=entry as Record<string,unknown>;
      return Object.fromEntries(Object.keys(obj).sort().map(key=>[key,obj[key]]));
    }
    return entry;
  });
  return createHash("sha256").update(stable).digest("hex");
}
