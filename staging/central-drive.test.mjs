// Central owner-managed Google Drive UI: mock transport, real launcher script.
// No browser receives the Google owner token or a PTG reusable bearer.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const script=readFileSync("staging/studio-access/central-drive.js","utf8");
for(const studio of ["megaframe","flyer"])test("PTG-secured company Drive UI backup and retrieval: "+studio,async()=>{
 const nodes=new Map();
 function node(id){
  if(!nodes.has(id)){
   let val="";
   nodes.set(id,{id,hidden:false,disabled:false,textContent:"",children:[],
    get value(){return val||this.children[0]?.value||"";},
    set value(v){val=v;},
    replaceChildren(){this.children=[];val="";},
    append(item){this.children.push(item);}});
  }
  return nodes.get(id);
 }
 const storage=new Map(),requests=[];
 let restored=0,configured=false;
 const key=studio==="megaframe"?"project_example":"p:current";
 const envelope={iv:"A".repeat(16),encrypted:"x".repeat(64)};
 const vault={
  ["project-list"]:async()=>[{id:key,name:"Stored project"}],
  ["project-read"]:async()=>null,read:async()=>null,
  ["cloud-export"]:async(id)=>{assert.equal(id,key);return envelope;},
  cloudExport:async(id)=>{assert.equal(id,key);return envelope;},
  ["cloud-import"]:async(id,obj)=>{assert.equal(id,key);assert.deepEqual(obj,envelope);restored++;},
  cloudImport:async(id,obj)=>{assert.equal(id,key);assert.deepEqual(obj,envelope);restored++;}
 };
 const request=async(operation,fields={})=>{
  requests.push({operation,fields});
  if(!configured)return {status:"not_configured"};
  if(operation==="list")return {status:"ok",items:[...storage].map(([fileId,value])=>({
    fileId,recordKey:value.key,modifiedTime:"2026-11-21T00:00:00Z"}))};
  if(operation==="write"){
   assert.equal(fields.recordKey,key);
   assert.deepEqual({iv:fields.iv,encrypted:fields.encrypted},envelope);
   storage.set("drive12345",{key,record:envelope});return {status:"ok",fileId:"drive12345"};
  }
  if(operation==="read"){
   assert.equal(fields.recordKey,key);
   assert.equal(fields.fileId,"drive12345");
   return {status:"ok",record:storage.get(fields.fileId).record};
  }
  throw Error("Unexpected central Drive action");
 };
 const context={window:{confirm:()=>true},document:{
  getElementById:node,createElement:()=>({value:"",textContent:""})},
  Date,Promise,Error,console};
 runInNewContext(script,context);
 const api=context.window.BRANCHLINE_CENTRAL_DRIVE;
 await api.setup({studio,vault,request});
 assert.equal(node("driveConnect").hidden,true,"Staff never authorize owner's Google");
 assert.equal(node("drivePanel").hidden,false);
 await node("driveBackup").onclick();
 assert.match(node("driveMessage").textContent,/owner Google authorization/);
 assert.equal(storage.size,0,"Fail closed before owner consent");
 configured=true;
 await node("driveBackup").onclick();
 assert.equal(storage.size,1);
 assert.match(node("driveMessage").textContent,/Encrypted backup saved/);
 await node("driveRestore").onclick();
 assert.equal(restored,1,"Encrypted project restored to the verified PTG account vault");
 assert.ok(requests.some(x=>x.operation==="write")&&requests.some(x=>x.operation==="read"));
 api.lock();
 assert.equal(node("drivePanel").hidden,true);
 assert.equal(node("driveBackup").disabled,true);
});
test("staff-facing central Drive module contains no owner OAuth, passwords or browser credential storage",()=>{
 assert.match(script,/BRANCHLINE_CENTRAL_DRIVE/);
 assert.doesNotMatch(script,/accounts\.oauth2|clientSecret|refreshToken|Authorization:|localStorage|sessionStorage/);
 assert.match(script,/window\.confirm/);
});
