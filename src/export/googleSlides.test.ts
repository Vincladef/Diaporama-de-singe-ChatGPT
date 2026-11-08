import test from "node:test";
import assert from "node:assert/strict";
import {
  GOOGLE_DRIVE_SCOPE, GOOGLE_SLIDES_MIME, PPTX_MIME,
  isValidGoogleClientId, googleSlidesEditUrl, makeGoogleUploadBody,
  uploadPowerPointToGoogleSlides,
} from "./googleSlides.ts";

test("validates public OAuth Web client identifiers and narrow drive.file scope", () => {
  assert.equal(isValidGoogleClientId("123456789-abc_Xy.apps.googleusercontent.com"), true);
  assert.equal(isValidGoogleClientId("not-a-client"), false);
  assert.equal(isValidGoogleClientId("123-abcd.evil.tld"), false);
  assert.equal(GOOGLE_DRIVE_SCOPE, "https://www.googleapis.com/auth/drive.file");
});

test("builds Google Drive multipart/related with native Slides conversion", async () => {
  const binary = new Blob(["PK-PPTX-BINARY-TEST"]);
  const body = makeGoogleUploadBody(binary, "La stratégie américaine", "singe_test_12345678");
  const text = await body.text();
  assert.ok(body.type.includes("multipart/related"));
  assert.ok(text.includes('"mimeType":"' + GOOGLE_SLIDES_MIME + '"'));
  assert.ok(text.includes('"name":"La stratégie américaine"'));
  assert.ok(text.includes("Content-Type: " + PPTX_MIME));
  assert.ok(text.includes("PK-PPTX-BINARY-TEST"));
  assert.ok(text.endsWith("--singe_test_12345678--\r\n"));
  assert.throws(() => makeGoogleUploadBody(binary, "Titre", "../unsafe"));
});

test("publishes one converted presentation and returns a Google Slides URL", async () => {
  let requests = 0;
  const fetcher: typeof fetch = async (url, init) => {
    requests++;
    assert.equal(String(url).startsWith("https://www.googleapis.com/upload/drive/v3/files?"), true);
    assert.equal(init?.method, "POST");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer short-lived-test-token");
    assert.ok(new Headers(init?.headers).get("content-type")?.startsWith("multipart/related"));
    assert.ok(init?.body instanceof Blob);
    return new Response(JSON.stringify({
      id: "1GoogleSlideIdABCXYZ", name: "Titre", mimeType: GOOGLE_SLIDES_MIME,
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const result = await uploadPowerPointToGoogleSlides(
    "short-lived-test-token", new Blob([new Uint8Array(1200)]), "Titre", fetcher);
  assert.equal(result.url, "https://docs.google.com/presentation/d/1GoogleSlideIdABCXYZ/edit");
  assert.equal(result.name, "Titre");
  assert.equal(requests, 1);
});

test("rejects non-converted results, invalid file IDs and access errors", async () => {
  assert.throws(() => googleSlidesEditUrl("invalid/id"));
  const pptx = new Blob([new Uint8Array(1200)]);
  const wrongMime: typeof fetch = async () =>
    new Response(JSON.stringify({ id: "1GoogleSlideIdABCXYZ", mimeType: PPTX_MIME }),
      { status: 200, headers: { "content-type": "application/json" } });
  await assert.rejects(
    uploadPowerPointToGoogleSlides("token", pptx, "Titre", wrongMime),
    /n'a pas confirmé la conversion/);
  const blocked: typeof fetch = async () =>
    new Response(JSON.stringify({ error: { message: "Google Drive API disabled" } }),
      { status: 403, headers: { "content-type": "application/json" } });
  await assert.rejects(
    uploadPowerPointToGoogleSlides("token", pptx, "Titre", blocked), /API Google Drive/);
});
