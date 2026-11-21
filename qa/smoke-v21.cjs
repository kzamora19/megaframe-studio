// Browser smoke test for v2.1 recovery and Smart Fit. Run: node qa/smoke-v21.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async() => {
 const browser = await chromium.launch({headless:true});
 const errors=[];
 const page = await browser.newPage({viewport:{width:1450,height:960}});
 page.on('pageerror',error=>errors.push(error.message));
 try {
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('#draftStatus').waitFor({state:'visible',timeout:45000});
  await page.waitForFunction(() => document.getElementById('draftStatus')?.textContent?.includes('Auto-save ready'),{timeout:45000});
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9J6ofLwAAAABJRU5ErkJggg==','base64');
  await page.locator('#shapePreset').selectOption('rect');
  await page.locator('#photosInput').setInputFiles({name:'test-photo.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(() => document.querySelector('#photoCount')?.textContent?.includes('1 photo'),{timeout:20000});
  await page.locator('[data-panel="4"]').click();
  await page.waitForFunction(() => document.getElementById('photoQuality')?.dataset.grade==='low',{timeout:15000});
  await page.locator('#fitFullPhoto').click();
  assert.equal(await page.locator('#fitMode').inputValue(),'contain');
  await page.locator('#fillPhotoFrame').click();
  assert.equal(await page.locator('#fitMode').inputValue(),'cover');
  await page.locator('#zoom').evaluate(el=>{el.value='75';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(() => document.getElementById('draftStatus')?.textContent?.includes('Draft saved'),{timeout:35000});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#savedProjectsDialog[open]').waitFor({timeout:45000});
  await page.locator('#restoreRecoveryDraft').click();
  await page.waitForFunction(() => document.getElementById('photoCount')?.textContent?.includes('1 photo'),{timeout:30000});
  await page.locator('[data-panel="4"]').click();
  assert.equal(await page.locator('#zoom').inputValue(),'75');
  await page.locator('#centerPhoto').click();
  await page.locator('#resetPhotoPosition').click();
  assert.equal(await page.locator('#zoom').inputValue(),'100');
  console.log('PASS: blank app loads, photo imports, Smart Fit works, draft survives reload and restores.');
  assert.deepEqual(errors,[],'Browser runtime errors: '+errors.join('; '));
 } finally { await browser.close(); }
})().catch(err=>{console.error(err);process.exitCode=1});
