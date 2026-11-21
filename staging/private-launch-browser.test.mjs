// Isolated browser test with mocked PTG + Supabase. No production calls.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {createHash,randomUUID,randomBytes,webcrypto} from "node:crypto";
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
  const mockProofSessions=new Map();
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
        assert.match(body.ticket,/^[A-Z]{43}$/);
        assert.equal(body.publicKey?.kty,"EC");
        assert.equal(body.publicKey?.crv,"P-256");
        assert.equal(body.publicKey?.d,undefined,"Browser must never export private key");
        const sessionId=randomUUID(),challenge=randomBytes(32).toString("base64url");
        mockProofSessions.set(sessionId,{challenge,publicKey:body.publicKey});
        const payload={
          ok:true,html:privateHtml,sessionId,challenge,sha256:mode==="bad-hash"?"f".repeat(64):manifest.sha256,
          draftScope,draftKey,expiresAt:new Date(Date.now()+600000).toISOString()
        };
        return route.fulfill({status:200,contentType:"application/json",headers,body:JSON.stringify(payload)});
      }
      if(body.action==="check"){
        assert.equal(body.ticket,undefined,"Redeemed bearer ticket must not be replayed on checks");
        const old=mockProofSessions.get(body.sessionId);
        if(!old||body.challenge!==old.challenge)
          return route.fulfill({status:403,contentType:"application/json",headers,
            body:JSON.stringify({ok:false,error:"Replayed or invalid challenge"})});
        const key=await webcrypto.subtle.importKey("jwk",old.publicKey,
          {name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
        const statement=new TextEncoder().encode(
          "ptg-studio-v1|megaframe|"+body.sessionId+"|"+body.challenge);
        const signature=Buffer.from(body.signature||"","base64url");
        const valid=await webcrypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},
          key,signature,statement);
        if(!valid)return route.fulfill({status:403,contentType:"application/json",headers,
          body:JSON.stringify({ok:false,error:"Invalid signature"})});
        old.challenge=randomBytes(32).toString("base64url");
        return route.fulfill({status:200,contentType:"application/json",headers,
          body:JSON.stringify({ok:true,sessionId:body.sessionId,challenge:old.challenge,
            expiresAt:new Date(Date.now()+600000).toISOString()})});
      }
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
    "allow-scripts allow-downloads allow-modals");
  assert.doesNotMatch(await page.locator("#studio-editor-frame").getAttribute("sandbox"),/allow-same-origin/,
    "The protected frame must stay opaque even with native modal support.");
  const frame=page.frameLocator("#studio-editor-frame");
  assert.equal((await frame.locator(".brandtag").textContent()).trim(),
    "Social Media Photo Frame Generator");
  const headerChrome=await frame.locator(".appbar").evaluate(el=>({
    background:getComputedStyle(el).backgroundColor,
    subtitle:getComputedStyle(el.querySelector(".brandtag")).color,
  }));
  assert.equal(headerChrome.background,"rgb(29, 40, 54)",
    "Protected MegaFrame uses the Branchline navy header.");
  assert.equal(headerChrome.subtitle,"rgb(220, 230, 255)");
  await frame.locator("#previewCanvas").waitFor({timeout:90000});
  // Latest production startup choice must also work inside the private editor.
  try{
    await frame.locator("#startupChoiceDialog[open]").waitFor({timeout:12000});
  }catch(error){
    const diagnostic=await frame.locator("body").evaluate(()=>({
      status:document.getElementById("status")?.textContent,
      startupExists:!!document.getElementById("startupChoiceDialog"),
      startupOpen:document.getElementById("startupChoiceDialog")?.open,
      visibleDialogTitles:[...document.querySelectorAll("dialog[open]")].map(d=>d.querySelector("h2")?.textContent||d.id),
      draftStatus:document.getElementById("draftStatus")?.textContent,
      toast:document.getElementById("toast")?.textContent,
      bridge:typeof window.__MEGAFRAME_PRIVATE_DRAFT__,
      appState:typeof app!=="undefined"?{
        template:app.template?.name,photoCount:app.photos?.length,frameReady:!!app.frame
      }:null
    })).catch(e=>({failedToInspect:e.message}));
    console.log("MEGAFRAME_PRIVATE_STARTUP_DIAGNOSTIC",JSON.stringify({
      diagnostic,pageErrors:errors.slice(0,20),launcher:await page.locator("#status").textContent().catch(()=>null),
      requestCount:requests.length
    }));
    throw error;
  }
  assert.equal(await frame.locator("#createNewProject").isVisible(),true);
  assert.equal(await frame.locator("#retrieveStartupProject").isVisible(),true);
  await frame.locator("#createNewProject").click();
  await frame.locator("#startupChoiceDialog").waitFor({state:"hidden"});
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
  // Current v2.7 intentionally starts NEW projects with an empty frame and no
  // photo opening. Select an existing frame through its actual library UI
  // before testing face-cover placement (which requires a valid opening).
  const initialShape=await frame.locator("#previewCanvas").evaluate(()=>app.shape?.type);
  assert.equal(initialShape,"none","New Project must begin without a preselected photo opening");
  await frame.locator("#openFrameLibrary").click();
  await frame.locator("#frameLibrary[open]").waitFor({timeout:15000});
  await frame.locator("#frameLibGrid .frameLibCard").first()
    .getByRole("button",{name:"Open frame"}).click();
  await frame.locator("#frameLibrary").waitFor({state:"hidden",timeout:15000});
  const selectedOpening=await frame.locator("#previewCanvas").evaluate(
    ()=>({type:app.shape?.type,points:app.shape?.points?.length||0}));
  assert.ok(selectedOpening.points>=3,
    "QA requires a frame with a saved photo opening before adding a face-cover emoji");
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
  // Regression: live MegaFrame emoji privacy covers must also work in the
  // private opaque-origin editor, not only on the public GitHub Pages site.
  assert.equal(await frame.locator("#addEmojiCover").isDisabled(), false,
    "Privacy cover button must be available after importing a photo");
  await frame.locator("#addEmojiCover").click();
  await frame.locator("#emojiPickerDialog[open]").waitFor();
  await frame.locator("#emojiPickerSearch").fill("monkey hide");
  assert.equal(await frame.locator("#emojiPickerGrid button").count(),1,
    "Updated private editor includes searchable live emoji picker");
  await frame.locator("#emojiPickerGrid button").first().click();
  const protectedCover = await frame.locator("#previewCanvas").evaluate(() =>
    app.photos[0]?.covers?.[0]);
  assert.equal(protectedCover?.symbol, "🙈",
    "Privacy cover must be applied inside the protected editor");
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
  // The latest LIVE Save Project library must use the same encrypted parent
  // vault, not a second plaintext IndexedDB in the opaque iframe.
  await frame.locator("#saveProject").click({timeout:15000});
  await frame.locator("#actionModalInput").fill("Protected Customer Project");
  await frame.locator("#actionModalConfirm").click();
  await frame.locator("#projectSaveStatus").getByText(/Protected Customer Project/).waitFor({timeout:30000});
  await frame.locator("#openProjects").click();
  await frame.locator("#savedProjectsDialog[open]").waitFor();
  await frame.locator(".savedProjectCard").filter({hasText:"Protected Customer Project"}).waitFor({timeout:20000});
  assert.equal(await frame.locator(".savedProjectCard").count(),1);
  // Simulate migrating a portable project saved by the old public MegaFrame:
  // same JSON format, with unencrypted original customer photo in the export.
  const [backupDownload]=await Promise.all([
    page.waitForEvent("download",{timeout:30000}),
    frame.locator(".savedProjectCard").first().getByRole("button",{name:"Backup"}).click(),
  ]);
  const oldProjectBackup=readFileSync(await backupDownload.path());
  const oldBackupRecord=JSON.parse(oldProjectBackup.toString("utf8"));
  assert.equal(oldBackupRecord.format,"MegaFrameProjectV1");
  assert.equal(oldBackupRecord.payload.photos.length,1);
  assert.equal(oldBackupRecord.payload.photos[0].covers[0].symbol,"🙈");
  assert.match(oldBackupRecord.payload.photos[0].data,/^data:image\/png;base64,/,
    "Portable legacy backup contains original customer photo; warn users to secure the JSON");
  await frame.locator("#closeSavedProjects").click();
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
  await restored.locator("#startupChoiceDialog[open]").waitFor({timeout:30000});
  await restored.locator("#retrieveStartupProject").click();
  await restored.locator("#savedProjectsDialog[open]").waitFor({timeout:30000});
  assert.equal(await restored.locator("#automaticRecoveryCard").isHidden(),false,
    "Previous recovery must be offered rather than silently opened.");
  await restored.locator("#restoreRecoveryDraft").click();
  await restored.locator("#savedProjectsDialog").waitFor({state:"hidden",timeout:20000});
  await restored.locator("#photoCount").waitFor({state:"attached",timeout:20000});
  assert.match(await restored.locator("#photoCount").textContent(),/1 photo/i,
    "Encrypted photo draft must restore even while the Import section is collapsed.");
  assert.match(await restored.locator("#draftStatus").textContent(),/Draft saved|Auto-save|Restored/i);
  await restored.locator("#openProjects").click();
  await restored.locator("#savedProjectsDialog[open]").waitFor();
  await restored.locator(".savedProjectCard").filter({hasText:"Protected Customer Project"}).waitFor({timeout:25000});
  assert.ok(await restored.locator(".savedProjectCard").count()>=1,
    "Named projects and archived recovery must survive PTG revocation and relaunch.");
  await restored.locator(".savedProjectCard").filter({hasText:"Protected Customer Project"})
    .getByRole("button",{name:"Open"}).click();
  await restored.locator("#actionModalConfirm").click();
  await restored.locator("#savedProjectsDialog").waitFor({state:"hidden",timeout:20000});
  assert.match(await restored.locator("#photoCount").textContent(),/1 photo/i,
    "Named project restored the real customer image even if counter panel is collapsed");
  const namedCover=await restored.locator("#previewCanvas").evaluate(()=>
    app.photos[0]?.covers?.[0]?.symbol);
  assert.equal(namedCover,"🙈","Opening encrypted named project restores customer photo edits.");
  const recoveredCover = await restored.locator("#previewCanvas").evaluate(() =>
    app.photos[0]?.covers?.[0]);
  assert.equal(recoveredCover?.symbol, "🙈",
    "Encrypted PTG-account-scoped draft recovery must preserve emoji privacy covers");

  // Changing the PTG account's server-issued recovery scope MUST NOT display
  // another account's unfinished photos, even with the same test crypto key.
  draftScope="X".repeat(43);
  // Switch from /index.html to / to force a real navigation, not just a
  // same-document hash change that cannot restart a locked launcher.
  await page.goto(origin+"/#ptg_studio_ticket="+"D".repeat(43),
    {waitUntil:"domcontentloaded"});
  await page.locator("#studio-editor-frame").waitFor({timeout:90000});
  const other=page.frameLocator("#studio-editor-frame");
  await other.locator("#startupChoiceDialog[open]").waitFor({timeout:30000});
  await other.locator("#retrieveStartupProject").click();
  await other.locator("#savedProjectsDialog[open]").waitFor({timeout:30000});
  await other.locator("#photoCount").waitFor({state:"attached",timeout:30000});
  assert.match(await other.locator("#photoCount").textContent(),/0 photos/i);
  assert.equal(await other.locator("#actionModal").isVisible(),false);
  await other.locator("#projectListStatus").getByText(/No saved projects yet/i).waitFor({timeout:25000});
  assert.equal(await other.locator(".savedProjectCard").count(),0,
    "Another PTG account must not see saved customer projects.");
  // User-directed migration is different from unauthorized account access:
  // a consciously imported portable JSON backup must become newly encrypted
  // in the current PTG account's private project vault, not inherited silently.
  await other.locator("#importProjectFile").setInputFiles({
    name:"legacy-megaframe-backup.json",mimeType:"application/json",buffer:oldProjectBackup
  });
  await other.locator(".savedProjectCard").filter({hasText:"Protected Customer Project"})
    .waitFor({timeout:30000});
  assert.equal(await other.locator(".savedProjectCard").count(),1,
    "Legacy portable project backup imports to new authorized account.");
  const newlyEncrypted=await page.evaluate(async()=>{
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open("megaframe-protected-draft-v1");
      req.onerror=()=>reject(Error("Account-scoped project vault missing"));
      req.onsuccess=()=>{
        const tx=req.result.transaction("drafts","readonly"),store=tx.objectStore("drafts");
        const keyReq=store.getAllKeys();
        keyReq.onerror=()=>reject(Error("Project keys missing"));
        keyReq.onsuccess=()=>{
          const key=keyReq.result.find(k=>typeof k==="string"&&k.startsWith("X".repeat(43)+":project:"));
          if(!key){resolve(false);return}
          const read=store.get(key);
          read.onerror=()=>reject(Error("Project ciphertext missing"));
          read.onsuccess=()=>resolve(read.result?.format==="AES-GCM-v1"&&
            read.result.encrypted instanceof ArrayBuffer &&
            read.result.iv instanceof Uint8Array &&
            !Object.hasOwn(read.result,"photos"));
        };
      };
    });
  });
  assert.equal(newlyEncrypted,true,"Imported old portable project must be re-encrypted to new PTG account.");
  await other.locator(".savedProjectCard").first().getByRole("button",{name:"Open"}).click();
  await other.locator("#actionModalConfirm").click();
  await other.locator("#savedProjectsDialog").waitFor({state:"hidden",timeout:20000});
  const migrated=await other.locator("#previewCanvas").evaluate(() => ({
    count:app.photos.length,symbol:app.photos[0]?.covers?.[0]?.symbol
  }));
  assert.deepEqual(migrated,{count:1,symbol:"🙈"},
    "Legacy customer photo and privacy cover are restored through the new encrypted vault.");
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
  const namedEncrypted=await page.evaluate(async()=>{
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open("megaframe-protected-draft-v1");
      req.onerror=()=>reject(Error("Encrypted named-project vault unavailable"));
      req.onsuccess=()=>{
        const tx=req.result.transaction("drafts","readonly"),store=tx.objectStore("drafts");
        const keys=store.getAllKeys();
        keys.onerror=()=>reject(Error("Encrypted project index unavailable"));
        keys.onsuccess=()=>{
          const key=keys.result.find(x=>typeof x==="string"&&
            x.startsWith("S".repeat(43)+":project:"));
          if(!key){resolve(false);return;}
          const read=store.get(key);
          read.onerror=()=>reject(Error("Encrypted project record unavailable"));
          read.onsuccess=()=>{
            const rec=read.result;
            resolve(rec?.format==="AES-GCM-v1"&&
              rec.encrypted instanceof ArrayBuffer&&
              rec.iv instanceof Uint8Array&&
              !Object.hasOwn(rec,"photos")&&!Object.hasOwn(rec,"name"));
          };
        };
      };
    });
  });
  assert.equal(namedEncrypted,true,"Saved project photo and name must be AES-GCM ciphertext.");

  assert.ok(requests.filter(x=>x.action==="load")
    .every(x=>/^[ABCD]{43}$/.test(x.ticket)));
  assert.ok(requests.filter(x=>x.action==="check")
    .every(x=>!Object.hasOwn(x,"ticket") && /^[A-Za-z0-9_-]{80,96}$/.test(x.signature)));

  // Branding must also fit a narrow mobile screen without modifying editor data.
  await page.setViewportSize({width:390,height:800});
  const mobileHeader=await other.locator(".appbar").evaluate(el=>({
    title:el.querySelector(".brandname")?.textContent?.trim(),
    subtitle:el.querySelector(".brandtag")?.textContent?.trim(),
    right:el.getBoundingClientRect().right,
    width:document.documentElement.clientWidth,
  }));
  assert.equal(mobileHeader.title,"MegaFrame Studio");
  assert.equal(mobileHeader.subtitle,"Social Media Photo Frame Generator");
  assert.ok(mobileHeader.right<=mobileHeader.width+2,
    "Protected mobile MegaFrame header must fit the iframe viewport.");
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
