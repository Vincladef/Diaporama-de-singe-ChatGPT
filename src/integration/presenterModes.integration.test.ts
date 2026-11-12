import test from "node:test";
import assert from "node:assert/strict";
import { preview } from "vite";
import { chromium, type Page } from "playwright-core";
import { clarkWellsDemonstration } from "./clarkWellsDemonstration.ts";
import type { SlideDocument } from "../domain/slide.ts";

const deckId = "f193e336-3328-4679-8227-9bd5561d5c95";
const samples = [0, 1].map(index => clarkWellsDemonstration.find(item =>
  item.slide_index === index && item.name.startsWith("A ·"))!);
const now = "2026-11-12T12:00:00.000Z";
const presentation = { id: deckId, title: "Projection de test",
  description: "", format: "16:9", folder_id: null, updated_at: now };
function fixtureDocument(document: SlideDocument, index: number): SlideDocument {
  const result = structuredClone(document);
  if (index === 1 && result.freeform) {
    // A deliberately slow asset must not stall the projection's HTML transition.
    result.freeform.html +=
      '<div id="singe-second-slide-marker" style="position:absolute;left:1px;top:1px"></div>' +
      '<img src="https://presenter-fixtures.invalid/slow-image.png" ' +
      'style="position:absolute;left:2px;top:2px;width:2px;height:2px">';
  }
  return result;
}
const slides = samples.map((s, index) => ({
  id: s.slide_id, presentation_id: deckId, position: index,
  revision: 1, updated_at: now, document: fixtureDocument(s.document, index),
  notes: index === 0 ? "NOTE_PRIVEE_CONFIDENTIELLE_123" : "NOTE_SUIVANTE_PRIVEE_456"
}));
const summary = { ...presentation, slide_count: slides.length };

