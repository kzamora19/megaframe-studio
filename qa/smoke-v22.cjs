const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const errors=[];
 const page=await browser.newPage({viewport:{width:1500,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('#draftStatus').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#draftStatus')?.textContent?.includes('Auto-save ready'));
  await page.locator('#createNewProject').click();
  await page.locator('[data-panel="7"]').click();
  await page.locator('#mf-open').click();
  await page.locator('#mf-dialog[open]').waitFor();
  await page.locator('#mf-show-private').click();
  assert.equal(await page.locator('#mf-title').textContent(),'My private cloud templates');
  assert.match(await page.locator('#mf-private-list').textContent(),/Sign in with an approved MegaFrame account/);
  assert.equal(await page.locator('#mf-private-save').isHidden(),true);
  await page.locator('#mf-show-shared').click();
  assert.equal(await page.locator('#mf-title').textContent(),'Shared templates');
  assert.equal(await page.locator('#mf-tools').isVisible(),true);
  await page.locator('#mf-close').click();
  await page.locator('#openFrameLibrary').click();
  await page.locator('#frameLibGrid .favoriteBtn').first().click();
  await page.locator('#frameFavoritesOnly').check();
  assert.equal(await page.locator('#frameLibGrid .frameLibCard').count(),1);
  assert.equal(await page.locator('#frameLibGrid .favoriteBtn').first().getAttribute('aria-pressed'),'true');
  assert.deepEqual(errors,[],'Browser runtime errors: '+errors.join('; '));
  console.log('PASS: public/private libraries stay separated; frame favorites filter works.');
 } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
