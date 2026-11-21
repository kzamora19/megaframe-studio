const {chromium}=require('playwright');
const assert=require('node:assert/strict');

// Regression: deleting "Recovered session" must remove its matching automatic
// recovery; otherwise the deleted project gets recreated on next startup.
(async()=>{
 const browser=await chromium.launch({headless:true});
 const errors=[];
 async function freshPage(){
  const context=await browser.newContext({viewport:{width:1400,height:900}});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('draftStatus')?.textContent?.includes('Auto-save ready'));
  return {page,context};
 }
 async function seedDraft(page,ts){
  await page.evaluate(async(time)=>{
   const draft=serializeDraft();
   draft.savedAt=time;
   await draftWrite(draft);
  },ts);
 }
 try{
  // Match the reported case: an archived session with 0 photos.
  {
   const {page,context}=await freshPage();
   const when=Date.now()-10000;
   await seedDraft(page,when);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#savedProjectsDialog[open]').waitFor();
   assert.equal(await page.locator('#automaticRecoveryCard').isVisible(),true);
   assert.equal(await page.locator('#projectList .savedProjectCard').count(),1);
   await page.locator('#projectList .savedProjectCard').first().getByRole('button',{name:'Delete'}).click();
   assert.match(await page.locator('#actionModalMessage').textContent(),/matching automatic recovery copy/i);
   await page.locator('#actionModalConfirm').click();
   await page.waitForFunction(()=>document.querySelectorAll('#projectList .savedProjectCard').length===0);
   assert.equal(await page.locator('#automaticRecoveryCard').isVisible(),false);
   assert.equal(await page.evaluate(async()=>await draftRead()),null,'Matching automatic recovery removed');
   await page.locator('#closeSavedProjects').click();
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.getElementById('draftStatus')?.textContent?.includes('Auto-save ready'));
   assert.equal(await page.locator('#savedProjectsDialog').evaluate(el=>el.open),false,'Deleted recovered session stays deleted on reopen');
   assert.equal(await page.evaluate(()=>projectList().then(rows=>rows.length)),0);
   await context.close();
  }
  // The dedicated discard button also removes only the matching archived session.
  {
   const {page,context}=await freshPage();
   await seedDraft(page,Date.now()-14000);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#savedProjectsDialog[open]').waitFor();
   await page.locator('#discardRecoveryDraft').click();
   await page.locator('#actionModalConfirm').click();
   await page.waitForFunction(()=>document.querySelectorAll('#projectList .savedProjectCard').length===0);
   assert.equal(await page.evaluate(()=>draftRead()),null);
   await page.locator('#closeSavedProjects').click();
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.getElementById('draftStatus')?.textContent?.includes('Auto-save ready'));
   assert.equal(await page.locator('#savedProjectsDialog').evaluate(el=>el.open),false);
   await context.close();
  }
  // A newer draft must NEVER be removed when deleting an older archived session.
  {
   const {page,context}=await freshPage();
   const old=Date.now()-17000;
   await seedDraft(page,old);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#savedProjectsDialog[open]').waitFor();
   const newer=old+10000;
   await seedDraft(page,newer);
   await page.locator('#projectList .savedProjectCard').first().getByRole('button',{name:'Delete'}).click();
   await page.locator('#actionModalConfirm').click();
   assert.equal(await page.evaluate(()=>draftRead().then(d=>d.savedAt)),newer,'Newer draft survives deleting older archive');
   assert.equal(await page.evaluate(()=>projectList().then(rows=>rows.length)),0);
   await page.locator('#closeSavedProjects').click();
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#savedProjectsDialog[open]').waitFor();
   assert.equal(await page.evaluate(()=>draftRead().then(d=>d.savedAt)),newer);
   assert.equal(await page.locator('#projectList .savedProjectCard').count(),1,'Newer draft is recovered safely');
   await context.close();
  }
  assert.deepEqual(errors,[],'No browser runtime exceptions');
  console.log('PASS: deleted recovered session stays deleted; discard works; newer drafts are preserved.');
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
