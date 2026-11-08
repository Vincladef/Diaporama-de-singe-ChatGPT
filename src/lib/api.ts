import type { SlideDocument } from "../domain/slide";

export type HealthResult =
  | { ok: true; database: "connected"; schema: "ready" | "incomplete"; service: string }
  | { ok: false; database: "unavailable" | "not_configured"; service: string };

export interface DeckSummary {
  id: string;
  title: string;
  format: "16:9" | "4:3" | "custom";
  updated_at: string;
  slide_count: number;
}
export interface Presentation {
  id: string;
  title: string;
  description: string;
  format: string;
  updated_at: string;
}
export interface SlideRecord {
  id: string;
  presentation_id: string;
  position: number;
  document: SlideDocument;
  notes: string;
  revision: number;
  updated_at: string;
}
export interface PresentationDetail {
  presentation: Presentation;
  slides: SlideRecord[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code === "revision_conflict" ? "La diapositive a changé ailleurs. Actualisez pour éviter d'écraser la modification." :
      code === "unauthorized" ? "Code d’accès incorrect." :
      code === "access_not_configured" ? "L’accès privé n’est pas configuré sur Netlify." :
      "Erreur de l'application : " + code);
    this.status = status;
    this.code = code;
  }
}
const endpoint = "/.netlify/functions/workspace";
async function call<T>(token: string, options: { op?: string; id?: string; action?: Record<string, unknown> } = {}): Promise<T> {
  const url = new URL(endpoint, window.location.origin);
  if (options.op) url.searchParams.set("op", options.op);
  if (options.id) url.searchParams.set("id", options.id);
  const response = await fetch(url, {
    method: options.action ? "POST" : "GET",
    cache: "no-store",
    headers: { Authorization: "Bearer " + token, ...(options.action ? { "Content-Type": "application/json" } : {}) },
    body: options.action ? JSON.stringify(options.action) : undefined,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = typeof payload === "object" && payload && "error" in payload ? String(payload.error) : "unknown";
    throw new ApiError(response.status, error);
  }
  return payload as T;
}
export async function listPresentations(token: string): Promise<DeckSummary[]> {
  return (await call<{ presentations: DeckSummary[] }>(token, { op: "list" })).presentations;
}
export async function readPresentation(token: string, id: string): Promise<PresentationDetail> {
  return call<PresentationDetail>(token, { op: "presentation", id });
}
export interface DeckRevisions {
  id: string;
  title: string;
  slides: { id:string;position:number;revision:number }[];
}
export async function readDeckRevisions(token:string,id:string):Promise<DeckRevisions>{
  return call<DeckRevisions>(token,{op:"revisions",id});
}
export async function command<T>(token: string, action: Record<string, unknown>): Promise<T> {
  return call<T>(token, { action });
}
export async function checkHealth(signal?: AbortSignal): Promise<HealthResult> {
  const response = await fetch("/.netlify/functions/health", { signal, cache: "no-store" });
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("ok" in data)) throw new Error("Réponse de contrôle invalide.");
  return data as HealthResult;
}
