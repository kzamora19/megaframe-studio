const {chromium}=require('playwright');
const assert=require('node:assert/strict');

async function review(browser,device){
 const isMobile=device==='mobile';
 const context=await browser.newContext({
  viewport:isMobile?{width:390,height:844}:{width:1440,height:960},
  deviceScaleFactor:1,hasTouch:isMobile,isMobile
 });
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('#startupChoiceDialog[open]').waitFor();
  await page.locator('#createNewProject').click();
  await page.locator('[data-panel="1"]').click();
  await page.locator('#shapePreset').selectOption('rect');
  await page.evaluate(async()=>{
   const paints=['#b8d6ff','#bce6da','#fce2bf','#d9cff9'];
   for(let i=0;i<4;i++){
    const c=document.createElement('canvas');c.width=600;c.height=600;
    const x=c.getContext('2d');x.fillStyle=paints[i];x.fillRect(0,0,600,600);
    x.fillStyle='#29455b';x.fillRect(65,220,470,300);
    x.fillStyle='#fff';x.font='bold 85px Arial';x.textAlign='center';
    x.fillText('PHOTO '+(i+1),300,375);
    const data=c.toDataURL('image/png'),image=await decodedImage(data);
    app.photos.push({id:'visual-photo-'+i,name:'Photo '+(i+1),data,image,zoom:1,rot:0,dx:0,dy:0,
     fit:'cover',filters:{...FILTER_DEFAULTS},filterPreset:'none'});
   }
   selectPhoto(0);
  });
  await page.locator('[data-panel="6"]').click();
  assert.match(await page.locator('#modeTag').textContent(),/Overlay editing/,'Canvas identifies editing mode');
  await page.locator('#overlayScope').selectOption('all');
  await page.locator('#addTextOverlay').click();
  await page.locator('#overlayContent').fill('BIG SAVINGS!');
  await page.locator('#overlayColor').fill('#ffdb34');
  await page.locator('#overlayFont').selectOption('Impact');
  await page.locator('#overlayX').fill('50');await page.locator('#overlayX').press('Tab');
  await page.locator('#overlayY').fill('20');await page.locator('#overlayY').press('Tab');
  await page.locator('#overlayWidth').fill('75');await page.locator('#overlayWidth').press('Tab');
  await page.locator('#addTextOverlay').click();
  await page.locator('#overlayContent').fill('₱999 ONLY');
  await page.locator('#overlayX').fill('50');await page.locator('#overlayX').press('Tab');
  await page.locator('#overlayY').fill('80');await page.locator('#overlayY').press('Tab');
  await page.locator('#overlayColor').fill('#ffffff');

  // Add an actual transparent image overlay, shared but independently positioned.
  await page.evaluate(async()=>{
   const c=document.createElement('canvas');c.width=320;c.height=160;
   const x=c.getContext('2d');x.fillStyle='#ef3a3a';x.beginPath();
   x.roundRect(3,3,314,154,32);x.fill();
   x.fillStyle='#fff';x.font='bold 60px Arial';x.textAlign='center';x.fillText('SALE',160,101);
   const data=c.toDataURL('image/png');overlayAdd('image',data,'SALE badge graphic');
  });
  await page.waitForFunction(()=>app.overlays.length===3);
  assert.equal(await page.locator('#overlayLayerList option').count(),3);
  assert.equal(await page.locator('#overlayEditor').isVisible(),true);
  assert.equal(await page.locator('#overlayLayerList').isVisible(),true);
  assert.equal(await page.locator('#overlayRotateRight').isVisible(),true);
  assert.equal(await page.locator('#overlayApplyAll').isEnabled(),true);

  // Select a caption independently and modify one photo, without affecting others.
  await page.locator('#overlayLayerList').selectOption(await page.evaluate(()=>app.overlays[0].id));
  await page.locator('#overlayX').fill('20');await page.locator('#overlayX').press('Tab');
  await page.locator('#overlayRotation').fill('24');await page.locator('#overlayRotation').press('Tab');
  const old=await page.evaluate(()=>({...overlayTransform(app.overlays[0],app.photos[0])}));
  await page.evaluate(()=>selectPhoto(1));
  await page.locator('#overlayX').fill('80');await page.locator('#overlayX').press('Tab');
  await page.locator('#overlayRotation').fill('-16');await page.locator('#overlayRotation').press('Tab');
  assert.deepEqual(await page.evaluate(()=>({...overlayTransform(app.overlays[0],app.photos[0])})),old);
  assert.equal(await page.evaluate(()=>overlayTransform(app.overlays[0],app.photos[1]).rotation),-16);

  // Panel controls must fit the viewport without lateral page overflow.
  const layout=await page.evaluate(()=>{
   const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}};
   return {outerWidth:document.documentElement.scrollWidth,viewportWidth:document.documentElement.clientWidth,
    panel:rect('overlayPanel'),canvas:rect('previewCanvas'),layerList:rect('overlayLayerList'),
    button:rect('addTextOverlay')};
  });
  assert.ok(layout.panel.width>170,'Overlay editor panel must have meaningful width');
  assert.ok(layout.outerWidth<=layout.viewportWidth+20,
   device+': page has horizontal overflow '+JSON.stringify(layout));
  assert.ok(layout.button.width>=70,'Add Caption button has tap-sized width');
  const touchHeight=await page.locator('#addTextOverlay').evaluate(el=>el.getBoundingClientRect().height);
  assert.ok(touchHeight>=26,'Overlay action not too small');

  // Device review of the actual rendered canvas, not just sidebar controls.
  await page.locator('#overlayLayerList').selectOption(await page.evaluate(()=>app.overlays[0].id));
  await page.evaluate(()=>selectPhoto(0));
  await page.locator('.previewCard').scrollIntoViewIfNeeded();
  if(isMobile){
   const coordinates=await page.evaluate(()=>{
    const o=app.overlays[0],photo=app.photos[0],t=overlayTransform(o,photo);
    const g=overlayGeo(t,overlayCurrentCell(o));
    const canvas=document.getElementById('previewCanvas'),r=canvas.getBoundingClientRect();
    return {x:r.left+g.cx/app.frame.width*r.width,
      y:r.top+g.cy/app.frame.height*r.height};
   });
   const oldX=await page.evaluate(()=>overlayTransform(app.overlays[0],app.photos[0]).x);
   const otherX=await page.evaluate(()=>overlayTransform(app.overlays[0],app.photos[1]).x);
   const eventProps={pointerId:22,pointerType:'touch',isPrimary:true,button:0};
   await page.dispatchEvent('#previewCanvas','pointerdown',{...eventProps,clientX:coordinates.x,clientY:coordinates.y});
   await page.dispatchEvent('#previewCanvas','pointermove',{...eventProps,clientX:coordinates.x+14,clientY:coordinates.y+5});
   await page.dispatchEvent('#previewCanvas','pointerup',{...eventProps,clientX:coordinates.x+14,clientY:coordinates.y+5});
   assert.notEqual(await page.evaluate(()=>overlayTransform(app.overlays[0],app.photos[0]).x),oldX,'Touch drag should move the selected overlay');
   assert.equal(await page.evaluate(()=>overlayTransform(app.overlays[0],app.photos[1]).x),otherX,'Touch drag must not move overlay on another photo');
  }
  const canvasBuffer=await page.locator('.previewCard').screenshot({type:'jpeg',quality:55,animations:'disabled'});
  console.log('VISUAL_CANVAS_'+device.toUpperCase()+'='+canvasBuffer.toString('base64'));

  assert.deepEqual(errors,[],'No browser errors '+device);

  // Synthetic image only; no customer records or personal data.
  await page.locator('#overlayPanel').scrollIntoViewIfNeeded();
  await page.locator('#overlayOpacity').evaluate(el=>el.blur());
  const buffer=await page.screenshot({type:'jpeg',quality:48,animations:'disabled'});
  console.log('VISUAL_SCREENSHOT_'+device.toUpperCase()+'='+buffer.toString('base64'));
  console.log('PASS: '+device+' overlays visible, transform controls usable, 3 layers, no horizontal overflow, per-photo independence');
 }finally{await context.close()}
}

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{await review(browser,'desktop');await review(browser,'mobile')}
 finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
