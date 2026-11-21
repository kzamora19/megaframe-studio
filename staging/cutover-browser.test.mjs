// Browser-level release rehearsal: old cached editor -> new editor-free Pages
// retirement worker. Synthetic PWA only; no actual customer data or release.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync,rmSync} from "node:fs";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {chromium} from "playwright";
const root=resolve(fileURLToPath(new URL("../",import.meta.url)));
const target=join(root,"staging",".cutover-browser-output");
const build=join(root,"staging","build-cutover-pages.mjs");
let mode="old",server,browser;
const oldWorker=String.raw`const ROOT=new URL("./",self.location.href);
self.addEventListener("install",e=>e.waitUntil((async()=>{
 const cache=await caches.open("megaframe-shell-synthetic-old");
 await cache.addAll([ROOT.pathname,ROOT.pathname+"editor.js"]);
 await self.skipWaiting();
})()));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{
 const url=new URL(e.request.url);
 if(url.pathname===ROOT.pathname||url.pathname===ROOT.pathname+"editor.js")
  e.respondWith(caches.match(e.request).then(x=>x||fetch(e.request)));
});
`;
const oldPage='<!doctype html><title>Old public editor</title><h1>OLD PUBLIC EDITOR</h1><script src="./editor.js"></script>';
const mime=p=>p.endsWith(".js")?"application/javascript":
 p.endsWith(".html")||p.endsWith("/")?"text/html":
 p.endsWith(".webmanifest")?"application/manifest+json":
 p.endsWith(".svg")?"image/svg+xml":"application/octet-stream";
try{
 execFileSync(process.execPath,[build,target],{cwd:root,stdio:"pipe",
  env:{...process.env,PTG_STUDIO_CUTOVER_PREVIEW:"1"}});
 server=createServer((req,res)=>{
  const p=new URL(req.url,"http://localhost").pathname;
  if(!p.startsWith("/megaframe-studio/")){res.writeHead(404);res.end();return;}
  const name=p.slice("/megaframe-studio/".length)||"index.html";
  if(mode==="old"){
   if(name==="service-worker.js"){res.writeHead(200,{"Content-Type":"application/javascript","Cache-Control":"no-store"});res.end(oldWorker);return}
   if(name==="index.html"){res.writeHead(200,{"Content-Type":"text/html","Cache-Control":"no-store"});res.end(oldPage);return}
   if(name==="editor.js"){res.writeHead(200,{"Content-Type":"application/javascript","Cache-Control":"no-store"});res.end('window.oldEditorLoaded=true;');return}
   res.writeHead(404);res.end();return;
  }
  if(name==="editor.js"){res.writeHead(404,{"Cache-Control":"no-store"});res.end("Editor source retired");return}
  try{
   const data=readFileSync(join(target,name));
   res.writeHead(200,{"Content-Type":mime(name),"Cache-Control":"no-store"});res.end(data);
  }catch{res.writeHead(404);res.end()}
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 browser=await chromium.launch({headless:true,args:["--disable-dev-shm-usage"]});
 const context=await browser.newContext({viewport:{width:390,height:800}});
 const page=await context.newPage();
 const base="http://127.0.0.1:"+server.address().port+"/megaframe-studio/";
 await page.goto(base);
 assert.equal(await page.evaluate(()=>window.oldEditorLoaded),true);
 await page.evaluate(async()=>{
  await navigator.serviceWorker.register("./service-worker.js",{scope:"./"});
  await navigator.serviceWorker.ready;
  await caches.open("branchline-shell-preserve-me");
  await new Promise((resolve,reject)=>{
   const request=indexedDB.open("megaframe_named_projects_v1",1);
   request.onupgradeneeded=()=>request.result.createObjectStore("projects");
   request.onerror=()=>reject(request.error);
   request.onsuccess=()=>{
    const db=request.result,tx=db.transaction("projects","readwrite");
    tx.objectStore("projects").put({name:"Local backup should be preserved"},"test-project");
    tx.oncomplete=()=>{db.close();resolve()};
    tx.onerror=()=>reject(tx.error);
   };
  });
 });
 await page.waitForFunction(async()=> (await caches.keys()).includes("megaframe-shell-synthetic-old"));
 mode="retired";
 await page.evaluate(async()=>{
  const reg=await navigator.serviceWorker.getRegistration();
  await reg.update();
  if(reg.waiting)reg.waiting.postMessage({type:"RETIRE_NOW"});
 });
 await page.waitForFunction(async()=>{
  const names=await caches.keys();
  return !names.includes("megaframe-shell-synthetic-old")&&names.includes("branchline-shell-preserve-me");
 },{timeout:20000});
 await page.goto(base,{waitUntil:"domcontentloaded"});
 await page.getByRole("heading",{name:"MegaFrame Studio"}).waitFor();
 assert.match(await page.locator("body").textContent(),/Social Media Photo Frame Generator/);
 const result=await page.evaluate(async()=>{
  const editor=await fetch("./editor.js",{cache:"no-store"});
  const names=await caches.keys();
  const project=await new Promise((resolve,reject)=>{
   const r=indexedDB.open("megaframe_named_projects_v1");
   r.onerror=()=>reject(r.error);
   r.onsuccess=()=>{
    const db=r.result,req=db.transaction("projects","readonly").objectStore("projects").get("test-project");
    req.onerror=()=>reject(req.error);
    req.onsuccess=()=>{resolve(req.result);db.close()};
   };
  });
  return {code:editor.status,names,project};
 });
 assert.equal(result.code,404,"Retired Pages must not serve the old editor script");
 assert.ok(!result.names.includes("megaframe-shell-synthetic-old"));
 assert.ok(result.names.includes("branchline-shell-preserve-me"),"Another app's shell stays untouched");
 assert.equal(result.project?.name,"Local backup should be preserved",
   "Cutover must never erase pre-existing project data without explicit migration");
 await page.goto(base+"studio/index.html",{waitUntil:"domcontentloaded"});
 await page.getByText("A valid PTG authorization is required.").waitFor({timeout:20000});
 assert.equal(await page.locator("iframe").count(),0,
   "A direct Studio URL must not load editor code without PTG authorization");
 const protectedHtml=await context.request.get(base+"studio/index.html");
 assert.equal(protectedHtml.status(),200);
 assert.doesNotMatch(await protectedHtml.text(),/PRIVATE MEGAFRAME EDITOR BUNDLE|id="photosInput"/);
 console.log("PASS: actual Chromium SW upgrade retires old cached editor, preserves unrelated cache and IndexedDB, replaces mobile entry with PTG sign-in.");
}finally{
 await browser?.close();
 if(server)await new Promise(resolve=>server.close(resolve));
 rmSync(target,{recursive:true,force:true});
}
