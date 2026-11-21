const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1330,height:880}});
 const errors=[];
 page.on('pageerror', e=>errors.push(e.message));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9J6ofLwAAAABJRU5ErkJggg==','base64');
 try {
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('#startupChoiceDialog[open]').waitFor();
  await page.locator('#createNewProject').click();
  // Explicitly fail if an app-owned install alert escapes to the browser.
  await page.evaluate(()=>{window.alert=()=>{throw Error('Native alert is forbidden for app guidance')}});
  await page.locator('#pwa-install').click();
  await page.locator('#studioInfoDialog[open]').waitFor();
  assert.match(await page.locator('#studioInfoTitle').textContent(),/Install MegaFrame Studio/);
  assert.match(await page.locator('#studioInfoMessage').textContent(),/Chrome or Edge|Safari|Android|browser menu/i);
  await page.locator('#studioInfoClose').click();
  assert.equal(await page.locator('#studioInfoDialog').isVisible(),false);
  // New version banner should request a modal, not skip waiting immediately.
  await page.evaluate(()=>{
   window.__updateRequestCount=0;
   window.megaFrameApplyUpdate=()=>window.__updateRequestCount++;
   document.getElementById('pwa-update').hidden=false;
   document.getElementById('pwa-update-reload').onclick=()=>window.megaFrameOpenReloadModal('update');
  });
  await page.locator('#pwa-update-reload').click();
  await page.locator('#reloadStudioDialog[open]').waitFor();
  assert.match(await page.locator('#reloadStudioTitle').textContent(),/Update MegaFrame Studio/);
  await page.locator('#reloadStudioCancel').click();
  assert.equal(await page.evaluate(()=>window.__updateRequestCount),0,'Cancel never activates app update');
  // Unsaved work: Save & Update must save before issuing update activation.
  await page.locator('[data-panel="1"]').click();
  await page.locator('#shapePreset').selectOption('rect');
  await page.locator('#photosInput').setInputFiles({name:'modal-updates.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>app.photos.length===1&&hasUnsavedChanges());
  await page.locator('#pwa-update-reload').click();
  assert.equal(await page.locator('#reloadStudioSave').isVisible(),true);
  assert.match(await page.locator('#reloadStudioSave').textContent(),/Save & Update/);
  await page.locator('#reloadStudioSave').click();
  await page.locator('#actionModal[open]').waitFor();
  await page.locator('#actionModalInput').fill('Update safely');
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>window.__updateRequestCount===1);
  assert.equal(await page.evaluate(()=>hasUnsavedChanges()),false);
  const named=await page.evaluate(()=>projectList());
  assert.equal(named.length,1,'Named project persisted before update');
  assert.equal(named[0].name,'Update safely');
  assert.deepEqual(errors,[]);
  console.log('PASS: install guidance modal, update cancel and save-first modal; no native app alerts');
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
