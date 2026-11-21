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
  await page.locator('[data-panel="1"]').click();
  await page.locator('#shapePreset').selectOption('rect');
  await page.locator('#photosInput').setInputFiles([
   {name:'one.png',mimeType:'image/png',buffer:png},
   {name:'two.png',mimeType:'image/png',buffer:png}
  ]);
  await page.waitForFunction(()=>app.photos.length===2);
  const ids=await page.evaluate(()=>app.photos.map(p=>p.id));
  await page.evaluate(()=>selectPhoto(0));
  await page.locator('[data-panel="6"]').click();
  await page.locator('#overlayScope').selectOption('all');
  await page.locator('#addTextOverlay').click();
  assert.equal(await page.evaluate(()=>app.overlays.length),1);
  await page.locator('#overlayContent').fill('BIG SAVINGS!');
  await page.locator('#overlayX').fill('20');await page.locator('#overlayX').press('Tab');
  await page.locator('#overlayY').fill('30');await page.locator('#overlayY').press('Tab');
  await page.locator('#overlayWidth').fill('45');await page.locator('#overlayWidth').press('Tab');
  await page.locator('#overlayRotation').fill('15');await page.locator('#overlayRotation').press('Tab');
  assert.deepEqual(await page.evaluate(()=>({
   x:app.overlays[0].overrides[app.photos[0].id].x,
   y:app.overlays[0].overrides[app.photos[0].id].y,
   rotation:app.overlays[0].overrides[app.photos[0].id].rotation
  })),{x:.2,y:.3,rotation:15});
  await page.evaluate(()=>selectPhoto(1));
  await page.locator('#overlayX').fill('80');await page.locator('#overlayX').press('Tab');
  await page.locator('#overlayY').fill('75');await page.locator('#overlayY').press('Tab');
  await page.locator('#overlayWidth').fill('80');await page.locator('#overlayWidth').press('Tab');
  await page.locator('#overlayRotation').fill('-45');await page.locator('#overlayRotation').press('Tab');
  const t=await page.evaluate(()=>app.overlays[0]);
  assert.equal(t.overrides[ids[0]].x,.2,'Photo one keeps independent x');
  assert.equal(t.overrides[ids[0]].rotation,15,'Photo one keeps independent angle');
  assert.equal(t.overrides[ids[1]].x,.8,'Photo two stores its own x');
  assert.equal(t.overrides[ids[1]].rotation,-45,'Photo two stores its own angle');
  assert.notEqual(t.overrides[ids[0]].w,t.overrides[ids[1]].w,'Independent dimensions');
  assert.equal(t.text,'BIG SAVINGS!','Text content stays shared');
  await page.locator('#overlayRotateRight').click();
  assert.equal(await page.evaluate(()=>app.overlays[0].overrides[app.photos[1].id].rotation),45,'90 degree orientation adjustment');
  await page.locator('#overlayVisible').uncheck();
  assert.equal(await page.evaluate(()=>app.overlays[0].overrides[app.photos[1].id].visible),false);
  assert.equal(await page.evaluate(()=>app.overlays[0].overrides[app.photos[0].id].visible),true,'Visibility independent');

  // Image overlays accept locally imported transparent graphics and transformations.
  await page.locator('#overlayScope').selectOption('photo');
  await page.locator('#overlayImageInput').setInputFiles({name:'caption.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>app.overlays.length===2);
  assert.equal(await page.evaluate(()=>app.overlays[1].scope),'photo');
  assert.equal(await page.evaluate(()=>app.overlays[1].photoId),ids[1]);
  await page.locator('#overlayRotation').fill('90');await page.locator('#overlayRotation').press('Tab');
  assert.equal(await page.evaluate(()=>app.overlays[1].base.rotation),90);

  // Drag shared overlay in one photo: other photo's transform must remain unchanged.
  await page.evaluate(()=>selectPhoto(0));
  await page.locator('#overlayLayerList').selectOption(t.id);
  const before=await page.evaluate(()=>app.overlays[0].overrides[app.photos[1].id].x);
  await page.evaluate(()=>{
   const p=app.photos[0],o=app.overlays[0],g=overlayGeo(overlayTransform(o,p),overlayCurrentCell(o));
   overlayPointerDown({x:g.cx,y:g.cy});
   overlayPointerMove({x:g.cx+40,y:g.cy+12});
   overlayPointerUp();
  });
  assert.equal(await page.evaluate(()=>app.overlays[0].overrides[app.photos[1].id].x),before,'Dragging photo 1 does not move photo 2');
  // Corner resize and rotation handle are also per-photo, not merely numeric fields.
  const b=await page.evaluate(()=>({...app.overlays[0].overrides[app.photos[1].id]}));
  const changes=await page.evaluate(()=>{
   const o=app.overlays[0],p=app.photos[0],cell=overlayCurrentCell(o);
   const before={...overlayTransform(o,p)},g=overlayGeo(before,cell);
   const rightTop={
    x:g.cx+Math.cos(g.angle)*g.w/2+Math.sin(g.angle)*g.h/2,
    y:g.cy+Math.sin(g.angle)*g.w/2-Math.cos(g.angle)*g.h/2
   };
   overlayPointerDown(rightTop);
   overlayPointerMove({x:rightTop.x+cell.w*.13,y:rightTop.y-cell.h*.09});
   overlayPointerUp();
   const afterResize={...overlayTransform(o,p)};
   const updated=overlayGeo(afterResize,cell);
   const ry=-updated.h/2-Math.max(Math.max(14,app.frame.width/90)*2,app.frame.height/40);
   const sx=updated.cx-Math.sin(updated.angle)*ry;
   const sy=updated.cy+Math.cos(updated.angle)*ry;
   overlayPointerDown({x:sx,y:sy});
   overlayPointerMove({x:updated.cx+100,y:updated.cy-100});
   overlayPointerUp();
   return {before,afterResize,afterRotate:{...overlayTransform(o,p)}};
  });
  assert.notEqual(changes.afterResize.w,changes.before.w,'Corner resize changes width');
  assert.notEqual(changes.afterResize.h,changes.before.h,'Aspect-lock resize changes height');
  assert.notEqual(changes.afterRotate.rotation,changes.afterResize.rotation,'Rotation handle changes angle');
  assert.deepEqual(await page.evaluate(()=>({...app.overlays[0].overrides[app.photos[1].id]})),b,'Resizing/rotating photo 1 leaves photo 2 untouched');
  assert.equal(await page.evaluate(()=>app.overlays[0].locked),false);
  await page.locator('#overlayLocked').check();
  assert.equal(await page.evaluate(()=>app.overlays[0].locked),true,'Layer can be locked');
  await page.locator('#overlayLocked').uncheck();


  // Shared text/image and per-photo overrides persist through saves and backups.
  const saved=await page.evaluate(()=>serializeDraft());
  assert.equal(saved.overlays.length,2);
  assert.ok(saved.overlays[0].overrides[ids[1]]);
  assert.ok(saved.overlays[1].data.startsWith('data:image/png;base64,'));
  await page.locator('[data-panel="0"]').click();
  await page.locator('#saveProject').click();
  await page.locator('#actionModalInput').fill('Editable overlays');
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>document.getElementById('projectSaveStatus')?.textContent?.includes('Editable overlays'));
  await page.locator('#newProject').click();
  await page.waitForFunction(()=>app.overlays.length===0&&app.photos.length===0);
  await page.locator('#openProjects').click();
  await page.locator('#savedProjectsDialog[open]').waitFor();
  await page.locator('#projectList .savedProjectCard').filter({hasText:'Editable overlays'}).getByRole('button',{name:'Open'}).click();
  await page.locator('#actionModal[open]').waitFor();
  await page.locator('#actionModalConfirm').click();
  await page.waitForFunction(()=>app.photos.length===2&&app.overlays.length===2);
  assert.equal(await page.evaluate(()=>app.overlays[0].overrides[app.photos[1].id].rotation),45);
  assert.equal(await page.evaluate(()=>app.overlays[1].base.rotation),90);
  await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=app.frame.width;canvas.height=app.frame.height;renderComposite(canvas.getContext('2d'),1,0)});
  // Explicit Apply to All copies the current photo's layout across existing ones.
  await page.locator('[data-panel="6"]').click();
  await page.evaluate(()=>selectPhoto(1));
  await page.locator('#overlayLayerList').selectOption(t.id);
  await page.locator('#overlayApplyAll').click();
  assert.equal(await page.evaluate(()=>Object.keys(app.overlays[0].overrides).length),0);
  assert.equal(await page.evaluate(()=>app.overlays[0].base.rotation),45);
  assert.deepEqual(errors,[],'No page errors');
  console.log('PASS: shared overlay, independent photo transforms, image import, drag/rotate/visibility, persistence and apply-all.');
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1});