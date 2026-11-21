// Browser-level cryptographic regression. Local ephemeral HTTP only.
// Tests manual ciphertext-only transfer between two device vault instances,
// wrong-account denial and large payload-safe Base64 serialization.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "playwright";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"studio-access");
const server=createServer((req,res)=>{
 const path=new URL(req.url,"http://127.0.0.1").pathname;
 if(path==="/"){res.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});
  res.end("<!doctype html><html><head><meta charset=\"utf-8\"><title>MegaFrame encrypted cloud vault test</title></head><body><script src=\"./draft-vault.js\"></script></body></html>");return;}
 if(path==="/draft-vault.js"){res.writeHead(200,{"Content-Type":"text/javascript"});
  res.end(readFileSync(resolve(root,"draft-vault.js")));return;}
 res.writeHead(404);res.end();
});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 await page.goto("http://127.0.0.1:"+server.address().port+"/",{waitUntil:"load"});
 const result=await page.evaluate(async()=>{
     const vault=window.MEGAFRAME_LOCAL_DRAFT_VAULT.session("SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",btoa("A".repeat(32)).replaceAll("+","-").replaceAll("/","_").replaceAll("=",""));
     const saved={format:"MegaFrameProjectV1",id:"project_cloud_01",name:"One saved project",
       savedAt:Date.now(),photoCount:1,payload:{format:"MegaFrameDraftV1",photos:[{id:"photoA",data:"Q".repeat(240000)}]}};
     await vault["project-write"](saved);
     const data=await vault["cloud-export"]("project_cloud_01");
     await vault["project-delete"]("project_cloud_01");
     const missing=await vault["project-read"]("project_cloud_01");
     await vault["cloud-import"]("project_cloud_01",data);
     const restored=await vault["project-read"]("project_cloud_01");
     const other=window.MEGAFRAME_LOCAL_DRAFT_VAULT.session("T".repeat(43),btoa("X".repeat(32)).replaceAll("+","-").replaceAll("/","_").replaceAll("=",""));
     let blocked=false;
     try{await other["cloud-import"]("project_cloud_01",data)}catch{blocked=true}
     return {missing,restored:restored?.payload?.photos?.[0]?.data?.length,
       containsPlaintext:data.encrypted.includes("One saved project"),
       ciphertextLength:data.encrypted.length,ivLength:data.iv.length,blocked};
 });
 assert.equal(result.missing,null);
 assert.equal(result.restored,240000,"Full customer photo payload must survive AES-GCM restore");
 assert.equal(result.containsPlaintext,false,"Cloud must hold ciphertext, not project names/data");
 assert.ok(result.ciphertextLength>300000,"Large base64 encoding must not hit stack limit");
 assert.equal(result.ivLength,16,"AES-GCM uses 96-bit IV");
 assert.equal(result.blocked,true,"Different PTG account must not decrypt imported cloud backup");
 console.log("PASS: MegaFrame explicit AES-GCM ciphertext cloud export, remote restore, large photos and account isolation.");
}finally{await browser?.close();await new Promise(ok=>server.close(ok));}
