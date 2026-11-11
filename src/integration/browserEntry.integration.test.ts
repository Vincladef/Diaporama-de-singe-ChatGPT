import test from "node:test";
import assert from "node:assert/strict";
import {preview} from "vite";
import {chromium} from "playwright-core";

test("production HTML loads the React login screen without ESM resolution errors",
 {timeout:45_000},async()=>{
  const server=await preview({preview:{port:5187,host:"127.0.0.1",strictPort:true},logLevel:"error"});
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1360,height:800}});
    const errors:string[]=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.on("console",message=>{if(message.type()==="error")errors.push(message.text());});
    await page.goto("http://127.0.0.1:5187/",{waitUntil:"domcontentloaded",timeout:12_000});
    await page.getByRole("heading",{name:"Diaporama de singe"}).waitFor({timeout:12_000});
    await page.getByLabel("Code d'accès privé").waitFor({timeout:5000});
    assert.equal(await page.locator("#root").isVisible(),true);
    assert.equal(errors.filter(s=>/web-worker|Failed to resolve module specifier|module script/i.test(s)).length,0,
      "browser module loader must not encounter unresolved bare imports");
    assert.ok((await page.locator("#root").innerText()).length>40,
      "React root must contain a usable login form");
  } finally{
    await browser.close();
    await new Promise<void>((resolve,reject)=>server.httpServer.close(e=>e?reject(e):resolve()));
  }
});
