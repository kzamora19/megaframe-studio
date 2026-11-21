import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync,readdirSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {execFileSync} from "node:child_process";
const root=resolve(new URL("../",import.meta.url).pathname);
const path=join(root,"staging","build-cutover-pages.mjs");
const target=join(root,"staging",".cutover-test-output");
const run=(env,out=target)=>execFileSync(process.execPath,[path,out],{cwd:root,env:{...process.env,PTG_STUDIO_CUTOVER_PREVIEW:env},stdio:"pipe",timeout:20000});
test("Cutover cannot run unintentionally or target the normal Pages output",()=>{
 assert.throws(()=>run(""),{name:"Error"});
 assert.throws(()=>run("1",join(root,"_site")),{name:"Error"});
 assert.throws(()=>run("1",mkdtempSync(join(tmpdir(),"bad-cutover-"))),{name:"Error"});
});
test("Retirement Pages artifact excludes editor source, preserves icon, and includes PTG portal",()=>{
 try{
  run("1");
  const names=readdirSync(target).sort();
  assert.deepEqual(names,[".nojekyll","icons","index.html","manifest.webmanifest","retire-client.js","service-worker.js","studio"]);
  const html=readFileSync(join(target,"index.html"),"utf8");
  const sw=readFileSync(join(target,"service-worker.js"),"utf8");
  const client=readFileSync(join(target,"retire-client.js"),"utf8");
  assert.match(html,/Social Media Photo Frame Generator/);
  assert.match(html,/https:\/\/kzamora19\.github\.io\/first-megasaver-ptg\/studios\//);
  assert.doesNotMatch(html,/editor\.js|sample_image|gold_image|private\/studio|auth_token/i);
  assert.match(sw,/megaframe-shell-/);
  assert.match(sw,/skipWaiting/);
  assert.match(sw,/clients\.claim/);
  assert.match(sw,/cache:"no-store"/);
  assert.doesNotMatch(sw,/caches\.match|caches\.open|indexedDB|localStorage/);
  assert.doesNotMatch(client,/indexedDB\.(?:deleteDatabase|open)|localStorage\.(?:clear|removeItem)|caches\.delete|unregister\(/);
  assert.equal(readdirSync(join(target,"icons")).length,3);
  assert.deepEqual(readdirSync(join(target,"studio")).sort(),["central-drive.js","draft-vault.js","index.html","launch.js"]);
  const entry=readFileSync(join(target,"studio","index.html"),"utf8");
  assert.match(entry,/MegaFrame Studio — Branchline protected editor/);
  assert.match(entry,/megaframe-editor-delivery/);
  assert.match(entry,/\.\/launch\.js/);
  assert.doesNotMatch(entry,/PRIVATE MEGAFRAME EDITOR BUNDLE|id="photosInput"|<canvas/);
  assert.match(readFileSync(join(target,"studio","launch.js"),"utf8"),/ptg_studio_ticket/);
  assert.match(readFileSync(join(target,"studio","draft-vault.js"),"utf8"),/AES-GCM/);
  assert.throws(()=>execFileSync(process.execPath,[path,target],{cwd:root,
   env:{...process.env,PTG_STUDIO_CUTOVER_PREVIEW:"1",PTG_STUDIO_PRODUCTION_RELEASE:"1",
     MEGAFRAME_STUDIO_PUBLISHABLE_KEY:""},
   stdio:"pipe",timeout:20000}),{name:"Error"});

  const workflow=readFileSync(join(root,".github/workflows/pages.yml"),"utf8");
  assert.match(workflow,/vars\.MEGAFRAME_CUTOVER_APPROVED == 'true'/,
    "Main-branch Pages publishing must require explicit release approval");
  assert.match(workflow,/github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
  const publisher=workflow.slice(workflow.indexOf("\n  publish:"));
  assert.match(publisher,/PTG_STUDIO_CUTOVER_PREVIEW=1 node staging\/build-cutover-pages\.mjs staging\/\.cutover-release/);
  assert.match(publisher,/path: staging\/\.cutover-release/);
  assert.doesNotMatch(publisher,/python3 scripts\/build_pages_site\.py _site/);
  assert.equal(readFileSync(join(root,"scripts/build_pages_site.py"),"utf8").includes("build-cutover-pages"),false,
   "Production Pages publish job must not be changed before approval");
 }finally{rmSync(target,{recursive:true,force:true});}
});
