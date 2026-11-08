import { z } from "zod";
import { database, digest, isChatGptRedirect, oauthChallenge, ORIGIN, ownerAuthenticated, randomToken, RESOURCE, safeEqual, SCOPES, sign } from "../../src/mcp/security";

const common = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "https://chatgpt.com" };
const json = (value: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(value, { status, headers: { ...common, ...extra } });
const error = (kind: string, description: string, status = 400) =>
  json({ error: kind, error_description: description }, status);
function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function getClient(values: Record<string, string>) {
  return { client: values.client_id ?? "", redirect: values.redirect_uri ?? "", challenge: values.code_challenge ?? "",
    state: values.state ?? "", scope: values.scope ?? SCOPES, resource: values.resource ?? RESOURCE };
}
async function validateClient(clientId: string, redirect: string): Promise<boolean> {
  if (!isChatGptRedirect(redirect)) return false;
  const db = database();
  const rows = await db.query("SELECT redirect_uris FROM public.mcp_clients WHERE client_id=$1", [clientId]);
  return !!rows[0] && Array.isArray(rows[0].redirect_uris) && rows[0].redirect_uris.includes(redirect);
}
function validAuth(input: ReturnType<typeof getClient>): boolean {
  return input.resource === RESOURCE &&
    /^[A-Za-z0-9._~-]{43,128}$/.test(input.challenge) &&
    input.scope.split(/\s+/).every(x => SCOPES.split(" ").includes(x));
}
async function authorizationGet(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  if (params.response_type !== "code" || params.code_challenge_method !== "S256")
    return error("invalid_request", "Authorization code flow with PKCE S256 is required");
  const input = getClient(params);
  if (!validAuth(input) || !await validateClient(input.client, input.redirect))
    return error("invalid_request", "Unknown client, callback, resource or PKCE challenge");
  const expires = String(Math.floor(Date.now() / 1000) + 600);
  const message = [input.client, input.redirect, input.challenge, input.state, input.scope, input.resource, expires].join("\n");
  const fields = { ...input, expires, csrf: sign(message) };
  const hidden = Object.entries(fields).map(([k, v]) =>
    '<input type="hidden" name="' + escape(k) + '" value="' + escape(v) + '">').join("");
  const html = '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Connexion à Diaporama de singe</title><style>body{font:16px system-ui;background:#f5f8f5;color:#253a2d;min-height:90vh;display:grid;place-items:center;margin:0}form{width:min(420px,88vw);background:#fff;border:1px solid #dbe4dd;border-radius:12px;padding:35px;box-shadow:0 15px 45px #293c2b13}h1{font-size:25px;margin:0 0 13px}p{line-height:1.55;color:#62776a;font-size:14px}label{font-size:13px;font-weight:700;display:block;margin:24px 0 8px}input[type=password]{box-sizing:border-box;width:100%;padding:13px;border:1px solid #cddacc;border-radius:7px}button{background:#28513a;color:#fff;padding:13px;width:100%;border:0;border-radius:7px;margin-top:18px;font-weight:700;cursor:pointer}small{display:block;font-size:12px;color:#829087;margin-top:18px}</style></head>' +
    '<body><form action="/oauth/authorize" method="post"><h1>Diaporama de singe</h1><p>Autoriser ChatGPT à consulter et modifier les présentations de votre espace personnel.</p>' +
    hidden + '<label for="secret">Code d’accès personnel</label><input id="secret" name="secret" type="password" autocomplete="current-password" required autofocus>' +
    '<button type="submit">Autoriser la connexion</button><small>Ce code ne sera jamais partagé avec ChatGPT.</small></form></body></html>';
  return new Response(html, { headers: { ...common, "Content-Type": "text/html; charset=utf-8", "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
}
async function authorizationPost(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length > 6500) return error("invalid_request", "Form is too large", 413);
  const data = new URLSearchParams(raw);
  const input = getClient(Object.fromEntries(data.entries()));
  const exp = data.get("expires") ?? "";
  const message = [input.client, input.redirect, input.challenge, input.state, input.scope, input.resource, exp].join("\n");
  if (!/^\d{10}$/.test(exp) || Date.now() / 1000 > Number(exp) ||
    !safeEqual(sign(message), data.get("csrf") ?? "") ||
    !validAuth(input) || !await validateClient(input.client, input.redirect)) return error("invalid_request", "Expired or invalid authorization request");
  if (!ownerAuthenticated(data.get("secret") ?? "")) return error("access_denied", "Invalid owner access code", 403);
  const code = randomToken();
  const db = database();
  await db.query(
    "INSERT INTO public.mcp_auth_codes (code_hash,client_id,redirect_uri,code_challenge,resource,scopes,expires_at) VALUES ($1,$2,$3,$4,$5,$6,now()+interval '5 minutes')",
    [digest(code), input.client, input.redirect, input.challenge, RESOURCE, input.scope]);
  const callback = new URL(input.redirect);
  callback.searchParams.set("code", code);
  if (input.state) callback.searchParams.set("state", input.state);
  callback.searchParams.set("iss", ORIGIN);
  return new Response(null, { status: 303, headers: { ...common, Location: callback.toString() } });
}
async function registration(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length > 5000) return error("invalid_client_metadata", "Registration is too large", 413);
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return error("invalid_client_metadata", "Invalid JSON"); }
  const schema = z.object({
    client_name: z.string().max(120).optional(),
    redirect_uris: z.array(z.string()).min(1).max(5),
    token_endpoint_auth_method: z.enum(["none"]).optional(),
    grant_types: z.array(z.string()).optional(),
  }).passthrough();
  const parsed = schema.safeParse(input);
  if (!parsed.success || !parsed.data.redirect_uris.every(isChatGptRedirect))
    return error("invalid_redirect_uri", "Only ChatGPT OAuth callback URLs can be registered.");
  if (parsed.data.token_endpoint_auth_method && parsed.data.token_endpoint_auth_method !== "none")
    return error("invalid_client_metadata", "Only PKCE public clients are supported");
  const id = "ds_" + randomToken();
  const db = database();
  await db.query("INSERT INTO public.mcp_clients(client_id,client_name,redirect_uris) VALUES($1,$2,$3::jsonb)",
    [id, parsed.data.client_name ?? "ChatGPT", JSON.stringify(parsed.data.redirect_uris)]);
  return json({ client_id: id, client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: parsed.data.client_name ?? "ChatGPT",
    redirect_uris: parsed.data.redirect_uris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"] }, 201);
}
async function issueTokens(client: string, resource: string, scope: string) {
  const access = randomToken(), refresh = randomToken();
  const db = database();
  await db.query(
    "INSERT INTO public.mcp_tokens(token_hash,client_id,token_kind,resource,scopes,expires_at) VALUES($1,$3,'access',$4,$5,now()+interval '1 hour'),($2,$3,'refresh',$4,$5,now()+interval '30 days')",
    [digest(access), digest(refresh), client, resource, scope]);
  return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: 3600, scope };
}
async function tokenEndpoint(request: Request): Promise<Response> {
  const body = await request.text();
  if (body.length > 8000) return error("invalid_request", "Body too large", 413);
  const data = new URLSearchParams(body);
  const clientId = data.get("client_id") ?? "";
  const grant = data.get("grant_type");
  const resource = data.get("resource") ?? RESOURCE;
  if (resource !== RESOURCE) return error("invalid_target", "Unknown MCP resource");
  const db = database();
  if (grant === "authorization_code") {
    const code = data.get("code") ?? "", redirect = data.get("redirect_uri") ?? "", verifier = data.get("code_verifier") ?? "";
    if (!code || !clientId || !isChatGptRedirect(redirect) || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))
      return error("invalid_grant", "Invalid PKCE token exchange");
    const rows = await db.query(
      "DELETE FROM public.mcp_auth_codes WHERE code_hash=$1 AND client_id=$2 AND redirect_uri=$3 AND resource=$4 AND expires_at>now() RETURNING code_challenge,scopes",
      [digest(code), clientId, redirect, resource]);
    if (!rows[0]) return error("invalid_grant", "Expired, used or invalid authorization code");
    const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
    if (!safeEqual(challenge, String(rows[0].code_challenge))) return error("invalid_grant", "PKCE challenge mismatch");
    return json(await issueTokens(clientId, resource, String(rows[0].scopes)));
  }
  if (grant === "refresh_token") {
    const refresh = data.get("refresh_token") ?? "";
    const rows = await db.query(
      "DELETE FROM public.mcp_tokens WHERE token_hash=$1 AND client_id=$2 AND token_kind='refresh' AND resource=$3 AND expires_at>now() RETURNING scopes",
      [digest(refresh), clientId, resource]);
    if (!rows[0]) return error("invalid_grant", "Invalid or expired refresh token");
    return json(await issueTokens(clientId, resource, String(rows[0].scopes)));
  }
  return error("unsupported_grant_type", "Only authorization_code and refresh_token are supported");
}
async function revokeEndpoint(request: Request): Promise<Response> {
  const data = new URLSearchParams(await request.text());
  if (data.get("token")) await database().query("DELETE FROM public.mcp_tokens WHERE token_hash=$1", [digest(data.get("token")!)]);
  return new Response(null, { status: 200, headers: common });
}
export default async function handler(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...common, "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "content-type,authorization" } });
    if (path.startsWith("/.well-known/oauth-protected-resource") && request.method === "GET")
      return json({ resource: RESOURCE, authorization_servers: [ORIGIN], scopes_supported: SCOPES.split(" "),
        resource_documentation: ORIGIN + "/docs/mcp" });
    if (path === "/.well-known/oauth-authorization-server" && request.method === "GET")
      return json({ issuer: ORIGIN, authorization_endpoint: ORIGIN + "/oauth/authorize", token_endpoint: ORIGIN + "/oauth/token",
        registration_endpoint: ORIGIN + "/oauth/register", revocation_endpoint: ORIGIN + "/oauth/revoke",
        response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"],
        authorization_response_iss_parameter_supported: true, scopes_supported: SCOPES.split(" ") });
    if (path === "/oauth/register" && request.method === "POST") return registration(request);
    if (path === "/oauth/authorize") return request.method === "GET" ? authorizationGet(request) :
      request.method === "POST" ? authorizationPost(request) : error("invalid_request", "Method not allowed", 405);
    if (path === "/oauth/token" && request.method === "POST") return tokenEndpoint(request);
    if (path === "/oauth/revoke" && request.method === "POST") return revokeEndpoint(request);
    return json({ error: "not_found" }, 404);
  } catch (e) {
    console.error("OAuth request failed", e instanceof Error ? e.message : String(e));
    return error("server_error", "Authorization service unavailable", 503);
  }
}
export const config = {
  path: [
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
    "/.well-known/oauth-authorization-server",
    "/oauth/register", "/oauth/authorize", "/oauth/token", "/oauth/revoke"
  ],
  rateLimit: { windowSize: 60, windowLimit: 70, aggregateBy: "ip" as const },
};
