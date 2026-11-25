const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
 const browser = await chromium.launch({ headless: true });
 const errors = [];
 try {
  const page = await browser.newPage({ viewport: { width: 1450, height: 1000 }, acceptDownloads: true });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#draftStatus')?.textContent?.includes('Auto-save ready'));
  await page.locator('#createNewProject').click();

  const makeArtwork = async (nativeOpening) => {
   const data = await page.evaluate(hasAlpha => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#173bdf';
    ctx.fillRect(0, 0, 400, 400);
    if (hasAlpha) {
     ctx.clearRect(40, 80, 320, 240);
     // Foreground ribbon sits INSIDE the transparent opening.
     ctx.fillStyle = '#ed1313';
     ctx.fillRect(100, 170, 200, 12);
    } else {
     ctx.fillStyle = '#ed1313';
     ctx.fillRect(40, 80, 320, 240);
    }
    return canvas.toDataURL('image/png').split(',')[1];
   }, nativeOpening);
   return Buffer.from(data, 'base64');
  };
  const greenPhoto = await page.evaluate(() => {
   const canvas = document.createElement('canvas');
   canvas.width = canvas.height = 400;
   const ctx = canvas.getContext('2d');
   ctx.fillStyle = '#08bf32';
   ctx.fillRect(0, 0, 400, 400);
   return canvas.toDataURL('image/png').split(',')[1];
  });

  await page.locator('#templateInput').setInputFiles({
   name: 'flat-frame.png', mimeType: 'image/png', buffer: await makeArtwork(false)
  });
  await page.waitForFunction(() => app.template?.name === 'flat-frame');
  await page.locator('#saveTemplate').click();
  assert.match(await page.locator('#toast').textContent(), /photo-opening shape/i,
   'Saving a new template without a photo opening must be rejected.');

  await page.locator('[data-panel="1"]').click();
  await page.locator('#shapePreset').selectOption('rect');
  await page.waitForTimeout(100);

  const pixel = async (x, y) => page.evaluate(({ x, y }) => {
   const ctx = document.querySelector('#previewCanvas').getContext('2d');
   return Array.from(ctx.getImageData(x, y, 1, 1).data);
  }, { x, y });
  assert.equal((await pixel(200, 200))[3], 0,
   'Without a photo, even opaque source artwork has a fully transparent window.');
  assert.equal((await pixel(10, 10))[3], 255,
   'Artwork outside the photo opening remains fully opaque.');

  await page.locator('#photosInput').setInputFiles({
   name: 'green.png', mimeType: 'image/png', buffer: Buffer.from(greenPhoto, 'base64')
  });
  await page.waitForFunction(() => app.photos.length === 1);
  await page.waitForTimeout(100);
  const green = await pixel(200, 200);
  assert.ok(green[1] > green[0] + 60 && green[1] > green[2] + 60,
   'The imported photo must be visible through the cutout.');
  const outside = await pixel(10, 10);
  assert.ok(outside[2] > outside[0] + 60,
   'The source frame remains in front outside the photo window.');

  await page.locator('[data-panel="0"]').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#downloadTransparentFrame').click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /Transparent_Frame\.png$/);

  await page.locator('#templateInput').setInputFiles({
   name: 'transparent-frame.png', mimeType: 'image/png', buffer: await makeArtwork(true)
  });
  await page.waitForFunction(() => app.template?.name === 'transparent-frame');
  await page.locator('[data-panel="1"]').click();
  await page.locator('#shapePreset').selectOption('rect');
  await page.waitForTimeout(100);
  const ribbon = await pixel(200, 175);
  assert.ok(ribbon[0] > ribbon[1] + 80,
   'An existing transparent PNG must retain its foreground ribbon in the photo opening.');
  const photoUnderRibbon = await pixel(200, 220);
  assert.ok(photoUnderRibbon[1] > photoUnderRibbon[0] + 60,
   'The imported photo must remain beneath the native transparent foreground layer.');
  assert.deepEqual(errors, [], 'Unexpected browser exceptions: ' + errors.join('; '));
  console.log('PASS: transparent photo slots, foreground art protection, alpha PNG export and shape-required save.');
 } finally {
  await browser.close();
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
