const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:880}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9J6ofLwAAAABJRU5ErkJggg==','base64');
 try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('#startupChoiceDialog[open]').waitFor();
  await page.locator('#createNewProject').click();
  await page.evaluate(()=>{window.__testCloseRequests=0;window.close=()=>{window.__testCloseRequests++}});
  // Clean workspace: a custom modal opens; save is not needed.
  await page.locator('[data-panel="7"]').click();
  await page.locator('#exitStudio').click();
  await page.locator('#exitStudioDialog[open]').waitFor();
  assert.equal(await page.locator('#exitStudioSave').isVisible(),false);
  await page.locator('#exitStudioCancel').click();
  assert.equal(await page.locator('#exitStudioDialog').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.__testCloseRequests),0);

  // Unsaved photo edits must show the save-first option.
  await page.locator('[data-panel="1"]').click();
  await page.locator('#shapePreset').selectOption('rect');
  await page.locator('#photosInput').setInputFiles({name:'unsaved-exit.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>app.photos.length===1&&hasUnsavedChanges());
  await page.locator('[data-panel="7"]').click();
  await page.locator('#exitStudio').click();
  await page.locator('#exitStudioDialog[open]').waitFor();
  assert.equal(await page.locator('#exitStudioSave').isVisible(),true);
  assert.match(await page.locator('#exitStudioWarning').textContent(),/not been saved/i);
  await page.locator('#exitStudioCancel').click();
  assert.equal(await page.evaluate(()=>app.photos.length),1,'Cancel preserves the editor');

  // Save & Exit must persist a named project before attempting to close.
  await page.locator('[data-panel="7"]').click();
  await page.locator('#exitStudio').click();
  await page.locator('#exitStudioSave').click();
  await page.locator('#actionModal[open]').waitFor();
  await page.locator('#actionModalInput').fill('Exit modal QA project');
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>window.__testCloseRequests===1);
  assert.equal(await page.evaluate(()=>hasUnsavedChanges()),false,'Named save cleared dirty status');
  const projects=await page.evaluate(()=>projectList());
  assert.equal(projects.length,1);
  assert.equal(projects[0].name,'Exit modal QA project');

  // Native guard is still installed for dirty browser close/reload paths.
  await page.locator('#photosInput').setInputFiles({name:'new-unsaved-photo.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>app.photos.length===2&&hasUnsavedChanges());
  await page.waitForTimeout(750); // reset the bypass from the mocked close
  assert.equal(await page.evaluate(()=>{
   const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;
  }),true,'Browser unload guard still protects unsaved edits');
  await page.locator('[data-panel="7"]').click();
  await page.locator('#exitStudio').click();
  await page.locator('#exitStudioLeave').click();
  await page.waitForFunction(()=>window.__testCloseRequests===2);
  assert.equal(await page.evaluate(()=>app.photos.length),2,'Leaving does not mutate project data');
  assert.deepEqual(errors,[],'No JavaScript runtime errors');
  console.log('PASS: exit modal, cancel, named save, and native unload protection');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
