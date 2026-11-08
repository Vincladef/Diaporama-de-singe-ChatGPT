import { neon } from '@neondatabase/serverless'

export default async () => {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return Response.json({ ok: false, database: 'not_configured' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
  try {
    const sql = neon(databaseUrl)
    await sql`SELECT 1 AS connected`
    return Response.json({ ok: true, database: 'connected', service: 'diaporama-de-singe-chatgpt' }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ ok: false, database: 'unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
