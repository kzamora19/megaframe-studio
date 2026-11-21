// PTG-protected Google Drive contract test — local mock only, never real Google data.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {webcrypto} from "node:crypto";

const source=readFileSync("staging/studio-access/drive-backup.js","utf8");
test("manual Drive backup requires Google consent and fresh PTG authorization",async()=>{
  const nodes=new Map(),buttons=["driveConnect","driveDisconnect","driveRefresh","driveBackup","driveRestore"];
  function node(id){
    if(!nodes.has(id)){
      let value="";
      const e={id,hidden:false,disabled:false,textContent:"",children:[],
        get value(){return value||this.children[0]?.value||"";},
        set value(v){value=v;},
        append(...items){this.children.push(...items);},
        replaceChildren(){this.children=[];value="";},
        querySelectorAll(sel){return sel==="button"?buttons.map(node):[];}};
      nodes.set(id,e);
    }
    return nodes.get(id);
  }
  let proofAllowed=true,proofChecks=0,exported=0,imported=0;
  let driveCalls=0,uploaded=null,metadata=null;
  const scope="a".repeat(43);
  const studio="megaframe";
  const projectId="project_abc";
  const vault={
    ["project-list"]:async()=>[{id:projectId,name:"Test layout",savedAt:1}],
    ["project-read"]:async()=>({format:"local"}),
    ["cloud-export"]:async(id,opts)=>{assert.equal(id,projectId);assert.equal(opts.drive,true);
      exported++;return {iv:"x".repeat(16),encrypted:"ciphertext-only-data"};},
    ["cloud-import"]:async(id,record,opts)=>{assert.equal(id,projectId);
      assert.equal(opts.drive,true);assert.equal(record.encrypted,"ciphertext-only-data");imported++;}
  };
  const uploadUrl="https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=test";
  function response(data,extra={}){
    return {ok:true,status:200,headers:{get:k=>extra[k]||null},
      json:async()=>data,blob:async()=>new Blob([uploaded||""]),text:async()=>String(uploaded||"")};
  }
  async function fetchMock(url,opts={}){
    driveCalls++;
    const u=new URL(url),m=opts.method||"GET";
    assert.equal(opts.credentials,"omit");
    assert.match(opts.headers.Authorization,/^Bearer test-google-token$/);
    if(m==="POST"&&u.pathname.endsWith("/files")&&u.searchParams.has("uploadType")){
      metadata=JSON.parse(opts.body);
      return response({},{"Location":uploadUrl});
    }
    if(m==="PUT"&&url===uploadUrl){
      uploaded=await opts.body.text();
      return response({id:"fileEncrypted123"});
    }
    if(m==="POST"&&u.pathname.endsWith("/files")){
      return response({id:"folderEncrypted123"});
    }
    if(m==="GET"&&u.pathname.endsWith("/files")){
      const q=u.searchParams.get("q")||"";
      if(q.includes("appProperties has")){
        assert.match(q,/ownerScope/);
        return response({files:uploaded?[{id:"fileEncrypted123",
          name:metadata.name,modifiedTime:"2026-11-21T00:00:00Z",
          appProperties:metadata.appProperties,size:String(uploaded.length)}]:[]});
      }
      return response({files:[]});
    }
    if(m==="GET"&&u.pathname.endsWith("/files/fileEncrypted123")){
      if(u.searchParams.has("alt"))return response({});
      return response({id:"fileEncrypted123",trashed:false,mimeType:"application/json",
        appProperties:metadata.appProperties,size:uploaded.length});
    }
    throw Error("Unmocked Google Drive request: "+m+" "+url);
  }
  const fakeGoogle={accounts:{oauth2:{
    initTokenClient:({callback,scope:requested})=>{
      assert.equal(requested,"https://www.googleapis.com/auth/drive.file");
      return {requestAccessToken:()=>callback({access_token:"test-google-token",
        scope:requested,expires_in:3600})};
    },revoke:(_,callback)=>callback()
  }}};
  const context={window:{google:fakeGoogle,confirm:()=>true},document:{
    getElementById:node,createElement:()=>({value:"",textContent:""}),
    head:{append:()=>{throw Error("GIS was already available");}}
  },crypto:webcrypto,TextEncoder,Blob,AbortController,URL,URLSearchParams,
    fetch:fetchMock,Date,Promise,Error,Uint8Array,console};
  runInNewContext(source,context,{filename:"drive-backup.js"});
  const api=context.window.BRANCHLINE_GOOGLE_DRIVE_BACKUP;
  assert.equal(typeof api.setup,"function");
  await api.setup({studio,scope,clientId:"873550026587-test.apps.googleusercontent.com",
    vault,verify:async()=>{proofChecks++;if(!proofAllowed)throw Error("PTG revoked");}});
  assert.equal(node("driveBackup").disabled,true,"Google consent is mandatory");
  assert.equal(driveCalls,0);
  node("driveConnect").onclick();
  assert.equal(node("driveBackup").disabled,false);
  await node("driveBackup").onclick();
  assert.equal(exported,1);
  assert.ok(proofChecks>=2,"A fresh PTG proof is required before Drive upload");
  assert.ok(uploaded);
  assert.match(uploaded,/"format":"BranchlineStudioDriveBackupV1"/);
  assert.ok(!uploaded.includes("Test layout"),"No local project title/plaintext in Drive metadata");
  assert.equal(metadata.appProperties.studio,"megaframe");
  assert.equal(metadata.appProperties.recordKey,projectId);
  assert.match(metadata.appProperties.ownerScope,/^[a-f0-9]{64}$/);
  assert.ok(!metadata.appProperties.ownerScope.includes(scope));
  await node("driveRestore").onclick();
  assert.equal(imported,1,"Encrypted Drive retrieval uses the authenticated local vault");
  const previousCalls=driveCalls;
  proofAllowed=false;
  await node("driveBackup").onclick();
  assert.equal(driveCalls,previousCalls,"PTG revocation must stop Drive operations");
  assert.match(node("driveMessage").textContent,/revoked/);
  api.lock();
  assert.equal(node("drivePanel").hidden,true);
  assert.equal(node("driveBackup").disabled,true);
  assert.equal(node("driveDisconnect").hidden,true);
});
test("Drive files are never automatically synchronized or stored as OAuth tokens",()=>{
  assert.doesNotMatch(source,/localStorage|sessionStorage|indexedDB/);
  assert.match(source,/window\.confirm/);
  assert.match(source,/PTG proof/);
  assert.match(source,/appProperties/);
  assert.match(source,/uploadType=resumable/);
});