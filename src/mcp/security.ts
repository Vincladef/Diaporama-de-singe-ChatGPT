import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export const ORIGIN = "https://diaporama-de-singe-chatgpt.netlify.app";
export const RESOURCE = ORIGIN + "/mcp";
export const SCOPES = "presentations.read presentations.write";

export function database() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured");
  if (decodeURIComponent(new URL(url).pathname.slice(1)) !== "diaporama_singe_chatgpt")
    throw new Error("MCP_DATABASE_MISMATCH: expected the independent ChatGPT database");
  return neon(url);
}
export function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
export function randomToken(): string {
  return randomBytes(36).toString("base64url");
}
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function ownerSecret(): string {
  const secret = process.env.EDITOR_ACCESS_TOKEN;
  if (!secret || secret.length < 20) throw new Error("EDITOR_ACCESS_TOKEN not configured");
  return secret;
}
export function sign(data: string): string {
  return createHmac("sha256", ownerSecret()).update(data).digest("base64url");
}
export function ownerAuthenticated(value: string): boolean {
  try { return safeEqual(value, ownerSecret()); } catch { return false; }
}
export function oauthChallenge(): string {
  return 'Bearer resource_metadata="' + ORIGIN + '/.well-known/oauth-protected-resource", scope="' + SCOPES + '"';
}
export function oauthError(): Response {
  return Response.json({ error: "unauthorized", error_description: "OAuth authentication required" },
    { status: 401, headers: { "WWW-Authenticate": oauthChallenge(), "Cache-Control": "no-store" } });
}
export async function authorizeBearer(request: Request, required: "read" | "write" = "read"): Promise<boolean> {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1] ?? "";
  if (!token) return false;
  // Personal bridge clients may still use the existing editor key. ChatGPT uses OAuth.
  if (ownerAuthenticated(token)) return true;
  const sql = database();
  const rows = await sql.query(
    "SELECT scopes FROM public.mcp_tokens WHERE token_hash=$1 AND token_kind='access' AND resource=$2 AND expires_at>now() LIMIT 1",
    [digest(token), RESOURCE]);
  const scopes = String(rows[0]?.scopes ?? "").split(/\s+/);
  return scopes.includes(required === "write" ? "presentations.write" : "presentations.read");
}
export function isChatGptRedirect(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 600) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com") &&
      (/^\/connector(_platform_oauth_redirect|\/oauth\/[^/]+)?$/.test(url.pathname) ||
       /^\/oauth\/[^/]+/.test(url.pathname));
  } catch { return false; }
}
