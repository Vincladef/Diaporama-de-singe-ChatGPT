import test from "node:test";
import assert from "node:assert/strict";
import { digest, isChatGptRedirect, ORIGIN, RESOURCE, safeEqual } from "./security.ts";

test("the MCP OAuth resource is restricted to the ChatGPT duplicate",()=>{
 assert.equal(RESOURCE,ORIGIN+"/mcp");
 assert.ok(RESOURCE.includes("diaporama-de-singe-chatgpt.netlify.app"));
 assert.ok(!RESOURCE.includes("diaporama-de-singe.netlify.app/mcp"));
});
test("only ChatGPT OAuth callbacks may be registered",()=>{
 assert.equal(isChatGptRedirect("https://chatgpt.com/connector_platform_oauth_redirect"),true);
 assert.equal(isChatGptRedirect("https://chatgpt.com/connector/oauth/example"),true);
 for(const candidate of ["http://chatgpt.com/connector_platform_oauth_redirect","https://evil.example/callback",
   "https://chatgpt.com.evil.example/connector/oauth/x","javascript:alert(1)","https://chatgpt.com/"]) {
  assert.equal(isChatGptRedirect(candidate),false,candidate);
 }
});
test("constant-time token check requires exact bytes",()=>{
 assert.equal(safeEqual("0123456","0123456"),true);
 assert.equal(safeEqual("0123456","0123457"),false);
 assert.equal(safeEqual("abc","abcdef"),false);
});
test("token hashes are stable without revealing bearer value",()=>{
 assert.equal(digest("test-token").length,64);
 assert.notEqual(digest("test-token"),digest("other-token"));
});
