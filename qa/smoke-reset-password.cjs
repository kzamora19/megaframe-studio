const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true});
 try {
   const page = await browser.newPage();
   const url = 'http://127.0.0.1:4173/megaframe-studio/reset-password.html';
   let requests = 0;
   await page.route('https://vmyoxoiygfcecgkbavgg.supabase.co/**', async route => {
     requests++;
     assert.equal(route.request().method(), 'POST');
     assert.equal(new URL(route.request().url()).pathname, '/auth/v1/recover');
     assert.equal(new URL(route.request().url()).searchParams.get('redirect_to'),
       'https://kzamora19.github.io/megaframe-studio/reset-password.html');
     await route.fulfill({status:200,contentType:'application/json',body:'{}'});
   });
   assert.equal((await page.goto(url)).status(),200);
   await page.locator('#account-email').fill('test@example.com');
   await page.locator('#request-button').click();
   await page.waitForFunction(() => document.querySelector('#reset-status').textContent.includes('recovery instructions'));
   assert.equal(requests,1);
   await page.goto(url+'?error_code=otp_expired');
   assert.match(await page.locator('#reset-status').textContent(),/expired or already used/);
   assert.equal(await page.evaluate(()=>location.search),'');
   let verified = false, changed = false;
   await page.unrouteAll();
   await page.route('https://vmyoxoiygfcecgkbavgg.supabase.co/**', async route => {
     const request = route.request();
     if (request.method()==='GET') {
       verified = true;
       return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'test-user'})});
     }
     if(request.method()==='PUT') {
       changed = true;
       return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'test-user'})});
     }
     return route.abort();
   });
   await page.goto(url+'?source=mail#type=recovery&access_token=testtoken');
   await page.locator('#update-section').waitFor({state:'visible'});
   assert.equal(verified,true);
   assert.equal(await page.evaluate(()=>location.hash),'');
   await page.locator('#new-password').fill('example-password-1234');
   await page.locator('#confirm-password').fill('example-password-1234');
   await page.locator('#update-button').click();
   await page.locator('#done-section').waitFor({state:'visible'});
   assert.equal(changed,true);
      console.log('PASS: MegaFrame recovery route requests the exact allowed redirect and handles expired links.');
 } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
