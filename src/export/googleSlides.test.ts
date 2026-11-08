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


test("large PowerPoint converts with Drive resumable upload rather than multipart", async () => {
  const pptx = new Blob([new Uint8Array(5_000_100)]);
  let requests = 0;
  const session = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=example";
  const mock: typeof fetch = async (url, init) => {
    requests++;
    if (requests === 1) {
      assert.ok(String(url).includes("uploadType=resumable"));
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("x-upload-content-type"), PPTX_MIME);
      assert.equal(new Headers(init?.headers).get("x-upload-content-length"), String(pptx.size));
      assert.match(String(init?.body), /application\\/vnd\\.google-apps\\.presentation/);
      return new Response(null, { status: 200, headers: { location: session } });
    }
    assert.equal(requests, 2);
    assert.equal(url, session);
    assert.equal(init?.method, "PUT");
    assert.equal(init?.body, pptx);
    assert.equal(new Headers(init?.headers).get("content-range"), "bytes 0-" + (pptx.size - 1) + "/" + pptx.size);
    return new Response(JSON.stringify({ id: "1GoogleSlideIdABCXYZ", name: "Grand diaporama",
      mimeType: GOOGLE_SLIDES_MIME }), {
      status: 201, headers: { "content-type": "application/json" },
    });
  };
  const result = await uploadPowerPointToGoogleSlides("token", pptx, "Grand diaporama", mock);
  assert.equal(requests, 2);
  assert.match(result.url, /1GoogleSlideIdABCXYZ/);
});

test("resumable upload rejects missing session URL or a non-Google session origin", async () => {
  const pptx = new Blob([new Uint8Array(5_000_100)]);
  let calls = 0;
  const missing: typeof fetch = async () => { calls++; return new Response(null, { status: 200 }); };
  await assert.rejects(uploadPowerPointToGoogleSlides("token", pptx, "Test", missing), /adresse de transfert/);
  assert.equal(calls, 1);

  const malicious: typeof fetch = async () =>
    new Response(null, { status: 200, headers: { location: "https://drive.evil.example/steal" } });
  await assert.rejects(uploadPowerPointToGoogleSlides("token", pptx, "Test", malicious), /transfert Google invalide/);
});
