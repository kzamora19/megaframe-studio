const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1460,height:950}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9J6ofLwAAAABJRU5ErkJggg==','base64');
 try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('#startupChoiceDialog[open]').waitFor();
  await page.locator('#createNewProject').click();
  assert.equal(await page.locator('#newProject').isVisible(),false,'New Project is moved from the toolbar to Settings');
  assert.equal(await page.locator('#newProjectPanel').isVisible(),true,'New Project is also under project controls');

  // An untouched blank starter does not produce useless named backups.
  await page.locator('[data-panel="7"]').click();
  await page.locator('#newProject').click();
  assert.equal(await page.evaluate(()=>projectList().then(x=>x.length)),0);
  assert.equal(await page.evaluate(()=>hasUnsavedChanges()),false);

  // Unsaved edits must not disappear when the user cancels the Save & New prompt.
  await page.locator('[data-panel="1"]').click();
  await page.locator('#shapePreset').selectOption('rect');
  await page.locator('#photosInput').setInputFiles({name:'protect-me.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>app.photos.length===1&&hasUnsavedChanges());
  await page.locator('[data-panel="7"]').click();
  await page.locator('#newProject').click();
  await page.locator('#actionModal[open]').waitFor();
  assert.match(await page.locator('#actionModalTitle').textContent(),/Save current project before starting new/);
  assert.match(await page.locator('#actionModalConfirm').textContent(),/Save & create new/);
  await page.locator('#actionModalCancel').click();
  assert.equal(await page.evaluate(()=>app.photos.length),1,'Cancel keeps current photo');
  assert.equal(await page.evaluate(()=>hasUnsavedChanges()),true,'Cancel keeps unsaved edits');
  assert.equal(await page.evaluate(()=>projectList().then(x=>x.length)),0,'Cancel did not create a project');

  // The alternative panel button uses the same mandatory save-first path.
  await page.locator('[data-panel="0"]').click();
  await page.locator('#newProjectPanel').click();
  await page.locator('#actionModal[open]').waitFor();
  await page.locator('#actionModalInput').fill('Protected first project');
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>app.photos.length===0&&!hasUnsavedChanges());
  const named=await page.evaluate(()=>projectList());
  assert.equal(named.length,1,'A named project was committed before clearing');
  assert.equal(named[0].name,'Protected first project');
  // Verify the saved image payload, not only its index entry.
  const details=await page.evaluate(async()=>{
   const rows=await projectList();return projectRead(rows[0].id);
  });
  assert.equal(details.payload.photos.length,1,'Photo retained in saved project');
  assert.equal(details.payload.photos[0].name,'protect-me.png');
  assert.equal(await page.evaluate(()=>app.template.id),'new','New editor is blank');

  // Reopening a saved project, then starting new unchanged, should not duplicate it.
  await page.locator('#openProjects').click();
  await page.locator('#savedProjectsDialog[open]').waitFor();
  await page.locator('#projectList .savedProjectCard').first().getByRole('button',{name:'Open'}).click();
  await page.locator('#actionModal[open]').waitFor();
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>app.photos.length===1&&!hasUnsavedChanges());
  await page.locator('[data-panel="7"]').click();
  await page.locator('#newProject').click();
  await page.waitForFunction(()=>app.photos.length===0);
  assert.equal(await page.evaluate(()=>projectList().then(x=>x.length)),1,'No duplicate when already saved and unchanged');

  // Storage failure must leave the editor completely untouched.
  await page.locator('[data-panel="1"]').click();
  await page.locator('#shapePreset').selectOption('rect');
  await page.locator('#photosInput').setInputFiles({name:'keep-after-error.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>app.photos.length===1&&hasUnsavedChanges());
  await page.evaluate(()=>{
   window.__previousProjectWrite=projectWrite;
   projectWrite=async()=>{throw Error('Test: local storage full')};
  });
  await page.locator('[data-panel="7"]').click();
  await page.locator('#newProject').click();
  await page.locator('#actionModal[open]').waitFor();
  await page.locator('#actionModalInput').fill('Should not save');
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>document.getElementById('projectSaveStatus').textContent.includes('Save failed'));
  assert.equal(await page.evaluate(()=>app.photos.length),1,'Storage failure keeps current edits');
  assert.equal(await page.evaluate(()=>hasUnsavedChanges()),true,'Still unsaved after a failed write');
  assert.equal(await page.evaluate(()=>projectList().then(x=>x.length)),1);
  await page.evaluate(()=>{projectWrite=window.__previousProjectWrite;delete window.__previousProjectWrite});
  assert.deepEqual(errors,[],'No browser runtime errors');
  console.log('PASS: New Project button, save-first, cancellation, persistence, no duplicate, failed save retains work.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
