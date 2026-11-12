import test from "node:test";
import assert from "node:assert/strict";
import { preview } from "vite";
import { chromium } from "playwright-core";
import { clarkWellsDemonstration } from "./clarkWellsDemonstration.ts";

const deckId = "f193e336-3328-4679-8227-9bd5561d5c95";
const samples = [0, 1].map(index => clarkWellsDemonstration.find(item =>
  item.slide_index === index && item.name.startsWith("A ·"))!);
const now = "2026-11-12T12:00:00.000Z";
const presentation = { id: deckId, title: "Projection de test",
  description: "", format: "16:9", folder_id: null, updated_at: now };
const slides = samples.map((s, index) => ({
  id: s.slide_id, presentation_id: deckId, position: index,
  revision: 1, updated_at: now, document: s.document,
  notes: index === 0 ? "NOTE_PRIVEE_CONFIDENTIELLE_123" : "NOTE_SUIVANTE_PRIVEE_456"
}));
const summary = { ...presentation, slide_count: slides.length };

test("public fullscreen has no visible notes; speaker notes stay in separate window",
 { timeout: 120_000 }, async () => {
  const server = await preview({ preview: { port: 5191, host: "127.0.0.1", strictPort: true },
    logLevel: "error" });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1400, height: 850 } });
    await context.addInitScript(() => {
      if (window.top === window)
        sessionStorage.setItem("diaporama-chatgpt-owner-token", "ci-presenter-test-token");
    });
    await context.route("**/.netlify/functions/workspace**", async route => {
      const req = route.request();
      const op = new URL(req.url()).searchParams.get("op");
      let payload: unknown = { ok: true, items: [], variants: [] };
      if (req.method() === "GET") {
        if (op === "list") payload = { ok: true, presentations: [summary] };
        if (op === "folders") payload = { ok: true, folders: [] };
        if (op === "presentation") payload = { presentation, slides };
        if (op === "revisions") payload = { id: deckId, title: presentation.title,
          slides: slides.map(slide => ({ id: slide.id, revision: slide.revision,
            position: slide.position })) };
        if (op === "cover") payload = { document: slides[0]!.document };
      }
      await route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify(payload) });
    });
    await context.route("**/.netlify/functions/health", route => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        ok: true, database: "connected", schema: "ready", service: "diaporama-de-singe-chatgpt"
      })
    }));
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:5191/", { waitUntil: "domcontentloaded" });
    await page.locator(".library-deck-open").first().click();
    await page.locator(".present-action").waitFor();

    // Default click: public slides only; no presenter console in the projected view.
    await page.locator(".present-action").click();
    await page.getByRole("dialog", { name: "Projection publique des diapositives" }).waitFor();
    assert.equal(await page.locator(".presenter-console-notes").count(), 0);
    assert.equal(await page.locator(".presentation-public").getByText("NOTE_PRIVEE_CONFIDENTIELLE_123").count(), 0);
    await page.locator(".presentation-public-toolbar").getByRole("button", { name: "Quitter" })
      .click({ force: true });

    // Speaker mode: the original tab remains public; popup alone shows the notes.
    await page.locator(".slides-present-options > summary").click();
    const popupEvent = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Mode Présentateur avec notes" }).click();
    const popup = await popupEvent;
    await popup.getByText("NOTE_PRIVEE_CONFIDENTIELLE_123").waitFor({ timeout: 15000 });
    assert.equal(await page.locator(".presentation-public").count(), 1);
    assert.equal(await page.locator(".presenter-console-notes").count(), 0);
    assert.equal(await page.locator(".presentation-public").getByText("NOTE_PRIVEE_CONFIDENTIELLE_123").count(), 0);
    await popup.getByRole("button", { name: "Suivant →" }).click();
    await popup.getByText("NOTE_SUIVANTE_PRIVEE_456").waitFor({ timeout: 12000 });
    await page.locator(".presentation-public-toolbar").getByText("2 / 2").waitFor({ timeout: 12000 });
    await popup.close();
    await page.locator(".presentation-public-toolbar")
      .getByRole("button", { name: "Ouvrir les notes privées" })
      .waitFor({ timeout: 4000 });
    await page.locator(".presentation-public-toolbar").getByRole("button", { name: "Quitter" })
      .click({ force: true });
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) =>
      server.httpServer.close(error => error ? reject(error) : resolve()));
  }
});
