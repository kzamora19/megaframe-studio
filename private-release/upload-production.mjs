// Manual, owner-approved production release upload. Never run from public browser.
// This script only stages a NEW immutable bundle. It does not change the serving pointer.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

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
const client=createClient(expectedUrl,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const {data:config,error:bucketError}=await client.storage.getBucket(bucket);
if(bucketError||!config||config.public!==false)throw Error('Refused: release bucket must exist and be PRIVATE');
const storage=client.storage.from(bucket);
const {error:uploadError}=await storage.upload(path,raw,{contentType:'text/html',cacheControl:'0',upsert:false});
if(uploadError && !/already exists|duplicate|conflict/i.test(String(uploadError.message||'')))
 throw Error('Immutable private bundle upload failed; no production pointer changed.');
const {data:stored,error:readError}=await storage.download(path);
if(readError||!stored)throw Error('Cannot independently verify private uploaded object.');
const result=Buffer.from(await stored.arrayBuffer());
assert.equal(sha256(result),digest,'Stored private bundle checksum differs');
assert.equal(result.length,raw.length,'Stored private bundle length differs');
const output=['### MegaFrame private editor upload verified','Object: '+path,'SHA-256: '+digest,'Bytes: '+raw.length,
 'Uploaded to private bucket with upsert disabled. **Delivery pointer NOT changed.**'];
if(env.GITHUB_STEP_SUMMARY){
 const {appendFileSync}=await import('node:fs');
 appendFileSync(env.GITHUB_STEP_SUMMARY,output.join('\n')+'\n');
}
console.log('PASS: immutable MegaFrame private editor upload/download SHA-256 verified; serving pointer unchanged.');
