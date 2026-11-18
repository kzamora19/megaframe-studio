const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#draftStatus')?.textContent?.includes('Auto-save ready'));
  const navMin=await page.locator('.pinNav button').first().evaluate(el=>parseFloat(getComputedStyle(el).minHeight));
  assert.ok(navMin>=44,'Mobile navigation has a usable touch target');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9J6ofLwAAAABJRU5ErkJggg==','base64');
  await page.locator('#photosInput').setInputFiles({name:'touch-photo.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>document.querySelector('#photoCount')?.textContent?.includes('1 photo'));
  await page.locator('[data-panel="4"]').click();
  assert.equal(await page.locator('#zoom').inputValue(),'100');
  const state=await page.evaluate(()=>{
   const el=document.getElementById('previewCanvas');
   const t=(id,x,y)=>new Touch({identifier:id,target:el,clientX:x,clientY:y,pageX:x,pageY:y,screenX:x,screenY:y});
   const fire=(kind,points)=>{
     const touches=points.map(([id,x,y])=>t(id,x,y));
     el.dispatchEvent(new TouchEvent(kind,{bubbles:true,cancelable:true,touches,targetTouches:touches,changedTouches:touches}));
   };
   fire('touchstart',[[1,120,320],[2,220,320]]);
   fire('touchmove',[[1,80,320],[2,260,320]]);
   fire('touchend',[]);
   return {zoom:document.getElementById('zoom').value,mode:document.getElementById('adjustBtn').classList.contains('active')};
  });
  assert.equal(state.mode,true,'Adjust mode is active');
  assert.ok(Number(state.zoom)>140,'Two-finger pinch increases selected-photo zoom');
  await page.locator('[data-panel="0"]').click();
  await page.locator('#openFrameLibrary').click();
  await page.locator('#frameLibGrid .favoriteBtn').first().waitFor();
  assert.equal(await page.locator('#frameLibrary').isVisible(),true);
  const btnSize=await page.locator('#frameLibGrid .favoriteBtn').first().evaluate(el=>parseFloat(getComputedStyle(el).minHeight));
  assert.ok(btnSize>=42,'Template library buttons are mobile-sized');
  assert.deepEqual(errors,[],'Browser errors: '+errors.join('; '));
  console.log('PASS: phone touch targets, pinch-to-zoom and library buttons.');
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
