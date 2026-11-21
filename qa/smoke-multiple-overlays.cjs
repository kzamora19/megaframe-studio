const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9J6ofLwAAAABJRU5ErkJggg==','base64');
 try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('#startupChoiceDialog[open]').waitFor();
  await page.locator('#createNewProject').click();
  await page.locator('#photosInput').setInputFiles([
   {name:'photo-1.png',mimeType:'image/png',buffer:png},
   {name:'photo-2.png',mimeType:'image/png',buffer:png}
  ]);
  await page.waitForFunction(()=>app.photos.length===2);
  await page.locator('[data-panel="6"]').click();
  await page.locator('#overlayScope').selectOption('all');

  // Each click must add a new caption rather than overwriting an earlier one.
  for(const caption of ['SALE TODAY','SAVE MORE','LIMITED OFFER']){
   await page.locator('#addTextOverlay').click();
   await page.locator('#overlayContent').fill(caption);
  }
  assert.equal(await page.locator('#overlayLayerList option').count(),3,'Three separate caption layers appear');
  assert.deepEqual(await page.evaluate(()=>app.overlays.map(o=>o.text)),['SALE TODAY','SAVE MORE','LIMITED OFFER']);
  await page.locator('#overlayLayerList').selectOption(await page.evaluate(()=>app.overlays[0].id));
  await page.locator('#overlayColor').fill('#ff0000');
  await page.locator('#overlayRotation').fill('15');
  await page.locator('#overlayRotation').press('Tab');
  await page.locator('#overlayLayerList').selectOption(await page.evaluate(()=>app.overlays[1].id));
  await page.locator('#overlayColor').fill('#00ff00');
  await page.locator('#overlayRotation').fill('-30');
  await page.locator('#overlayRotation').press('Tab');
  assert.equal(await page.evaluate(()=>app.overlays[0].style.color),'#ff0000','First caption preserves its own styling');
  assert.equal(await page.evaluate(()=>app.overlays[1].style.color),'#00ff00','Second caption preserves its own styling');
  assert.equal(await page.evaluate(()=>app.overlays[0].overrides[app.photos[0].id].rotation),15);
  assert.equal(await page.evaluate(()=>app.overlays[1].overrides[app.photos[0].id].rotation),-30);

  // More than 80 captions must survive a complete project save and restore;
  // the original restore code silently truncated the user's layers to 80.
  await page.evaluate(()=>{
   for(let i=3;i<85;i++){
    overlayAdd('text');
    const o=app.overlays.at(-1);
    o.text='CAPTION '+String(i+1);
    o.name=o.text;
    o.style.color=(i%2)?'#ffff00':'#ffffff';
    overlaySetTransform(o,app.photos[0],{x:.1+(i%8)*.1,y:.2,rotation:i%45});
    overlaySetTransform(o,app.photos[1],{x:.8-(i%8)*.1,y:.7,rotation:-(i%45)});
   }
   overlayRefreshList();
   overlayRefreshEditor();
  });
  assert.equal(await page.evaluate(()=>app.overlays.length),85,'85 separately editable captions');
  assert.equal(await page.locator('#overlayLayerList option').count(),85);
  assert.equal(await page.evaluate(()=>app.overlays[20].overrides[app.photos[0].id].x!==app.overlays[20].overrides[app.photos[1].id].x),true);

  await page.locator('#overlayImageInput').setInputFiles({name:'caption-artwork.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>app.overlays.length===86);
  assert.equal(await page.evaluate(()=>app.overlays[85].kind),'image','Image graphic may coexist with all captions');
  const before=await page.evaluate(()=>({
    names:app.overlays.map(o=>o.text||o.name),
    secondPhoto:app.overlays[20].overrides[app.photos[1].id],
    firstPhoto:app.overlays[20].overrides[app.photos[0].id]
  }));

  await page.locator('[data-panel="0"]').click();
  await page.locator('#saveProject').click();
  await page.locator('#actionModal[open]').waitFor();
  await page.locator('#actionModalInput').fill('Many captions without limits');
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>document.getElementById('projectSaveStatus')?.textContent?.includes('Many captions without limits'));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#startupChoiceDialog[open]').waitFor();
  await page.locator('#retrieveStartupProject').click();
  await page.locator('#savedProjectsDialog[open]').waitFor();
  await page.locator('#projectList .savedProjectCard').filter({hasText:'Many captions without limits'}).getByRole('button',{name:'Open'}).click();
  await page.locator('#actionModal[open]').waitFor();
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>app.photos.length===2&&app.overlays.length===86);
  assert.deepEqual(await page.evaluate(()=>app.overlays.map(o=>o.text||o.name)),before.names,'All caption contents survive save/reopen');
  assert.deepEqual(await page.evaluate(()=>app.overlays[20].overrides[app.photos[1].id]),before.secondPhoto,'Photo 2 transform unchanged');
  assert.deepEqual(await page.evaluate(()=>app.overlays[20].overrides[app.photos[0].id]),before.firstPhoto,'Photo 1 transform unchanged');
  assert.equal(await page.evaluate(()=>app.overlays[0].style.color),'#ff0000');
  assert.equal(await page.evaluate(()=>app.overlays[1].style.color),'#00ff00');
  await page.locator('[data-panel="6"]').click();
  assert.equal(await page.locator('#overlayLayerList option').count(),86,'All saved layers editable after reopen');
  assert.deepEqual(errors,[],'No runtime exceptions');
  console.log('PASS: user can add many independent captions and image overlays; >80 layers, styling and per-photo layouts survive save/reopen.');
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
