// Google Drive OAuth and upload/download mock integration.
// This test never sends a real customer image, token, or Drive request.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1380,height:950}});
 const errors=[],files=[],uploads=[];
 const clientId='873550026587-clo2e2vrthc8621unnmjio3des0nehfm.apps.googleusercontent.com', fakeToken='test-only-access-token';
 let folderExists=false;
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({scope,token})=>{
  window.google={accounts:{oauth2:{
   initTokenClient:config=>(window.__driveTestOAuthClientId=config.client_id, {
    requestAccessToken:()=>Promise.resolve().then(()=>
     config.callback({access_token:token,scope,expires_in:3600}))
   }),
   revoke:(_token,callback)=>callback?.()
  }}};
 },{scope:'https://www.googleapis.com/auth/drive.file',token:fakeToken});
 await page.route('https://www.googleapis.com/**',async route=>{
  const request=route.request(),u=new URL(request.url());
  assert.equal(request.headers()['authorization'],'Bearer '+fakeToken);
  const ok=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  const q=u.searchParams.get('q')||'';
  if(u.pathname==='/drive/v3/files' && request.method()==='GET') {
   if(q.includes('application/vnd.google-apps.folder'))
    return ok({files:folderExists?[{id:'folderCreatedByAppXYZ123',name:'MegaFrame Studio',mimeType:'application/vnd.google-apps.folder'}]:[]});
   return ok({files:files.map(({id,name,size,createdTime})=>({id,name,size,createdTime,mimeType:'application/json'}))});
  }
  if(u.pathname==='/drive/v3/files' && request.method()==='POST') {
   const data=JSON.parse(request.postData()||'{}');
   assert.equal(data.name,'MegaFrame Studio');
   assert.equal(data.mimeType,'application/vnd.google-apps.folder');
   folderExists=true;
   return ok({id:'folderCreatedByAppXYZ123',name:'MegaFrame Studio'});
  }
  if(u.pathname==='/upload/drive/v3/files' && request.method()==='POST') {
   const multipart=request.postData()||'';
   const boundary='\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n';
   const first=multipart.indexOf(boundary);
   const second=multipart.indexOf(boundary,first+boundary.length);
   assert.ok(first>=0 && second>first,'Metadata and file body were sent');
   const meta=JSON.parse(multipart.slice(first+boundary.length,multipart.indexOf('\r\n--',first+boundary.length)));
   const start=second+boundary.length,end=multipart.indexOf('\r\n--',start);
   const json=multipart.slice(start,end);
   const record=JSON.parse(json);
   uploads.push(record);
   const file={id:'backupCreatedByAppXYZ'+files.length,name:meta.name,
    size:String(Buffer.byteLength(json)),createdTime:new Date().toISOString(),content:json};
   files.unshift(file);
   return ok({id:file.id,name:file.name,createdTime:file.createdTime});
  }
  if(u.pathname.startsWith('/drive/v3/files/') && u.searchParams.get('alt')==='media') {
   const file=files.find(f=>f.id===u.pathname.split('/').at(-1));
   assert.ok(file,'Selected backup exists');
   return route.fulfill({status:200,contentType:'application/json',body:file.content});
  }
  throw Error('Unexpected mocked Drive endpoint: '+request.method()+' '+u.pathname);
 });
 try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#draftStatus')?.textContent?.includes('Auto-save ready'));
  await page.locator('#createNewProject').click();
  await page.locator('#openFrameLibrary').click();
  await page.locator('#drive-from-frame-library').click();
  await page.locator('#drive-dialog[open]').waitFor();
  assert.equal(await page.locator('#frameLibrary').evaluate(x=>x.open),false,
    'Local frame library should close when switching to Drive');
  assert.equal(await page.locator('#drive-photos').isChecked(),false);
  assert.equal(await page.locator('#drive-client-id').inputValue(),clientId,
    'The public OAuth Client ID should work on a fresh browser without manual setup');
  await page.locator('#drive-connect').click();
  await page.waitForFunction(()=>window.__driveTestOAuthClientId);
  assert.equal(await page.evaluate(()=>window.__driveTestOAuthClientId),clientId);
  await page.waitForFunction(()=>document.querySelector('#drive-connection')?.textContent?.includes('Connected'));
  assert.equal(await page.locator('#drive-backup').isEnabled(),true);
  await page.locator('#drive-backup').click();
  await page.waitForFunction(()=>document.querySelector('#drive-status')?.textContent?.includes('Backup saved'));
  assert.equal(uploads.length,1);
  assert.equal(uploads[0].kind,'frame');
  assert.equal(uploads[0].containsCustomerPhotos,false);
  assert.equal(uploads[0].payload.photos.length,0);
  await page.locator('#drive-list button').first().click();
  await page.locator('#actionModal[open]').waitFor();
  assert.match(await page.locator('#actionModalMessage').textContent(),/REPLACES your current/);
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>document.querySelector('#drive-status')?.textContent?.includes('restored successfully'));
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9J6ofLwAAAABJRU5ErkJggg==','base64');
  await page.locator('#drive-close').click();
  await page.locator('#photosInput').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>document.querySelector('#photoCount')?.textContent?.includes('1 photo'));
  await page.locator('#drive-open').click();
  await page.locator('#drive-photos').check();
  await page.locator('#drive-backup').click();
  await page.locator('#actionModal[open]').waitFor();
  assert.match(await page.locator('#actionModalMessage').textContent(),/customer photos/i);
  assert.equal(uploads.length,1,'No photos uploaded before explicit confirmation');
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>document.querySelector('#drive-status')?.textContent?.includes('Backup saved'));
  assert.equal(uploads.length,2);
  assert.equal(uploads[1].kind,'project');
  assert.equal(uploads[1].payload.photos.length,1);
  await page.locator('#drive-disconnect').click();
  assert.match(await page.locator('#drive-connection').textContent(),/Not connected/);
  const storage=await page.evaluate(()=>JSON.stringify({...localStorage}));
  assert.equal(storage.includes(fakeToken),false,'Token must not be persisted');
  assert.deepEqual(errors,[],'Runtime errors: '+errors.join(' | '));
  console.log('PASS: opt-in Drive connection, frame-only default, explicit photo consent, uploads, restore and no token persistence.');
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
