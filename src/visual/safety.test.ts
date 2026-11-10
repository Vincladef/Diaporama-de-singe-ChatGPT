import {test} from "node:test";
import assert from "node:assert/strict";
import {isPublicIp,safeResourceUrl} from "./safety.ts";

test("denies local, cloud-metadata and private IP networks",()=>{
  for(const ip of ["127.0.0.1","0.0.0.0","10.1.2.3","172.31.9.9","192.168.0.1",
    "169.254.169.254","100.100.100.200","::1","fc00::2","fe80::1","2001:db8::1"]){
    assert.equal(isPublicIp(ip),false,ip);
  }
});
test("accepts HTTPS public hosts but rejects unsafe transports and credentials",()=>{
  assert.ok(safeResourceUrl("https://images.unsplash.com/photo.jpg"));
  assert.ok(safeResourceUrl("https://1.1.1.1/logo.png"));
  for(const url of ["http://images.unsplash.com/photo.jpg","https://127.0.0.1/a.png",
    "https://localhost/a","https://example.local/a","https://169.254.169.254/latest/meta-data",
    "https://user:pass@example.org/photo","file:///etc/passwd","ftp://example.com/a.png"]){
    assert.equal(safeResourceUrl(url),null,url);
  }
});
