const {chromium} = require('playwright');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const assert = require('node:assert/strict');

(async () => {
 const html = readFileSync(join(process.env.MEGAFRAME_PRIVATE_BUILD_DIR, 'private', 'studio.html'),'utf8');
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage({viewport:{width:1450,height:1000}});
 const base = 'http://127.0.0.1:4173/private-signin-test';
 const errors=[], calls=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(base,route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Sandbox test</title><body></body>'}));
 await page.route('https://vmyoxoiygfcecgkbavgg.supabase.co/**',async route=>{
  const req=route.request(),u=new URL(req.url()),path=u.pathname;
  calls.push({path,method:req.method()});
  const json=(body)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'apikey,authorization,content-type,prefer','access-control-allow-methods':'GET,POST,OPTIONS'}});
  if(path==='/auth/v1/token')return json({access_token:'mock.jwt.token',refresh_token:'mock.refresh.token',expires_in:3600,user:{id:'11111111-1111-4111-8111-111111111111'}});
  if(path==='/rest/v1/megaframe_members')return json([{role:'admin'}]);
  if(path==='/rest/v1/megaframe_templates'||path==='/rest/v1/megaframe_private_templates')return json([]);
  return json([]);
 });
 try {
  await page.goto(base);
  await page.evaluate(source=>{
   const iframe=document.createElement('iframe');
   iframe.id='protected-studio';
   iframe.sandbox='allow-scripts allow-downloads allow-modals';
   iframe.width='1350';iframe.height='900';
   iframe.addEventListener('load',()=>{
    const channel=new MessageChannel();
    channel.port1.onmessage=({data})=>{
     if(data && Number.isSafeInteger(data.id)) {
      const value=data.action==='project-list'?[]:null;
      channel.port1.postMessage({id:data.id,ok:true,value});
     }
    };
    channel.port1.start();
    iframe.contentWindow.postMessage({kind:'megaframe-private-draft-port'},'*',[channel.port2]);
   },{once:true});
   iframe.srcdoc=source;
   document.body.append(iframe);
  },html);
  const frame=page.frameLocator('#protected-studio');
  // Open the closed native Shared Templates dialog programmatically; the
  // standalone private build has an initial New Project modal as well.
  await frame.locator('#mf-open').waitFor({state:'attached',timeout:20000});
  await frame.locator('#mf-open').evaluate(el=>el.click());
  await frame.locator('#mf-admin-toggle').waitFor({state:'visible',timeout:20000});
  await frame.locator('#mf-admin-toggle').click();
  await frame.locator('#mf-email').fill('admin@example.com');
  await frame.locator('#mf-password').fill('test-placeholder-not-real');
  assert.equal(await frame.locator('#mf-signin').getAttribute('type'),'button');
  await frame.locator('#mf-signin').click();
  await frame.locator('#mf-show-members').waitFor({state:'visible',timeout:15000});
  assert.ok(calls.some(x=>x.path==='/auth/v1/token'&&x.method==='POST'),
   'Real click must call Supabase Auth even with allow-forms omitted.');
  assert.match(await frame.locator('#mf-identity').textContent(),/Administrator/);
  assert.equal(await page.locator('#protected-studio').getAttribute('sandbox'),'allow-scripts allow-downloads allow-modals');
  console.log('PASS: Direct MegaFrame sign-in works in an opaque sandbox with allow-forms still disabled.');
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1;});
