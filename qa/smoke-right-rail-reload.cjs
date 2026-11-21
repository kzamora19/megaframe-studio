const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.locator('#startupChoiceDialog[open]').waitFor();
  await page.locator('#createNewProject').click();
  const desktop=await page.evaluate(()=>{
   const r=s=>document.querySelector(s).getBoundingClientRect();
   return {queueX:r('.photoQueueSidebar').left,workspaceRight:r('.workspace').right,
    controlsTop:r('.photoQueuePinned').top,railPosition:getComputedStyle(document.querySelector('.photoQueueSidebar')).position,
    viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth};
  });
  assert.ok(desktop.queueX>=desktop.workspaceRight-2,'Photo queue must be to the right of editor');
  assert.equal(desktop.railPosition,'sticky','Right queue should stay pinned to viewport');
  assert.ok(desktop.scrollWidth<=desktop.viewport+3,'Desktop horizontal overflow');

  // All PWA window widths must keep the slide navigator alongside the editor.
  for(const width of [800,900,1024,1366]){
   await page.setViewportSize({width,height:768});
   const placement=await page.evaluate(()=>{
    const r=selector=>document.querySelector(selector).getBoundingClientRect();
    const p=r('.photoQueueSidebar'),w=r('.workspace'),g=r('.galleryWrap');
    return {sidebarLeft:p.left,workspaceRight:w.right,sidebarTop:p.top,
      galleryHeight:g.height,sidebarWidth:p.width,viewport:innerWidth,
      horizontalOverflow:document.documentElement.scrollWidth-innerWidth};
   });
   assert.ok(placement.sidebarLeft>=placement.workspaceRight-2,
    width+': slide navigator must stay in rightmost column '+JSON.stringify(placement));
   assert.ok(placement.sidebarTop<220,
    width+': slide navigator should appear at the top '+JSON.stringify(placement));
   assert.ok(placement.sidebarWidth>=190&&placement.galleryHeight>100,
    width+': photo navigation must have usable space '+JSON.stringify(placement));
   assert.ok(placement.horizontalOverflow<=3,
    width+': no horizontal overflow '+JSON.stringify(placement));
  }

  // Populate synthetic (non-customer) pictures to verify queue scrolling and photo selection.
  await page.evaluate(async()=>{
   const paint=document.createElement('canvas');paint.width=240;paint.height=160;
   const x=paint.getContext('2d');
   for(let i=0;i<9;i++){
    x.fillStyle='hsl('+i*34+' 60% 70%)';x.fillRect(0,0,240,160);
    const data=paint.toDataURL('image/png'),image=await decodedImage(data);
    app.photos.push({id:'rail-qa-'+i,name:'Synthetic test photo '+(i+1),data,image,
     zoom:1,rot:0,dx:0,dy:0,fit:'cover',filters:{...FILTER_DEFAULTS},filterPreset:'none'});
   }
   selectPhoto(0);
  });
  assert.equal(await page.locator('#gallery .thumb').count(),9);
  const firstSlideVisible=await page.evaluate(()=>{
   const r=document.querySelector('#gallery .thumb').getBoundingClientRect();
   const a=document.querySelector('.photoQueueSidebar').getBoundingClientRect();
   return r.width>50&&r.height>30&&r.top<innerHeight&&r.left>=a.left;
  });
  assert.ok(firstSlideVisible,'First slide thumbnail appears in visible right sidebar');
  const railScroll=await page.evaluate(()=>{
   const queue=document.querySelector('.photoQueueSidebar .galleryWrap');
   const top=document.querySelector('.photoQueuePinned').getBoundingClientRect().top;
   const isScrollable=queue.scrollHeight>queue.clientHeight;
   queue.scrollTop=queue.scrollHeight;return {isScrollable,top,after:document.querySelector('.photoQueuePinned').getBoundingClientRect().top};
  });
  assert.ok(railScroll.isScrollable,'Queue thumbnails scroll separately from pinned controls');
  assert.ok(Math.abs(railScroll.top-railScroll.after)<2,'Control header remains pinned while queue scrolls');
  await page.locator('#gallery .thumb').nth(1).click();
  assert.equal(await page.evaluate(()=>app.selected),1,'Clicking a right-side thumbnail selects photo');

  await page.locator('#reloadStudio').click();
  await page.locator('#reloadStudioDialog[open]').waitFor();
  assert.equal(await page.locator('#reloadStudioSave').isVisible(),true,'Unsaved work offers Save & Reload');
  await page.locator('#reloadStudioCancel').click();
  assert.equal(await page.evaluate(()=>app.photos.length),9,'Cancel does not discard photos');

  // Intercept supported app-level shortcuts, but retain native unload protection.
  const intercepted=await page.evaluate(()=>{
   const event=new KeyboardEvent('keydown',{key:'r',ctrlKey:true,bubbles:true,cancelable:true});
   window.dispatchEvent(event);return event.defaultPrevented;
  });
  assert.equal(intercepted,true,'Ctrl+R gets an in-app confirmation when event is delivered');
  await page.locator('#reloadStudioDialog[open]').waitFor();
  await page.locator('#reloadStudioCancel').click();
  assert.equal(await page.evaluate(()=>{
   const e=new Event('beforeunload',{cancelable:true});
   window.dispatchEvent(e);return e.defaultPrevented;
  }),true,'Native browser unload warning remains for other paths');

  // On phones, both panels begin collapsed to leave the canvas clear.
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.locator('#mobileSlidesToggle').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('.photoQueueSidebar').isVisible(),false);
  assert.equal(await page.locator('.sidebar').isVisible(),false);
  await page.locator('#mobileSlidesToggle').click();
  const mobile=await page.evaluate(()=>{
   const a=document.querySelector('.photoQueueSidebar').getBoundingClientRect();
   const w=document.querySelector('.workspace').getBoundingClientRect();
   const p=document.querySelector('.photoQueuePinned').getBoundingClientRect();
   const g=document.querySelector('.galleryWrap').getBoundingClientRect();
   return {rightRailBottom:a.bottom,workspaceTop:w.top,controlsBottom:p.bottom,queueTop:g.top,
    scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth};
  });
  assert.ok(mobile.rightRailBottom<=mobile.workspaceTop+3,'Expanded slide navigator must push the canvas down without covering it');
  assert.ok(mobile.queueTop>=mobile.controlsBottom-3,'Mobile controls precede thumbnails');
  assert.ok(mobile.scrollWidth<=mobile.viewport+3,'Mobile layout must not overflow horizontally');
  await page.locator('#mobileSlidesToggle').click();
  assert.equal(await page.locator('.photoQueueSidebar').isVisible(),false);

  // Named project is persisted before a deliberate in-app reload.
  await page.locator('#reloadStudio').click();
  await page.locator('#reloadStudioSave').click();
  await page.locator('#actionModal[open]').waitFor();
  await page.locator('#actionModalInput').fill('Reload QA persisted project');
  await page.locator('#actionModalConfirm').click();
  await page.locator('#startupChoiceDialog[open]').waitFor({timeout:12000});
  await page.locator('#retrieveStartupProject').click();
  await page.locator('#savedProjectsDialog[open]').waitFor();
  const list=await page.evaluate(()=>projectList());
  assert.equal(list.length,1,'Save & Reload persisted a project');
  assert.equal(list[0].name,'Reload QA persisted project');
  assert.deepEqual(errors,[],'No runtime errors');
  console.log('PASS: desktop right rail and sticky controls, mobile stacking, photo selection, reload modal, named save and browser guard');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
