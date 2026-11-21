const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const errors=[];
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9J6ofLwAAAABJRU5ErkJggg==','base64');
 async function review(mobile){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1380,height:900},isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage();page.on('pageerror',err=>errors.push(err.message));
  try{
   await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
   await page.locator('#startupChoiceDialog[open]').waitFor();
   await page.locator('#createNewProject').click();
   const sliderIds=['shapeScale','borderWidth','cornerCut','collageGap','zoom','rotate','emojiCoverSize',
    'filterBrightness','filterContrast','filterSaturation','filterGrayscale','filterSepia','enhanceSharpness','enhanceDenoise'];
   for(const id of sliderIds){
    assert.equal(await page.locator('#'+id+'Number').count(),1,id+' has an editable value');
    assert.equal(await page.locator('#'+id+'Number').getAttribute('type'),'number');
    assert.equal(await page.locator('#'+id+'Value').isHidden(),true,id+' old badge is hidden');
    assert.equal(await page.locator('#'+id+'Number').inputValue(),await page.locator('#'+id).inputValue());
    const limits=await page.locator('#'+id+'Number').evaluate(el=>[el.min,el.max,el.step]);
    const base=await page.locator('#'+id).evaluate(el=>[el.min,el.max,el.step||'1']);
    assert.deepEqual(limits,base,id+' inherits allowed values');
   }
   assert.equal(await page.locator('#zoomNumber').isDisabled(),true,'Zoom cannot be changed without photo');

   if(mobile)await page.locator('#mobileEditToggle').click();
   await page.locator('[data-panel="1"]').click();
   await page.locator('#shapePreset').selectOption('rect');
   await page.locator('#photosInput').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:png});
   await page.waitForFunction(()=>app.photos.length===1);
   await page.locator('[data-panel="4"]').click();
   await page.waitForFunction(()=>!document.getElementById('zoomNumber').disabled);

   async function type(id,value){
    const input=page.locator('#'+id+'Number');
    await input.fill(String(value));
    await input.press('Enter');
    return Number(await input.inputValue());
   }
   assert.equal(await type('zoom',175),175);
   assert.equal(await page.evaluate(()=>app.photos[0].zoom),1.75);
   assert.equal(await page.locator('#zoom').inputValue(),'175');
   assert.equal(await type('rotate',-42),-42);
   assert.equal(await page.evaluate(()=>app.photos[0].rot),-42);
   assert.equal(await page.locator('#rotate').inputValue(),'-42');
   assert.equal(await type('zoom',500),300,'Numeric entry is clamped to slider maximum');
   assert.equal(await page.evaluate(()=>app.photos[0].zoom),3);
   assert.equal(await type('zoom',0),10,'Numeric entry is clamped to slider minimum');
   assert.equal(await page.evaluate(()=>app.photos[0].zoom),.1);
   // Existing slider movements update the editable badge in both directions.
   await page.locator('#zoom').evaluate(el=>{el.value='140';el.dispatchEvent(new Event('input',{bubbles:true}))});
   await page.waitForFunction(()=>document.getElementById('zoomNumber').value==='140');
   assert.equal(await type('filterBrightness',127),127);
   assert.equal(await page.evaluate(()=>app.photos[0].filters.brightness),127);
   assert.equal(await type('filterContrast',111),111);
   assert.equal(await type('filterSaturation',88),88);
   assert.equal(await type('filterGrayscale',20),20);
   assert.equal(await type('filterSepia',55),55);
   assert.equal(await type('enhanceSharpness',46),45,'Enhancement respects 5% steps');
   assert.equal(await type('enhanceDenoise',25),25);
   await page.evaluate(()=>showPanel(3));
   assert.equal(await type('collageGap',2.5),2.5,'Half-percent step is supported');
   assert.equal(await page.evaluate(()=>app.collage.gap),2.5);
   await page.evaluate(()=>showPanel(1));
   assert.equal(await type('borderWidth',14),14);
   assert.equal(await page.evaluate(()=>app.appearance.borderWidth),14);
   await page.evaluate(()=>showPanel(4));
   await page.evaluate(()=>addEmojiCover('😎'));
   assert.equal(await type('emojiCoverSize',42),42);
   assert.equal(await page.evaluate(()=>Math.round(activeCover().size*100)),42);
   // Changing the active photo updates both slider and numeric editor (and stays local).
   await page.locator('#photosInput').setInputFiles({name:'second.png',mimeType:'image/png',buffer:png});
   await page.waitForFunction(()=>app.photos.length===2&&app.selected===1);
   await page.waitForFunction(()=>document.getElementById('zoomNumber').value==='100');
   assert.equal(await type('zoom',210),210);
   await page.evaluate(()=>selectPhoto(0));
   await page.waitForFunction(()=>document.getElementById('zoomNumber').value==='140');
   assert.equal(await page.evaluate(()=>app.photos[0].zoom),1.4);
   assert.equal(await page.evaluate(()=>app.photos[1].zoom),2.1);
   assert.deepEqual(errors,[],'No browser errors');
   console.log('PASS: '+(mobile?'mobile':'desktop')+' editable zoom/rotation and other sliders, bounds, steps, sync, photo isolation');
  }finally{await context.close()}
 }
 try{await review(false);await review(true)}
 finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});