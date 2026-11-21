const {chromium}=require('playwright');
const assert=require('node:assert/strict');

async function testFonts(browser,mobile){
 const context=await browser.newContext({
  viewport:mobile?{width:390,height:844}:{width:1440,height:950},
  hasTouch:mobile,isMobile:mobile
 });
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('#startupChoiceDialog[open]').waitFor();
  await page.locator('#createNewProject').click();
  await page.locator('[data-panel="6"]').click();
  await page.locator('#overlayScope').selectOption('canvas');
  await page.locator('#addTextOverlay').click();
  await page.locator('#overlayContent').fill('BIG SAVINGS!');
  assert.ok(await page.locator('#overlayFont').locator('option').count()>=40,'Expanded font catalog');
  assert.equal(await page.locator('#overlayFontButton').getAttribute('aria-expanded'),'false');
  await page.locator('#overlayFontButton').click();
  await page.locator('#overlayFontMenu').waitFor({state:'visible'});
  const fontMenuImage=await page.locator('#overlayFontMenu').screenshot({type:'jpeg',quality:55,animations:'disabled'});
  console.log('FONT_PICKER_VISUAL_'+(mobile?'MOBILE':'DESKTOP')+'='+fontMenuImage.toString('base64'));
  assert.equal(await page.locator('#overlayFontButton').getAttribute('aria-expanded'),'true');
  assert.ok(await page.locator('#overlayFontList [data-font]').count()>=40);
  const names=await page.locator('#overlayFontList [data-font]').evaluateAll(els=>els.map(el=>el.dataset.font));
  assert.ok(names.includes('Segoe Script')&&names.includes('Times New Roman')&&names.includes('Cooper Black'));
  const styles=await page.locator('#overlayFontList [data-font]').evaluateAll(els=>
    Object.fromEntries(els.filter(el=>['Impact','Georgia','Segoe Script'].includes(el.dataset.font))
      .map(el=>[el.dataset.font,el.style.fontFamily])));
  assert.ok(styles.Impact.includes('Impact'));
  assert.ok(styles.Georgia.includes('Georgia'));
  assert.ok(styles['Segoe Script'].includes('Segoe Script'));
  assert.notEqual(styles.Impact,styles.Georgia,'Each font row renders in its own family');
  await page.locator('#overlayFontSearch').fill('script');
  assert.equal(await page.locator('#overlayFontList [data-font="Arial"]').isVisible(),false);
  assert.equal(await page.locator('#overlayFontList [data-font="Segoe Script"]').isVisible(),true);
  await page.locator('#overlayFontList [data-font="Segoe Script"]').click();
  assert.equal(await page.locator('#overlayFontMenu').isVisible(),false,'Picker closes after choosing a font');
  assert.equal(await page.locator('#overlayFontSelected').textContent(),'Segoe Script');
  assert.equal(await page.evaluate(()=>app.overlays[0].style.font),'Segoe Script','Text overlay uses chosen script font');
  assert.ok((await page.locator('#overlayFontSelected').evaluate(el=>el.style.fontFamily)).includes('Segoe Script'));
  assert.ok((await page.evaluate(()=>overlayFontFamily(app.overlays[0].style.font))).includes('Segoe Script'),
    'Canvas and menu use matching font stacks');
  const drawingFont=await page.evaluate(()=>{
   const ctx=document.createElement('canvas').getContext('2d');
   const overlay=app.overlays[0];
   overlayDrawText(ctx,overlay,{w:280,h:120},{w:500,h:500});
   return ctx.font;
  });
  assert.ok(drawingFont.includes('Segoe Script'),'Actual text canvas renderer uses selected typeface');

  // Keyboard navigation and Escape are available for the accessible menu.
  await page.locator('#overlayFontButton').press('ArrowDown');
  await page.locator('#overlayFontMenu').waitFor({state:'visible'});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#overlayFontMenu').isVisible(),false);
  await page.locator('#overlayFontButton').click();
  await page.locator('#overlayFontSearch').fill('NoMatchingFontName123');
  assert.equal(await page.locator('#overlayFontEmpty').isVisible(),true);
  await page.locator('#overlayFontClose').click();

  // Other captions have their own font family; changing one does not alter another.
  await page.locator('#addTextOverlay').click();
  await page.locator('#overlayContent').fill('₱999 ONLY');
  await page.locator('#overlayFontButton').click();
  await page.locator('#overlayFontSearch').fill('Cooper Black');
  await page.locator('#overlayFontList [data-font="Cooper Black"]').click();
  assert.deepEqual(await page.evaluate(()=>app.overlays.map(o=>o.style.font)),['Segoe Script','Cooper Black']);

  const bounds=await page.locator('#overlayFontButton').boundingBox();
  assert.ok(bounds.width>80,'Font picker has usable width');
  await page.locator('#overlayFontButton').click();
  const menuBounds=await page.locator('#overlayFontMenu').boundingBox();
  assert.ok(menuBounds.x>=0&&menuBounds.x+menuBounds.width<= (mobile?390:1440)+1,
    'Font preview menu remains on screen');
  assert.ok(menuBounds.y>=0&&menuBounds.y+menuBounds.height<= (mobile?844:950)+1,
    'Font preview menu fits vertically');
  await page.locator('#overlayFontClose').click();

  if(!mobile){
   // Legacy saved-project and automation path still works.
   await page.locator('#overlayFont').selectOption('Impact');
   assert.equal(await page.evaluate(()=>app.overlays[1].style.font),'Impact');
   await page.locator('#overlayFontButton').click();
   await page.locator('#overlayFontSearch').fill('Cooper Black');
   await page.locator('#overlayFontList [data-font="Cooper Black"]').click();
   await page.locator('[data-panel="0"]').click();
   await page.locator('#saveProject').click();
   await page.locator('#actionModal[open]').waitFor();
   await page.locator('#actionModalInput').fill('Font style showcase');
   await page.locator('#actionModalConfirm').click();
   await page.waitForFunction(()=>document.getElementById('projectSaveStatus')?.textContent.includes('Font style showcase'));
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#startupChoiceDialog[open]').waitFor();
   await page.locator('#retrieveStartupProject').click();
   await page.locator('#savedProjectsDialog[open]').waitFor();
   await page.locator('#projectList .savedProjectCard').filter({hasText:'Font style showcase'}).getByRole('button',{name:'Open'}).click();
   await page.locator('#actionModal[open]').waitFor();
   await page.locator('#actionModalConfirm').click();
   await page.waitForFunction(()=>app.overlays.length===2);
   assert.deepEqual(await page.evaluate(()=>app.overlays.map(o=>o.style.font)),
     ['Segoe Script','Cooper Black'],'Font families survive save and restore');
   await page.locator('[data-panel="6"]').click();
   await page.locator('#overlayLayerList').selectOption(await page.evaluate(()=>app.overlays[0].id));
   assert.equal(await page.locator('#overlayFontSelected').textContent(),'Segoe Script');
  }
  assert.deepEqual(errors,[],'No browser runtime errors');
  console.log('PASS: '+(mobile?'mobile':'desktop')+' styled Word-like font dropdown, search, keyboard, save, rendering and font independence');
 }finally{await context.close()}
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{await testFonts(browser,false);await testFonts(browser,true)}
 finally{await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1});