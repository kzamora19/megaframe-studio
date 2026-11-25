// Manual, owner-approved production release upload. Never run from public browser.
// This script only stages a NEW immutable bundle. It does not change the serving pointer.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const expectedUrl='https://vmyoxoiygfcecgkbavgg.supabase.co';
const bucket='megaframe-editor-release';
const sha256=data=>createHash('sha256').update(data).digest('hex');
const env=process.env;
if(env.MEGAFRAME_PRODUCTION_RELEASE_APPROVED!=='YES'||
   env.MEGAFRAME_PRODUCTION_URL!==expectedUrl)
 throw Error('Production release requires explicit protected approval and the exact MegaFrame project.');
const key=env.MEGAFRAME_PRODUCTION_ADMIN_KEY||'';
if(key.length<32||key.startsWith('sb_publishable_'))
 throw Error('Protected environment server-only API key missing.');
const base=env.MEGAFRAME_PRIVATE_BUILD_DIR;
if(!base)throw Error('Private bundle build folder missing');
const raw=readFileSync(join(base,'private','studio.html'));
const manifest=JSON.parse(readFileSync(join(base,'manifest.json'),'utf8'));
const digest=sha256(raw);
assert.equal(manifest.sha256,digest);
assert.equal(manifest.bytes,raw.length);
assert.ok(raw.length>1000000&&raw.length<15000000);
assert.ok(raw.toString('utf8',0,100).startsWith('<!-- PRIVATE MEGAFRAME EDITOR BUNDLE'));
for(const feature of ['photoLayerMode','transparentPhotoFrameArtwork','detectNativePhotoOpening','__MEGAFRAME_PRIVATE_DRAFT__']){
 assert.ok(raw.includes(feature),'Critical private editor feature missing: '+feature);
}
const path='releases/'+digest.slice(0,16)+'/studio.html';
if(!/^releases\/[a-f0-9]{16}\/studio\.html$/.test(path))throw Error('Unrecognized immutable path');
// Supabase sb_secret_ keys are API keys, NOT JWTs. Using a server-only
// Supabase client that sends "Authorization: Bearer sb_secret_..." produces
// Storage AccessDenied / Invalid Compact JWS. Send ONLY the apikey header.
// Preserve the fail-closed private bucket check and immutable object pinning.
const storageEndpoint=expectedUrl+'/storage/v1';
const baseHeaders={apikey:key};
async function privateStorageRequest(route,{method='GET',body,contentType}={}){
 const headers={...baseHeaders};
 if(contentType)headers['content-type']=contentType;
 if(method==='POST')headers['x-upsert']='false';
 const response=await fetch(storageEndpoint+route,{
  method,headers,body,cache:'no-store',redirect:'error',
  signal:AbortSignal.timeout(method==='POST'?120000:30000)
 });
 return response;
}
const configResponse=await privateStorageRequest('/bucket/'+bucket);
if(!configResponse.ok)
 throw Error('Private Storage bucket verification HTTP '+configResponse.status+
  ' (check MegaFrame project secret API key; never paste it into logs).');
const config=await configResponse.json().catch(()=>null);
if(!config||config.id!==bucket||config.public!==false)
 throw Error('Refused: release bucket must exist and be PRIVATE');
const objectRoute='/object/'+bucket+'/'+path;
const uploadResponse=await privateStorageRequest(objectRoute,{
 method:'POST',body:raw,contentType:'text/html'
});
// Conflict is allowed ONLY for an immutable previously uploaded object, and
// then the SHA-256 download verification below must match exactly.
if(!uploadResponse.ok && uploadResponse.status!==409)
 throw Error('Immutable private bundle upload failed (HTTP '+uploadResponse.status+
 ') - delivery pointer was NOT changed.');
const downloadResponse=await privateStorageRequest('/object/authenticated/'+bucket+'/'+path);
if(!downloadResponse.ok)
 throw Error('Cannot verify private stored object (HTTP '+downloadResponse.status+').');
const result=Buffer.from(await downloadResponse.arrayBuffer());
assert.equal(sha256(result),digest,'Stored private bundle checksum differs');
assert.equal(result.length,raw.length,'Stored private bundle length differs');
const output=['### MegaFrame private editor upload verified','Object: '+path,'SHA-256: '+digest,'Bytes: '+raw.length,
 'Uploaded to private bucket with upsert disabled. **Delivery pointer NOT changed.**'];
if(env.GITHUB_STEP_SUMMARY){
 const {appendFileSync}=await import('node:fs');
 appendFileSync(env.GITHUB_STEP_SUMMARY,output.join('\n')+'\n');
}
console.log('PASS: immutable MegaFrame private editor upload/download SHA-256 verified; serving pointer unchanged.');
