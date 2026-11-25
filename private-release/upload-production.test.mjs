import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const bucket='megaframe-editor-release';
const project='https://vmyoxoiygfcecgkbavgg.supabase.co';
const key='sb_secret_fake_test_key_not_real_'+ 'x'.repeat(50);
const folder=mkdtempSync(join(tmpdir(),'megaframe-storage-mock-'));
const source=Buffer.from('<!-- PRIVATE MEGAFRAME EDITOR BUNDLE -->\n' +
  'photoLayerMode\ntransparentPhotoFrameArtwork\ndetectNativePhotoOpening\n__MEGAFRAME_PRIVATE_DRAFT__\n' +
  'x'.repeat(1_100_000));
const hash=createHash('sha256').update(source).digest('hex');
mkdirSync(join(folder,'private'));
writeFileSync(join(folder,'private','studio.html'),source);
writeFileSync(join(folder,'manifest.json'),JSON.stringify({sha256:hash,bytes:source.length}));
const prior={...process.env};
process.env.MEGAFRAME_PRODUCTION_RELEASE_APPROVED='YES';
process.env.MEGAFRAME_PRODUCTION_URL=project;
process.env.MEGAFRAME_PRODUCTION_ADMIN_KEY=key;
process.env.MEGAFRAME_PRIVATE_BUILD_DIR=folder;
delete process.env.GITHUB_STEP_SUMMARY;
const api=project+'/storage/v1';
const path='releases/'+hash.slice(0,16)+'/studio.html';

async function executeScenario(name,fetcher){
 const oldFetch=globalThis.fetch;
 globalThis.fetch=fetcher;
 try{
  return await import('./upload-production.mjs?scenario='+name);
 }finally{
  globalThis.fetch=oldFetch;
 }
}
test('secret-key upload uses only apikey header, verifies private bucket and byte digest',async()=>{
 const calls=[];
 await executeScenario('ok',async (url,opt)=>{
  calls.push({url,method:opt.method,headers:opt.headers,body:opt.body});
  assert.equal(opt.headers.apikey,key);
  assert.ok(!Object.keys(opt.headers).some(x=>x.toLowerCase()==='authorization'),'No JWT Authorization header');
  assert.equal(opt.redirect,'error');
  if(url===api+'/bucket/'+bucket)return new Response(JSON.stringify({id:bucket,public:false}),{status:200});
  if(url===api+'/object/'+bucket+'/'+path)return new Response('{}',{status:200});
  if(url===api+'/object/authenticated/'+bucket+'/'+path)return new Response(source,{status:200});
  throw Error('Unexpected private Storage URL');
 });
 assert.deepEqual(calls.map(c=>c.method),['GET','POST','GET']);
 assert.equal(calls[1].headers['x-upsert'],'false');
 assert.equal(Buffer.compare(calls[1].body,source),0);
});
test('public bucket is always rejected before writing private bundle',async()=>{
 const calls=[];
 await assert.rejects(executeScenario('public-bucket',async (url,opt)=>{
  calls.push(url);
  return new Response(JSON.stringify({id:bucket,public:true}),{status:200});
 }),/release bucket must exist and be PRIVATE/);
 assert.deepEqual(calls,[api+'/bucket/'+bucket]);
});
test('existing immutable object must match checksum or release fails',async()=>{
 await assert.rejects(executeScenario('mismatch',async (url,opt)=>{
  if(url===api+'/bucket/'+bucket)return new Response(JSON.stringify({id:bucket,public:false}),{status:200});
  if(url===api+'/object/'+bucket+'/'+path)return new Response('{}',{status:409});
  if(url===api+'/object/authenticated/'+bucket+'/'+path)return new Response(Buffer.from('tampered'),{status:200});
  throw Error('Unexpected endpoint');
 }),/Stored private bundle checksum differs/);
});
test('access denied to bucket prevents any private object upload',async()=>{
 let count=0;
 await assert.rejects(executeScenario('denied',async()=>{
  count++;
  return new Response('{}',{status:403});
 }),/bucket verification HTTP 403/);
 assert.equal(count,1);
});
test.after(()=>{rmSync(folder,{recursive:true,force:true});process.env=prior;});
