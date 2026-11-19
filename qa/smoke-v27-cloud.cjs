const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const user='11111111-1111-4111-8111-111111111111';
 const id1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const id2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const id3='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const shared=[
  {id:id1,name:'Holiday Promo Frame',folder:'Holiday',category:'Campaign',revision:id1,updated_at:new Date().toISOString()},
  {id:id2,name:'Standard Portrait',folder:'Unfiled',category:'General',revision:id2,updated_at:new Date().toISOString()}
 ];
 const privateFrames=[
  {id:id3,name:'Private Event Frame',folder:'Personal',category:'Portrait',revision:id3,updated_at:new Date().toISOString()}
 ];
 const writes=[];
 const page=await browser.newPage({viewport:{width:1400,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 page.on('console',msg=>{if(msg.type()==='error')console.warn('Browser console:',msg.text())});
 await page.route('https://vmyoxoiygfcecgkbavgg.supabase.co/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  const respond=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(path==='/auth/v1/token')return respond({access_token:'mock.jwt.token',refresh_token:'mock.refresh',expires_in:3600,user:{id:user,email:'admin@example.com'}});
  if(path==='/rest/v1/megaframe_members')return respond([{role:'admin'}]);
  if(path==='/rest/v1/megaframe_templates'||path==='/rest/v1/megaframe_private_templates'){
   const rows=path.includes('private')?privateFrames:shared;
   if(request.method()==='PATCH'){
    const body=JSON.parse(request.postData()||'{}');
    const id=url.searchParams.get('id')?.replace(/^eq\./,'');
    const row=rows.find(t=>t.id===id);
    if(!row)return respond([],200);
    Object.assign(row,body,{revision:'99999999-9999-4999-8999-999999999999'});
    writes.push({path,id,body});return respond([row]);
   }
   if(request.method()==='GET')return respond(rows);
  }
  if(path==='/auth/v1/logout')return route.fulfill({status:204,body:''});
  return respond({message:'Unexpected test endpoint'},404);
 });
 try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('draftStatus')?.textContent?.includes('Auto-save ready'));
  await page.locator('#mf-open').click();
  await page.locator('#mf-list .frameLibCard').first().waitFor();
  assert.equal(await page.locator('#mf-list .frameLibCard').count(),2);
  assert.equal(await page.locator('#mf-list .frameLibCard button').filter({hasText:'Organize'}).count(),0,'Anonymous users cannot organize published frames');
  await page.locator('#mf-shared-folder').selectOption('Holiday');
  assert.equal(await page.locator('#mf-list .frameLibCard').count(),1,'Shared folder filter works');
  await page.locator('#mf-shared-folder').selectOption('');
  await page.locator('#mf-admin-toggle').click();
  await page.locator('#mf-email').fill('admin@example.com');
  await page.locator('#mf-password').fill('test-password-placeholder');
  await page.locator('#mf-signin').click();
  await page.locator('#mf-publish').waitFor({state:'visible'});
  await page.locator('#mf-list .frameLibCard').filter({hasText:'Holiday Promo Frame'}).getByRole('button',{name:'Organize'}).click();
  await page.locator('#actionModalInput').fill('Campaigns');
  await page.locator('#actionModalConfirm').click();
  await page.locator('#actionModalInput').fill('Seasonal');
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('#mf-shared-folder option')].some(x=>x.value==='Campaigns'));
  assert.equal(shared[0].folder,'Campaigns');
  assert.equal(shared[0].category,'Seasonal');
  await page.locator('#mf-show-private').click();
  await page.locator('#mf-private-list .frameLibCard').first().waitFor();
  assert.equal(await page.locator('#mf-private-list .frameLibCard').count(),1);
  await page.locator('#mf-private-list .frameLibCard').getByRole('button',{name:'Organize'}).click();
  await page.locator('#actionModalInput').fill('Personal Projects');
  await page.locator('#actionModalConfirm').click();
  await page.locator('#actionModalInput').fill('Family');
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>[...document.querySelectorAll('#mf-private-category option')].some(x=>x.value==='Family'));
  assert.equal(privateFrames[0].folder,'Personal Projects');
  assert.equal(privateFrames[0].category,'Family');
  await page.locator('#mf-private-folder').selectOption('Personal Projects');
  assert.equal(await page.locator('#mf-private-list .frameLibCard').count(),1);
  assert.equal(writes.length,2,'One revision-guarded metadata PATCH for each library type');
  for(const write of writes){
   assert.deepEqual(Object.keys(write.body).sort(),['category','folder'],'Organization must not overwrite template artwork or ownership');
  }
  assert.deepEqual(errors,[],'Uncaught errors: '+errors.join('; '));
  console.log('PASS: shared/private cloud folder and category reads, filters, organizer edits, RLS-aware write boundaries.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
