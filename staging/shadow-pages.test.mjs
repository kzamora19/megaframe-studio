import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,existsSync,readFileSync,readdirSync,rmSync,statSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,dirname,relative} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const out=mkdtempSync(join(tmpdir(),"branchline-shadow-artifact-"));
const baseline=mkdtempSync(join(tmpdir(),"branchline-shadow-baseline-"));
const key="sb_publishable_jyCflrfvPnPb6O3ncmlG2w_w4FeKz40";
const builder="staging/build-shadow-pages.mjs";
function run(ok,vars={}){
 try{
  execFileSync(process.execPath,[join(root,builder),out],{
    cwd:root,stdio:"pipe",timeout:25000,env:{...process.env,
      PTG_STUDIO_SHADOW_PREVIEW:ok?"1":"0",
      MEGAFRAME_STUDIO_PUBLISHABLE_KEY:key,...vars}
  });return null;
 }catch(error){return error;}
}
function all(rootDir,prefix=""){
 return readdirSync(rootDir,{withFileTypes:true}).flatMap(file=>{
  const name=join(prefix,file.name);
  return file.isDirectory()?all(join(rootDir,file.name),name):[name];
 });
}
function identicalPublicTree(a,b){
 const nonStudio=files=>files.filter(x=>!x.startsWith("studio/"));
 const files=nonStudio(all(a));
 assert.deepEqual(files,nonStudio(all(b)));
 for(const file of files){
  assert.deepEqual(readFileSync(join(a,file)),readFileSync(join(b,file)),file+" changed in shadow preview");
 }
 // If the protected launcher is already installed on the live site, a
 // shadow rebuild must preserve *those* files byte-for-byte as well.
 const deployedStudio=all(a).filter(x=>x.startsWith("studio/"));
 for(const file of deployedStudio){
  assert.ok(all(b).includes(file),"Previously published launcher file disappeared");
  assert.deepEqual(readFileSync(join(a,file)),readFileSync(join(b,file)),file+" changed in shadow preview");
 }
}
test("shadow release explicitly gated and refuses missing public-key setup",()=>{
 assert.ok(run(false));
 assert.ok(run(true,{MEGAFRAME_STUDIO_PUBLISHABLE_KEY:""}));
});
test("shadow artifact adds only protected ticket launcher; existing public editor/PWA unchanged",()=>{
 try{
  assert.equal(run(true),null);
  execFileSync("python3",[join(root,"scripts/build_pages_site.py"),baseline],{cwd:root,stdio:"pipe"});const current=baseline;
  identicalPublicTree(current,out);
  assert.deepEqual(readdirSync(join(out,"studio")).sort(),
    ["central-drive.js","draft-vault.js","index.html","launch.js"]);
  const launch=readFileSync(join(out,"studio","index.html"),"utf8");
  assert.match(launch,/ptg|PTG/i);
  assert.ok(launch.includes(key),"Protected launcher is configured using a public publishable key");
  assert.doesNotMatch(launch,/<!-- PRIVATE (?:MEGAFRAME )?EDITOR BUNDLE/);
  assert.match(readFileSync(join(out,"studio","launch.js"),"utf8"),/ptg_studio_ticket/);
 }finally{rmSync(out,{recursive:true,force:true});rmSync(baseline,{recursive:true,force:true});}
});
