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
  let draftScope="S".repeat(43);
  const draftKey=Buffer.alloc(32,77).toString("base64url");
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
    if(path==="/launch.js"||path==="/draft-vault.js"){
      res.writeHead(200,{"Content-Type":"application/javascript","Cache-Control":"no-store"});
      res.end(readFileSync(join(staging,path.slice(1))));return;
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
          ? {ok:true,html:privateHtml,sha256:"f".repeat(64),draftScope,draftKey,expiresAt:new Date(Date.now()+600000).toISOString()}
          : {ok:true,html:privateHtml,sha256:manifest.sha256,draftScope,draftKey,expiresAt:new Date(Date.now()+600000).toISOString()};
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
  await frame.locator("#frameLibrary").waitFor({state:"attached",timeout:30000});
  assert.equal(await frame.locator("#frameLibrary").isHidden(),true);
  assert.match(await frame.locator("title").textContent(),/MegaFrame Studio/);
  // A CSP hash is required for each private script. Do not broaden to unsafe-inline.
  assert.equal(manifest.inlineScriptHashes,16);
  assert.match(privateHtml,/script-src[^;]*'sha256-/);
  assert.doesNotMatch(privateHtml,/script-src[^;]*'unsafe-inline'/);
  const canvas=await frame.locator("#previewCanvas").evaluate(el=>({
    width:el.width,height:el.height
  }));
  assert.ok(canvas.width>1000&&canvas.height>1000,"Actual editor canvas is present");
  // Exercise real editor photo loading and PNG export, not just DOM mounting.
  const encoded=await page.evaluate(()=>{
    const image=document.createElement("canvas");
    image.width=320;image.height=320;
    const ctx=image.getContext("2d");
    ctx.fillStyle="#e1e7fb";ctx.fillRect(0,0,320,320);
    ctx.fillStyle="#2c5de4";ctx.fillRect(55,45,215,230);
    ctx.fillStyle="#ffe0a8";ctx.beginPath();ctx.arc(160,145,70,0,Math.PI*2);ctx.fill();
    return image.toDataURL("image/png").split(",")[1];
  });
  await frame.locator("#photosInput").setInputFiles({
    name:"qa-photo.png",mimeType:"image/png",buffer:Buffer.from(encoded,"base64"),
  });
  const started=Date.now();
  let photoLabel="";
  while(Date.now()-started<30000){
    photoLabel=await frame.locator("#photoCount").textContent();
    if(/1 photo/i.test(photoLabel||""))break;
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  assert.match(photoLabel,/1 photo/i,"Protected editor should import a real user image");
  await frame.locator('#pinNav button[data-panel="5"]').click({timeout:10000});
  const exportVisible=await frame.locator("#exportType").isVisible();
  if(!exportVisible){
    const chain=await frame.locator("#exportType").evaluate(element=>{
      const rows=[];let node=element;
      while(node&&rows.length<9){
        const style=getComputedStyle(node),rect=node.getBoundingClientRect();
        rows.push({tag:node.tagName,id:node.id,cls:String(node.className||"").slice(0,45),
          display:style.display,visibility:style.visibility,width:Math.round(rect.width),
          height:Math.round(rect.height)});
        node=node.parentElement;
      }
      return rows;
    });
    console.log("STAGED_EXPORT_VISIBILITY:",JSON.stringify(chain));
  }
  assert.equal(exportVisible,true,"Export selector should be visible after importing a photo");
  await frame.locator("#exportType").selectOption("image/png");
  const [download]=await Promise.all([
    page.waitForEvent("download",{timeout:90000}),
    frame.locator("#downloadOne").click({timeout:20000}),
  ]);
  const bytes=readFileSync(await download.path());
  assert.equal(bytes.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  assert.ok(bytes.readUInt32BE(16)>=200,"Exported PNG needs valid output width");
  // Offline draft saving is a separate release gate. Keep its observed status
  // visible in CI rather than silently claiming it works in opaque origin.
  await frame.locator('#pinNav button[data-panel="0"]').click({timeout:10000});
  await frame.locator("#saveDraftNow").click({timeout:20000});
  await frame.locator("#draftStatus").getByText(/Draft saved on this device/i).waitFor({timeout:20000});
  const draftText=await frame.locator("#draftStatus").textContent();
  console.log("STAGED_DRAFT_STATUS:",String(draftText||"").slice(0,350));
  assert.match(String(draftText||""),/Draft saved on this device/i,
    "Protected-editor photo drafts must survive a closed/revoked session. Do not release without secure persistence.");
  mode="revoked";
  await page.waitForFunction(()=>document.getElementById("studio-editor-frame")===null,
    {timeout:90000});
  assert.match(await page.locator("#status").textContent(),/revoked|cannot be verified/i);
  assert.ok(requests.some(x=>x.action==="load"));
  assert.ok(requests.some(x=>x.action==="check"));
  // A new valid PTG launch under the same account restores the real photo.
  mode="authorized";
  await page.goto(origin+"/index.html#ptg_studio_ticket="+"C".repeat(43),
    {waitUntil:"domcontentloaded"});
  await page.locator("#studio-editor-frame").waitFor({timeout:90000});
  const restored=page.frameLocator("#studio-editor-frame");
  await restored.locator("#actionModal").waitFor({state:"visible",timeout:30000});
  assert.match(await restored.locator("#actionModalTitle").textContent(),
    /Restore unfinished editing session/);
  await restored.locator("#actionModalConfirm").click();
  await restored.locator("#photoCount").getByText(/1 photo/i).waitFor({timeout:20000});
  assert.match(await restored.locator("#draftStatus").textContent(),/Draft saved|Auto-save|Restored/i);

  // Changing the PTG account's server-issued recovery scope MUST NOT display
  // another account's unfinished photos, even with the same test crypto key.
  draftScope="X".repeat(43);
  // Switch from /index.html to / to force a real navigation, not just a
  // same-document hash change that cannot restart a locked launcher.
  await page.goto(origin+"/#ptg_studio_ticket="+"D".repeat(43),
    {waitUntil:"domcontentloaded"});
  await page.locator("#studio-editor-frame").waitFor({timeout:90000});
  const other=page.frameLocator("#studio-editor-frame");
  await other.locator("#photoCount").waitFor({timeout:30000});
  assert.match(await other.locator("#photoCount").textContent(),/0 photos/i);
  assert.equal(await other.locator("#actionModal").isVisible(),false);
  // Stored bytes must be opaque ciphertext rather than a plaintext photo record.
  const encrypted=await page.evaluate(async () => {
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open("megaframe-protected-draft-v1");
      req.onerror=()=>reject(Error("Vault database unavailable"));
      req.onsuccess=()=>{
        const tx=req.result.transaction("drafts","readonly");
        const get=tx.objectStore("drafts").get("S".repeat(43));
        get.onerror=()=>reject(Error("Stored draft unavailable"));
        get.onsuccess=()=>{
          const value=get.result;
          resolve(!!value && value.format==="AES-GCM-v1" &&
            value.encrypted instanceof ArrayBuffer &&
            value.iv instanceof Uint8Array && value.encrypted.byteLength>100);
        };
      };
    });
  });
  assert.equal(encrypted,true,"All locally stored photo drafts must be AES-GCM ciphertext");
  assert.ok(requests.every(x=>/^[ABCD]{43}$/.test(x.ticket)));
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
