import { test } from "node:test";
import assert from "node:assert/strict";
import { isSessionId, presenterChannel } from "./session.ts";

test("only UUID presentation sessions are accepted", () => {
  const id = "a55f43f1-43d1-469d-9cc3-9481a5db9be7";
  assert.equal(isSessionId(id), true);
  assert.equal(isSessionId(""), false);
  assert.equal(isSessionId("../editor"), false);
  assert.equal(isSessionId("fake-channel"), false);
  assert.equal(presenterChannel(id), "singe-presenter:" + id);
});
