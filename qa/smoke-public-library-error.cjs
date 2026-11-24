const { chromium } = require('playwright');
const assert = require('node:assert/strict');

// Regression: a failed public read must show a retryable error, not spin forever.
// Once public grants are restored, refreshing must clear the error and show frames.
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  let allowRead = false;
  const problems = [];
  page.on('pageerror', error => problems.push(error.message));
  const published = [{
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Published Sample Frame', folder: 'Unfiled', category: 'General',
    revision: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    updated_at: new Date().toISOString()
  }];
  await page.route('https://vmyoxoiygfcecgkbavgg.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    const isTemplate = url.pathname === '/rest/v1/megaframe_templates';
    const status = isTemplate && !allowRead ? 401 : 200;
    const body = isTemplate
      ? (allowRead ? published : { code: '42501', message: 'permission denied' })
      : [];
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  try {
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.locator('#createNewProject').click();
    await page.locator('[data-panel="7"]').click();
    await page.locator('#mf-open').click();
    await page.waitForFunction(() => document.querySelector('#mf-list')?.textContent?.includes('HTTP 401'));
    assert.ok(!(await page.locator('#mf-list').textContent()).includes('Loading published frames'), 'Loading must stop on 401');
    allowRead = true;
    await page.locator('#mf-refresh').click();
    await page.locator('#mf-list .frameLibCard').first().waitFor();
    assert.equal(await page.locator('#mf-list .frameLibCard').count(), 1);
    assert.ok(!(await page.locator('#mf-list').textContent()).includes('HTTP 401'), 'Retry should clear the error');
    assert.deepEqual(problems, [], 'No uncaught browser errors');
    console.log('PASS: public 401 shows error; subsequent refresh recovers and renders published frames.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
