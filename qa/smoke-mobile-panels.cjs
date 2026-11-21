const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({
  viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1
 });
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('#startupChoiceDialog[open]').waitFor();
  await page.locator('#createNewProject').click();
  assert.equal(await page.locator('#mobileEditToggle').isVisible(),true);
  assert.equal(await page.locator('#mobileSlidesToggle').isVisible(),true);
  assert.equal(await page.locator('#mobileEditToggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#mobileSlidesToggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('#editingSidebar').isVisible(),false,'Editing panel closed on startup');
  assert.equal(await page.locator('#photoQueueSidebar').isVisible(),false,'Slides panel closed on startup');
  assert.equal(await page.locator('.workspace').isVisible(),true,'Canvas visible on startup');
  assert.ok(await page.locator('#mobileEditToggle').evaluate(el=>el.getBoundingClientRect().height)>=40,'Accessible mobile button height');

  await page.locator('#mobileEditToggle').click();
  assert.equal(await page.locator('#editingSidebar').isVisible(),true);
  assert.equal(await page.locator('#photoQueueSidebar').isVisible(),false);
  const edit=await page.evaluate(()=>{
   const r=s=>document.querySelector(s).getBoundingClientRect();
   return {panelBottom:r('#editingSidebar').bottom,canvasTop:r('.workspace').top,
    panelHeight:r('#editingSidebar').height,overflow:document.documentElement.scrollWidth-innerWidth};
  });
  assert.ok(edit.panelBottom<=edit.canvasTop+3,'Editor panel pushes canvas down instead of overlaying it');
  assert.ok(edit.panelHeight<=Math.min(540,844*.62)+5,'Editing panel has bounded scroll height');
  assert.ok(edit.overflow<=3,'No horizontal overflow');

  // The existing photo import works even when the edit panel is collapsible.
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9J6ofLwAAAABJRU5ErkJggg==','base64');
  await page.locator('#photosInput').setInputFiles({name:'mobile-sidebar-photo.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>app.photos.length===1);
  await page.locator('#mobileSlidesToggle').click();
  assert.equal(await page.locator('#editingSidebar').isVisible(),false,'Slides expansion closes editing panel');
  assert.equal(await page.locator('#photoQueueSidebar').isVisible(),true);
  assert.equal(await page.locator('#mobileSlidesToggle').getAttribute('aria-expanded'),'true');
  assert.equal(await page.locator('#gallery .thumb').count(),1);
  assert.equal(await page.locator('#quickReplacePhoto').isEnabled(),true);
  const slides=await page.evaluate(()=>{
   const r=s=>document.querySelector(s).getBoundingClientRect();
   return {slidesBottom:r('#photoQueueSidebar').bottom,canvasTop:r('.workspace').top,
    panelHeight:r('#photoQueueSidebar').height,controlsBottom:r('.photoQueuePinned').bottom,
    galleryTop:r('.galleryWrap').top,
    overflow:document.documentElement.scrollWidth-innerWidth};
  });
  assert.ok(slides.slidesBottom<=slides.canvasTop+3,'Photo panel does not cover the canvas');
  assert.ok(slides.panelHeight<=Math.min(520,844*.64)+5,'Slides panel has bounded height');
  assert.ok(slides.galleryTop>=slides.controlsBottom-3,'Pinned selected-photo controls above slides');
  assert.ok(slides.overflow<=3,'No horizontal overflow');

  await page.locator('#mobileSlidesToggle').click();
  assert.equal(await page.locator('#photoQueueSidebar').isVisible(),false);
  assert.equal(await page.locator('#editingSidebar').isVisible(),false);
  assert.equal(await page.evaluate(()=>app.photos.length),1,'Toggling panels never discards photos');

  // A resize back to desktop restores both original sidebars without needing clicks.
  await page.setViewportSize({width:1366,height:900});
  assert.equal(await page.locator('.mobilePanelBar').isVisible(),false,'Mobile controls hidden on desktop');
  assert.equal(await page.locator('#editingSidebar').isVisible(),true,'Desktop editing sidebar visible');
  assert.equal(await page.locator('#photoQueueSidebar').isVisible(),true,'Desktop slide navigation visible');
  assert.deepEqual(errors,[],'No mobile/browser runtime errors');
  console.log('PASS: both mobile sidebars collapsed by default, mutually exclusive, do not cover canvas, preserve photos and restore desktop layout');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
