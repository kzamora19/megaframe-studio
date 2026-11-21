const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1390,height:920}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9J6ofLwAAAABJRU5ErkJggg==','base64');
 try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('draftStatus')?.textContent?.includes('Auto-save ready'));
  assert.equal(await page.locator('#savedProjectsDialog').evaluate(el=>el.open),false,'No recovery modal on fresh device');
  assert.match(await page.locator('#previewTitle').textContent(),/Blank workspace/);
  assert.equal(await page.evaluate(()=>app.template.id),'new');
  assert.equal(await page.evaluate(()=>app.photos.length),0);
  assert.equal(await page.evaluate(()=>hasUnsavedChanges()),false);
  await page.locator('[data-panel="1"]').click();
  await page.locator('#shapePreset').selectOption('rect');
  await page.locator('#photosInput').setInputFiles({name:'unfinished.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>app.photos.length===1&&hasUnsavedChanges());
  assert.equal(await page.evaluate(()=>{
    const e=new Event('beforeunload',{cancelable:true});
    window.dispatchEvent(e);
    return e.defaultPrevented;
  }),true,'Unsaved project invokes browser close safeguard');
  await page.waitForFunction(()=>document.getElementById('draftStatus')?.textContent?.includes('Draft saved'),{timeout:30000});
  const preserved=await page.evaluate(()=>draftRead().then(r=>({count:r.photos?.length||0,savedAt:r.savedAt})));
  assert.equal(preserved.count,1);
  // Playwright handles the native browser beforeunload dialog for reload.
  page.once('dialog',async dialog=>dialog.accept());
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#savedProjectsDialog[open]').waitFor({timeout:30000});
  assert.match(await page.locator('#previewTitle').textContent(),/Blank workspace/);
  await page.locator('#automaticRecoveryCard').waitFor({state:'visible'});
  assert.equal(await page.locator('#projectList .savedProjectCard').count(),1,'Recovery copy archived as a named project');
  await page.locator('#startBlankProject').click();
  assert.equal(await page.evaluate(()=>app.photos.length),0,'Start Blank leaves editor fresh');
  assert.equal(await page.evaluate(()=>draftRead().then(r=>r?.photos?.length)),1,'Start Blank never discards recovery');
  await page.locator('#openProjects').click();
  await page.locator('#savedProjectsDialog[open]').waitFor();
  await page.locator('#projectList .savedProjectCard').first().getByRole('button',{name:'Open'}).click();
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>app.photos.length===1);
  assert.equal(await page.evaluate(()=>app.photos[0].name),'unfinished.png');
  assert.equal(await page.evaluate(()=>hasUnsavedChanges()),false,'Opening a saved project establishes a clean state');
  await page.locator('#zoom').evaluate(el=>{el.value='115';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await page.evaluate(()=>hasUnsavedChanges()),true,'Editing after restore becomes unsaved');
  await page.locator('[data-panel="0"]').click();
  await page.locator('#saveProject').click();
  await page.locator('#actionModalInput').fill('Final project');
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>document.getElementById('projectSaveStatus')?.textContent?.includes('Final project'));
  assert.equal(await page.evaluate(()=>hasUnsavedChanges()),false,'Explicit Save Project clears closing warning');
  assert.deepEqual(errors,[],'No browser runtime errors');
  console.log('PASS: blank startup, unsaved-close warning, safe recovery, new blank session, named restore and save.');
 } finally {await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
