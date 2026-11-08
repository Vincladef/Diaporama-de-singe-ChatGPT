export type HealthResult =
  | { ok: true; database: "connected"; schema: "ready" | "incomplete"; service: string }
  | { ok: false; database: "unavailable" | "not_configured"; service: string };

export async function checkHealth(signal?: AbortSignal): Promise<HealthResult> {
  const response = await fetch("/.netlify/functions/health", { signal, cache: "no-store" });
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("ok" in data)) {
    throw new Error("Réponse de contrôle invalide.");
  }
  return data as HealthResult;
}
