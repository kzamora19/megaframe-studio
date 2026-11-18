const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1460,height:960}});
  const errors = [];
  const requests = { public:0, private:0 };
  page.on('pageerror', e => errors.push(e.message));
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9J6ofLwAAAABJRU5ErkJggg==';
  const now = '2026-11-18T09:00:00Z';
  const published = { id:'11111111-1111-4111-8111-111111111111',
    name:'Published Preview Test',revision:'22222222-2222-4222-8222-222222222222',updated_at:now };
  const privateFrame = { id:'33333333-3333-4333-8333-333333333333',
    name:'Owner Private Preview Test',revision:'44444444-4444-4444-8444-444444444444',updated_at:now };
  const rect = {x:0,y:0,w:1,h:1};
  const shape = {type:'rect',points:[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]};
  const settings={rect,shape,frameOpening:shape,appearance:{
    borderColor:'#0033dd',openingFill:'#ffffff',borderWidth:0,replaceOpening:true
  },collage:{count:1,layout:'grid',gap:1}};
  await page.route('https://vmyoxoiygfcecgkbavgg.supabase.co/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    const ok=json=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(json)});
    if(path==='/rest/v1/megaframe_templates'){
      if(url.searchParams.has('id')){requests.public++;return ok([{...published,settings,artwork:png}]);}
      return ok([published]);
    }
    if(path==='/rest/v1/megaframe_private_templates'){
      if(url.searchParams.has('id')){requests.private++;return ok([{...privateFrame,artwork:png}]);}
      return ok([privateFrame]);
    }
    if(path==='/rest/v1/megaframe_members')return ok([{role:'admin'}]);
    if(path==='/auth/v1/token')return ok({
      access_token:'mock.jwt.token',refresh_token:'mock.refresh.token',expires_in:3600,
      user:{id:'55555555-5555-4555-8555-555555555555',email:'admin@example.com'}
    });
    if(path==='/auth/v1/logout')return route.fulfill({status:204,body:''});
    return route.fulfill({status:404,contentType:'application/json',body:'{}'});
  });
  try {
    await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.getElementById('draftStatus')?.textContent?.includes('Auto-save ready'),{timeout:30000});
    await page.locator('#mf-open').click();
    const sharedImage = page.locator('#mf-list .frameLibCard > img');
    await sharedImage.waitFor({state:'visible',timeout:20000});
    await page.waitForFunction(()=>document.querySelector('#mf-list .frameLibCard > img')?.naturalWidth>0,{timeout:20000});
    assert.match(await sharedImage.getAttribute('alt'),/Published Preview Test/);
    assert.ok(requests.public>0,'Published frame artwork was requested');
    assert.equal(requests.private,0,'Private artwork must not be requested before sign-in');

    // Real artwork still opens into the editor rather than only being a decorative thumbnail.
    await page.locator('#mf-list .frameLibCard button').first().click();
    await page.waitForFunction(()=>document.getElementById('previewTitle')?.textContent==='Published Preview Test',{timeout:20000});

    await page.locator('#mf-open').click();
    await page.locator('#mf-admin-toggle').click();
    await page.locator('#mf-email').fill('admin@example.com');
    await page.locator('#mf-password').fill('test-placeholder-not-a-real-password');
    await page.locator('#mf-signin').click();
    await page.waitForFunction(()=>document.querySelector('#mf-identity')?.textContent?.includes('Administrator'),{timeout:20000});
    await page.locator('#mf-show-private').click();
    const privateImage=page.locator('#mf-private-list .frameLibCard > img');
    await privateImage.waitFor({state:'visible',timeout:20000});
    await page.waitForFunction(()=>document.querySelector('#mf-private-list .frameLibCard > img')?.naturalWidth>0,{timeout:20000});
    assert.match(await privateImage.getAttribute('alt'),/Owner Private Preview Test/);
    assert.ok(requests.private>0,'Owner-private artwork requested after sign-in');

    await page.locator('#mf-signout').click();
    assert.equal(await page.locator('#mf-private-list img').count(),0,
      'Private previews must disappear on sign-out');
    // Only publicly shared rows are permitted in the persistent offline details cache.
    const keys=await page.evaluate(async()=>{
      const request=indexedDB.open('megaframe_shared_public_v1');
      const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
      return new Promise((resolve,reject)=>{
        const q=db.transaction('details','readonly').objectStore('details').getAllKeys();
        q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
      });
    });
    assert.ok(!keys.includes(privateFrame.id),'Private artwork must not enter the public cache');
    assert.deepEqual(errors,[],'Browser runtime errors: '+errors.join(' | '));
    console.log('PASS: published/private artwork thumbnails, opening frame, sign-out privacy and public-only cache.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
