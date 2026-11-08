import { neon } from "@neondatabase/serverless";

const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff" };

export default async function health(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405, headers: { ...headers, allow: "GET" } });
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    return Response.json({ ok: false, database: "not_configured", service: "diaporama-de-singe-chatgpt" }, { status: 503, headers });
  }
  try {
    const sql = neon(url);
    const [row] = await sql`
      SELECT current_database() = 'diaporama_singe_chatgpt' AS isolated,
             to_regclass('public.presentations') IS NOT NULL AS presentations,
             to_regclass('public.slides') IS NOT NULL AS slides
    `;
    return Response.json({
      ok: true,
      database: "connected",
      schema: row?.presentations && row?.slides ? "ready" : "incomplete",
      isolated: row?.isolated === true,
      service: "diaporama-de-singe-chatgpt",
    }, { headers });
  } catch {
    return Response.json({ ok: false, database: "unavailable", service: "diaporama-de-singe-chatgpt" }, { status: 503, headers });
  }
}
