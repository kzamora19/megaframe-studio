// Isolated browser test with mocked PTG + Supabase. No production calls.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {chromium} from "playwright";

const root=resolve(dirname(fileURLToPath(import.meta.url)), "..");
const staging=join(root,"staging/studio-access");
const tmp=mkdtempSync(join(tmpdir(),"megaframe-isolated-"));
let server, browser;
try {
  execFileSync(process.execPath,[join(root,"staging/build-private-package.mjs"),tmp],
    {cwd:root,stdio:"pipe",timeout:60000});
  const privateHtml=readFileSync(join(tmp,"private/studio.html"),"utf8");
  const manifest=JSON.parse(readFileSync(join(tmp,"manifest.json"),"utf8"));
  const sha=value=>createHash("sha256").update(value).digest("hex");
  assert.equal(sha(privateHtml),manifest.sha256);
  const original=readFileSync(join(staging,"index.html"),"utf8");
  assert.ok(original.includes('publishableKey: ""'));
  const html=original.replace('publishableKey: ""','publishableKey: "test-publishable"')
    .replace("checkIntervalMs: 30000","checkIntervalMs: 700");
  server=createServer((req,res)=>{
    const path=new URL(req.url,"http://localhost").pathname;
    if(path==="/"||path==="/index.html"){
      res.writeHead(200,{"Content-Type":"text/html","Cache-Control":"no-store"});
      res.end(html);return;
    }
    if(path==="/launch.js"){
      res.writeHead(200,{"Content-Type":"application/javascript","Cache-Control":"no-store"});
      res.end(readFileSync(join(staging,"launch.js")));return;
    }
    res.writeHead(404,{"Content-Type":"text/plain"});res.end("Not available.");
  });
  await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
  const origin="http://127.0.0.1:"+server.address().port;
  browser=await chromium.launch({headless:true,args:["--disable-dev-shm-usage"]});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  let mode="authorized",errors=[],requests=[];
  await context.route("**/*",async route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin)return route.continue();
    if(url.hostname==="vmyoxoiygfcecgkbavgg.supabase.co"&&
       url.pathname==="/functions/v1/megaframe-editor-delivery"){
      if(route.request().method()==="OPTIONS")
        return route.fulfill({status:204,headers:{
          "Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"*",
          "Access-Control-Allow-Methods":"POST, OPTIONS"}});
      const body=route.request().postDataJSON();
      requests.push(body);
      const headers={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"*"};
      if(mode==="revoked")return route.fulfill({status:403,contentType:"application/json",headers,
        body:JSON.stringify({ok:false,error:"Revoked"})});
      if(body.action==="load"){
        const payload=mode==="bad-hash"
          ? {ok:true,html:privateHtml,sha256:"f".repeat(64),expiresAt:new Date(Date.now()+600000).toISOString()}
          : {ok:true,html:privateHtml,sha256:manifest.sha256,expiresAt:new Date(Date.now()+600000).toISOString()};
        return route.fulfill({status:200,contentType:"application/json",headers,body:JSON.stringify(payload)});
      }
      return route.fulfill({status:200,contentType:"application/json",headers,
        body:JSON.stringify({ok:true,expiresAt:new Date(Date.now()+600000).toISOString()})});
    }
    return route.fulfill({status:404,body:"External service disabled in staging"});
  });
  const invalid=await context.newPage();
  await invalid.goto(origin,{waitUntil:"domcontentloaded"});
  await invalid.getByText("A valid PTG authorization is required.").waitFor();
  assert.equal(await invalid.locator("#studio-editor-frame").count(),0);
  await invalid.close();

  const forged=await context.newPage();
  mode="bad-hash";
  await forged.goto(origin+"/#ptg_studio_ticket="+"B".repeat(43),{waitUntil:"domcontentloaded"});
  await forged.getByText("Could not verify protected MegaFrame Studio access.").waitFor({timeout:60000});
  assert.equal(new URL(forged.url()).hash,"");
  assert.equal(await forged.locator("#studio-editor-frame").count(),0,"Tampered bundle must not mount");
  await forged.close();

  mode="authorized";
  const page=await context.newPage();
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(origin+"/#ptg_studio_ticket="+"A".repeat(43),{waitUntil:"domcontentloaded"});
  await page.locator("#studio-editor-frame").waitFor({timeout:90000});
  assert.equal(new URL(page.url()).hash,"");
  assert.equal(await page.locator("#studio-editor-frame").getAttribute("sandbox"),
    "allow-scripts allow-downloads");
  const frame=page.frameLocator("#studio-editor-frame");
  await frame.locator("#previewCanvas").waitFor({timeout:90000});
  await frame.locator("#frameLibrary").waitFor({timeout:90000});
  assert.match(await frame.locator("title").textContent(),/MegaFrame Studio/);
  // A CSP hash is required for each private script. Do not broaden to unsafe-inline.
  assert.equal(manifest.inlineScriptHashes,15);
  assert.match(privateHtml,/script-src[^;]*'sha256-/);
  assert.doesNotMatch(privateHtml,/script-src[^;]*'unsafe-inline'/);
  const canvas=await frame.locator("#previewCanvas").evaluate(el=>({
    width:el.width,height:el.height
  }));
  assert.ok(canvas.width>1000&&canvas.height>1000,"Actual editor canvas is present");
  mode="revoked";
  await page.waitForFunction(()=>document.getElementById("studio-editor-frame")===null,
    {timeout:90000});
  assert.match(await page.locator("#status").textContent(),/revoked|cannot be verified/i);
  assert.ok(requests.some(x=>x.action==="load"));
  assert.ok(requests.some(x=>x.action==="check"));
  assert.ok(requests.every(x=>/^[AB]{43}$/.test(x.ticket)));
  // Collect errors explicitly; these expose compatibility problems with
  // opaque-origin localStorage, OAuth, or the original editor scripts.
  if(errors.length)console.log("STAGED_EDITOR_ERRORS:",JSON.stringify(errors.slice(0,12)));
  assert.deepEqual(errors,[],"Private editor initialization should not throw");
  console.log("PASS: no-ticket/hash denial, isolated full editor canvas and revocation.");
} finally {
  await browser?.close();
  if(server)await new Promise(ok=>server.close(ok));
  rmSync(tmp,{recursive:true,force:true});
}