async function waitForAnimatedVisibility(page: Page, region: string, target: string,
  expected: "hidden" | "visible") {
  await page.waitForFunction(({ region, target, expected }) => {
    const iframe = document.querySelector<HTMLIFrameElement>(
      region + ' .projection-artboard[aria-hidden="false"] iframe'
    );
    const element = iframe?.contentDocument?.querySelector<HTMLElement>(target);
    return element?.style.visibility === expected;
  }, { region, target, expected }, { timeout: 18000 });
}

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
    await context.route("**/slow-image.png", async route => {
      await new Promise(resolve => setTimeout(resolve, 4000));
      await route.abort().catch(() => {});
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
    let page = await context.newPage();
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
    // No overlay or controls appear even on mouse hover; keyboard still advances.
    await page.locator(".presentation-public").hover();
    assert.equal(await page.locator(".presentation-public-toolbar, .presentation-speaker-warning, .presentation-fullscreen-error").count(), 0);
    assert.equal(await page.locator(".presentation-public button, .presentation-public nav").count(), 0);
    await page.keyboard.press("ArrowRight");
    await waitForAnimatedVisibility(page, ".presentation-public", "#premise", "visible");
    await page.locator('.presentation-public[aria-busy="false"]').waitFor();

    // Regression: reverse DURING a visible click animation; this command was
    // silently dropped by the previous busy-state guard.
    await page.keyboard.press("ArrowRight");
    await page.locator('.presentation-public[aria-busy="true"]').waitFor();
    await page.keyboard.press("ArrowLeft");
    await page.locator('.presentation-public[aria-busy="false"]').waitFor();
    await waitForAnimatedVisibility(page, ".presentation-public", "#belief", "hidden");

    // The projected slide surface is still clickable, despite having no toolbar.
    // A mouse click should be interruptible with an immediate backward arrow.
    await page.locator(".presentation-public .projection-stage").click({ position: { x: 150, y: 180 } });
    await page.locator('.presentation-public[aria-busy="true"]').waitFor();
    await page.keyboard.press("ArrowLeft");
    await page.locator('.presentation-public[aria-busy="false"]').waitFor();
    await waitForAnimatedVisibility(page, ".presentation-public", "#belief", "hidden");

    // Rapid sequences must not lose a click when the previous reveal is running.
    await page.locator(".presentation-public .projection-stage").click({ position: { x: 150, y: 180 } });
    await page.locator('.presentation-public[aria-busy="true"]').waitFor();
    await page.locator(".presentation-public .projection-stage").click({ position: { x: 150, y: 180 } });
    await page.locator('.presentation-public .projection-stage[aria-label="Diapositive 2"]').waitFor();
    // Verify the actual visible iframe, not just the parent's updated label.
    // The second slide includes an asset that takes 4 seconds to resolve.
    const onSecond = await page.evaluate(() => {
      const frame = document.querySelector<HTMLIFrameElement>(
        '.presentation-public .projection-artboard[aria-hidden="false"] iframe'
      );
      return !!frame?.contentDocument?.getElementById("singe-second-slide-marker");
    });
    assert.equal(onSecond, true, "The second slide must be visibly rendered");

    // Regressions: a BACK command with focus INSIDE the iframe used to be lost.
    await page.evaluate(() => {
      const frame = document.querySelector<HTMLIFrameElement>(
        '.presentation-public .projection-artboard[aria-hidden="false"] iframe'
      );
      if (!frame?.contentDocument?.body) throw Error("Missing slide body");
      frame.contentDocument.body.tabIndex = 0;
      frame.contentDocument.body.focus();
    });
    assert.equal(await page.evaluate(() => document.activeElement?.tagName), "IFRAME");
    const backwardStarted = Date.now();
    await page.keyboard.press("ArrowLeft");
    await waitForAnimatedVisibility(page, ".presentation-public", "#belief", "visible");
    assert.ok(Date.now() - backwardStarted < 1300,
      "Cached backward slide switch must not wait for media or fonts");

    // A sequence of forward/backward switches must keep the cached iframe ready.
    for (let index = 0; index < 3; index++) {
      const forwardStarted = Date.now();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => {
        const frame = document.querySelector<HTMLIFrameElement>(
          '.presentation-public .projection-artboard[aria-hidden="false"] iframe'
        );
        return !!frame?.contentDocument?.getElementById("singe-second-slide-marker");
      }, undefined, { timeout: 2500 });
      assert.ok(Date.now() - forwardStarted < 1300, "Cached forward switch is too slow");
      const reverseStarted = Date.now();
      await page.keyboard.press("ArrowLeft");
      await waitForAnimatedVisibility(page, ".presentation-public", "#belief", "visible");
      assert.ok(Date.now() - reverseStarted < 1300, "Cached backward switch is too slow");
    }

    // The browser's fullscreen exit closes the public presentation.
    await page.evaluate(async () => {
      if (document.fullscreenElement) await document.exitFullscreen();
      else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await page.locator(".presentation-public").waitFor({ state: "detached" });
    await page.waitForFunction(() => !document.fullscreenElement);

    // Test speaker mode in another browser tab to avoid incidental focus
    // transitions inherited from the fullscreen-only scenario.
    await page.close();
    page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:5191/", { waitUntil: "domcontentloaded" });
    await page.locator(".library-deck-open").first().click();
    await page.locator(".present-action").waitFor();

    // Speaker mode: the original tab remains public; popup alone shows the notes.
    await page.locator(".slides-present-options > summary").click();
    const popupEvent = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Mode Présentateur avec notes" }).click();
    const popup = await popupEvent;
    popup.on("close", () => console.log("PRESENTER_POPUP_CLOSED"));
    popup.on("crash", () => console.log("PRESENTER_POPUP_CRASHED"));
    popup.on("pageerror", error => console.log("PRESENTER_POPUP_PAGEERROR", error.message));
    await popup.getByText("NOTE_PRIVEE_CONFIDENTIELLE_123").waitFor({ timeout: 15000 });
    assert.equal(await page.locator(".presentation-public").count(), 1);
    assert.equal(await page.locator(".presenter-console-notes").count(), 0);
    assert.equal(await page.locator(".presentation-public").getByText("NOTE_PRIVEE_CONFIDENTIELLE_123").count(), 0);
    await page.locator(".presentation-public").hover();
    assert.equal(await page.locator(".presentation-public button, .presentation-public nav").count(), 0);
    assert.equal(await page.locator(".presentation-public-toolbar, .presentation-speaker-warning, .presentation-fullscreen-error").count(), 0);

    // The live presenter preview must mirror the *visible animation state*
    // and the second preview must show the end state of the upcoming click.
    await popup.getByText(/Apparition 0 \/ 2/).waitFor();
    await popup.getByText("Au prochain clic : apparition 1 / 2").waitFor();
    await waitForAnimatedVisibility(popup, ".presenter-console-preview", "#premise", "hidden");
    await waitForAnimatedVisibility(popup, ".presenter-console-next-image", "#premise", "visible");
    await waitForAnimatedVisibility(popup, ".presenter-console-next-image", "#belief", "hidden");

    await popup.getByRole("button", { name: "Suivant →" }).click();
    await popup.getByText(/Apparition 1 \/ 2/).waitFor();
    await waitForAnimatedVisibility(popup, ".presenter-console-preview", "#premise", "visible");
    await waitForAnimatedVisibility(popup, ".presenter-console-preview", "#belief", "hidden");
    await waitForAnimatedVisibility(popup, ".presenter-console-next-image", "#belief", "visible");
    await waitForAnimatedVisibility(page, ".presentation-public", "#premise", "visible");

    await popup.getByRole("button", { name: "Suivant →" }).click();
    await popup.getByText(/Apparition 2 \/ 2/).waitFor();
    await waitForAnimatedVisibility(popup, ".presenter-console-preview", "#belief", "visible");
    await popup.getByText("Diapositive suivante : 2").waitFor();

    // Selecting a slide remains possible without skipping a pending reveal accidentally.
    await popup.locator("#presenter-slide-select").selectOption("1");
    await popup.getByText("NOTE_SUIVANTE_PRIVEE_456").waitFor({ timeout: 12000 });
    await page.locator('.presentation-public .projection-stage[aria-label="Diapositive 2"]').waitFor({ timeout: 12000 });
    await popup.close();
    // In an actual meeting the user focuses the projected window before pressing N.
    await page.bringToFront();
    // N can reopen private notes without ever showing buttons to the audience.
    const reopenedEvent = page.waitForEvent("popup", { timeout: 12000 });
    await page.keyboard.press("n");
    const reopened = await reopenedEvent;
    await reopened.getByText("NOTE_SUIVANTE_PRIVEE_456").waitFor({ timeout: 12000 });
    assert.equal(await page.locator(".presentation-public button, .presentation-public nav").count(), 0);
    await page.keyboard.press("Escape");
    await page.locator(".presentation-public").waitFor({ state: "detached" });
    assert.deepEqual(errors, []);
    await context.close();
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) =>
      server.httpServer.close(error => error ? reject(error) : resolve()));
  }
});
