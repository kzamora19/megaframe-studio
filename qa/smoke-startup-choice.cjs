const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1350,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  // On a fresh device, the choice appears although there are no saved projects.
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('#startupChoiceDialog[open]').waitFor();
  assert.equal(await page.locator('#createNewProject').isVisible(),true);
  assert.equal(await page.locator('#retrieveStartupProject').isVisible(),true);
  assert.equal(await page.locator('#savedProjectsDialog').evaluate(el=>el.open),false,'The full project list stays closed until requested');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#startupChoiceDialog').evaluate(el=>el.open),true,'The startup choice cannot be bypassed by Escape');
  await page.locator('#retrieveStartupProject').click();
  await page.locator('#savedProjectsDialog[open]').waitFor();
  assert.match(await page.locator('#projectListStatus').textContent(),/No saved projects yet/);
  assert.equal(await page.locator('#importProject').isVisible(),true,'Even an empty library can import a backup');
  await page.locator('#startBlankProject').click();
  assert.match(await page.locator('#previewTitle').textContent(),/Blank workspace/);
  assert.equal(await page.evaluate(()=>app.photos.length),0);
  assert.equal(await page.evaluate(()=>projectList().then(rows=>rows.length)),0,'No project created by choosing blank');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#startupChoiceDialog[open]').waitFor();
  await page.locator('#createNewProject').click();
  assert.equal(await page.locator('#startupChoiceDialog').evaluate(el=>el.open),false);
  assert.equal(await page.evaluate(()=>app.template.id),'new');
  assert.equal(await page.evaluate(()=>app.photos.length),0);

  // Named projects can be retrieved on the next launch.
  await page.locator('#saveProject').click();
  await page.locator('#actionModalInput').fill('Keep this project');
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>document.getElementById('projectSaveStatus')?.textContent?.includes('Keep this project'));
  assert.equal(await page.evaluate(()=>projectList().then(rows=>rows.length)),1);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#startupChoiceDialog[open]').waitFor();
  await page.locator('#retrieveStartupProject').click();
  await page.locator('#savedProjectsDialog[open]').waitFor();
  assert.equal(await page.locator('#projectList .savedProjectCard').count(),1);
  await page.locator('#projectList .savedProjectCard').first().getByRole('button',{name:'Open'}).click();
  await page.locator('#actionModal[open]').waitFor();
  await page.locator('#actionModalConfirm').click();
  await page.locator('#savedProjectsDialog').waitFor({state:'hidden',timeout:30000});
  assert.match(await page.locator('#previewTitle').textContent(),/Blank workspace/);
  assert.deepEqual(errors,[],'No uncaught browser errors');
  console.log('PASS: every startup offers New/Retrieve, empty library has backup import, named projects restore.');
 } finally {await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
