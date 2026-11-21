const { chromium } = require('playwright');
const assert = require('node:assert/strict');

// Emoji privacy covers must be local to each photo, editable, and baked into
// finished images, while local draft recovery and Undo remain lossless.
(async () => {
 const browser = await chromium.launch({headless:true});
 const page = await browser.newPage({viewport:{width:1450,height:960}});
 const problems=[];page.on('pageerror',e=>problems.push(e.message));
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9J6ofLwAAAABJRU5ErkJggg==','base64');
 try {
  await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.getElementById('draftStatus')?.textContent?.includes('Auto-save ready'));
  await page.locator('#createNewProject').click();
  assert.equal(await page.locator('#addEmojiCover').isDisabled(),true,'Emoji button disabled with no photo');
  await page.locator('[data-panel="1"]').click();
  await page.locator('#shapePreset').selectOption('rect');
  await page.locator('#photosInput').setInputFiles({name:'customer.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>document.querySelector('#photoCount')?.textContent?.includes('1 photo'));
  assert.equal(await page.locator('#addEmojiCover').isDisabled(),false);
  let initial=await page.evaluate(()=>({source:app.photos[0].data,covers:app.photos[0].covers||[]}));
  assert.equal(initial.covers.length,0,'Covers are opt-in');
  await page.locator('#addEmojiCover').click();
  await page.locator('#emojiPickerDialog[open]').waitFor();
  assert.equal(await page.evaluate(()=>EMOJI_LIBRARY.length>250),true,'Expanded offline emoji list');
  assert.equal(await page.locator('#emojiPickerGrid button').count()>65,true,'Default faces category');
  await page.locator('#emojiPickerSearch').fill('monkey hide');
  assert.equal(await page.locator('#emojiPickerGrid button').count(),1,'Emoji search narrows choices');
  await page.locator('#emojiPickerGrid button').first().click();
  assert.equal(await page.evaluate(()=>app.photos[0].covers.length),1);
  await page.locator('#emojiCoverSize').evaluate(el=>{el.value='41';el.dispatchEvent(new Event('input',{bubbles:true}));});
  let sticker=await page.evaluate(()=>app.photos[0].covers[0]);
  assert.equal(sticker.symbol,'🙈');
  assert.equal(sticker.size,.41);
  assert.equal(await page.evaluate(()=>app.photos[0].data),initial.source,'Original upload untouched');
  const loc=await page.evaluate(()=>{
   const cell=layoutCells(1,app.collage.layout,app.rect,app.collage.gap)[0];
   const pos=coverGeometry(app.photos[0].covers[0],cell),rect=document.getElementById('previewCanvas').getBoundingClientRect();
   return {x:rect.left+pos.x*rect.width/app.frame.width,y:rect.top+pos.y*rect.height/app.frame.height};
  });
  await page.mouse.move(loc.x,loc.y);await page.mouse.down();await page.mouse.move(loc.x+26,loc.y+18,{steps:5});await page.mouse.up();
  const moved=await page.evaluate(()=>app.photos[0].covers[0]);
  assert.ok(Math.abs(moved.x-sticker.x)>.01||Math.abs(moved.y-sticker.y)>.01,'Cover can be dragged');
  const images=await page.evaluate(async()=>{
   const raw=await makeOutput(0,true),edited=await makeOutput(0,false);
   const a=new Uint8Array(await raw.arrayBuffer()),b=new Uint8Array(await edited.arrayBuffer());
   return {different:a.length!==b.length||a.some((n,i)=>n!==b[i]),rawBytes:a.length,editedBytes:b.length};
  });
  assert.ok(images.different&&images.rawBytes>100&&images.editedBytes>100,'Saved image must contain emoji pixels');
  assert.ok(!await page.evaluate(()=>drawFaceCovers.toString().includes('#ffdb91')),'No opaque yellow backing circle');
  await page.locator('[data-panel="4"]').click();
  await page.locator('#removeEmojiCover').click();
  assert.equal(await page.evaluate(()=>app.photos[0].covers.length),0);
  await page.keyboard.press('Control+z');
  assert.equal(await page.evaluate(()=>app.photos[0].covers.length),1,'Undo restores removed emoji');
  await page.locator('[data-panel="0"]').click();
  await page.locator('#saveDraftNow').click();
  await page.waitForFunction(()=>document.getElementById('draftStatus')?.textContent?.includes('Draft saved'),{timeout:35000});
  page.once('dialog',dialog=>dialog.accept()); // Approve the native unsaved-work close warning.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#startupChoiceDialog[open]').waitFor();
  await page.locator('#retrieveStartupProject').click();
  await page.locator('#savedProjectsDialog[open]').waitFor({timeout:45000});
  await page.locator('#restoreRecoveryDraft').click();
  await page.waitForFunction(()=>app.photos?.length===1&&app.photos[0].covers?.length===1,{timeout:30000});
  const restored=await page.evaluate(()=>app.photos[0].covers[0]);
  assert.equal(restored.symbol,'🙈','Emoji is restored from local draft');
  assert.equal(restored.size,.41,'Emoji size restored');
  await page.locator('#addEmojiCover').click();
  await page.locator('#emojiPickerSearch').fill('sunglasses');
  await page.locator('#emojiPickerGrid button').first().click();
  assert.equal(await page.evaluate(()=>app.photos[0].covers.length),2,'Multiple faces can be covered');
  assert.deepEqual(problems,[],'Unexpected browser errors');
  console.log('PASS: emoji add, position, size, JPG export, remove, undo and local draft recovery.');
 }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exitCode=1});