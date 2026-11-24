const { chromium }=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1460,height:950}});
 const errors=[],memberWrites=[];
 let role='admin';
 const userId='11111111-1111-4111-8111-111111111111';
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://vmyoxoiygfcecgkbavgg.supabase.co/**',async route=>{
  const req=route.request(),u=new URL(req.url()),path=u.pathname,method=req.method();
  const fulfill=(json,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(json)});
  if(path==='/auth/v1/token')return fulfill({access_token:'mock.jwt.token',refresh_token:'mock.refresh.token',expires_in:3600,user:{id:userId,email:'admin@example.com'}});
  if(path==='/auth/v1/logout')return route.fulfill({status:204,body:''});
  if(path==='/rest/v1/megaframe_members')return fulfill([{role}]);
  if(path==='/rest/v1/megaframe_templates'||path==='/rest/v1/megaframe_private_templates')return fulfill([]);
  if(path==='/rest/v1/rpc/megaframe_list_members')return fulfill([
    {user_id:userId,email:'admin@example.com',role:'admin'},
    {user_id:'22222222-2222-4222-8222-222222222222',email:'editor@example.com',role:'editor'}
  ]);
  if(path==='/rest/v1/rpc/megaframe_manage_member'){
   const payload=JSON.parse(req.postData()||'{}');memberWrites.push(payload);
   return fulfill([{user_id:'22222222-2222-4222-8222-222222222222',email:payload.target_email,role:payload.desired_role}]);
  }
  return fulfill({message:'Mock route not configured: '+method+' '+path},404);
 });
 async function signin(testEmail){
  await page.locator('#mf-admin-toggle').click();
  await page.locator('#mf-email').fill(testEmail);
  await page.locator('#mf-password').fill('placeholder-test-password');
  await page.locator('#mf-signin').click();
  await page.waitForFunction(()=>document.getElementById('mf-identity')?.textContent?.length>4);
 }
 try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('draftStatus')?.textContent?.includes('Auto-save ready'));
  await page.locator('#createNewProject').click();
  await page.locator('[data-panel="7"]').click();
  await page.locator('#mf-open').click();
  assert.equal(await page.locator('#mf-show-members').isHidden(),true,'Membership management is hidden from the public');
  await signin('admin@example.com');
  await page.locator('#mf-show-members').waitFor({state:'visible'});
  await page.locator('#mf-show-members').click();
  await page.locator('#mf-members-section').waitFor({state:'visible'});
  await page.locator('#mf-members-list .mfMemberCard').first().waitFor();
  assert.equal(await page.locator('#mf-members-list .mfMemberCard').count(),2);
  await page.locator('#mf-member-email').fill('editor@example.com');
  await page.locator('#mf-member-role').selectOption('editor');
  await page.locator('#mf-member-save').click();
  await page.waitForFunction(()=>document.getElementById('mf-message')?.textContent?.includes('Account role updated'));
  assert.equal(memberWrites.at(-1).desired_role,'editor');
  assert.equal(memberWrites.at(-1).target_email,'editor@example.com');
  await page.locator('#mf-signout').click();
  role='editor';
  await signin('editor@example.com');
  await page.waitForFunction(()=>document.getElementById('mf-identity')?.textContent?.startsWith('Editor'));
  assert.equal(await page.locator('#mf-show-members').isHidden(),true,'Editor cannot access administrator tools');
  await page.locator('#mf-show-shared').click();
  await page.locator('#mf-publish').waitFor({state:'visible'});
  await page.locator('#mf-show-private').click();
  await page.locator('#mf-private-save').waitFor({state:'visible'});
  await page.locator('#mf-signout').click();
  role='viewer';
  await signin('viewer@example.com');
  await page.waitForFunction(()=>document.getElementById('mf-identity')?.textContent?.startsWith('Viewer'));
  assert.equal(await page.locator('#mf-show-members').isHidden(),true);
  await page.locator('#mf-show-shared').click();
  assert.equal(await page.locator('#mf-publish').isHidden(),true,'Viewer may not publish');
  await page.locator('#mf-show-private').click();
  await page.locator('#mf-private-section').waitFor({state:'visible'});
  assert.equal(await page.locator('#mf-private-save').isHidden(),true,'Viewer may not save cloud templates');
  assert.deepEqual(errors,[],'JS runtime errors: '+errors.join('; '));
  console.log('PASS: admin directory/assignment, editor publishing, viewer read-only and public isolation.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
