// Verify the app at a project subpath, including offline reload and PWA scope.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
 const browser = await chromium.launch({headless:true});
 const context = await browser.newContext({viewport:{width:1350,height:900}});
 const page = await context.newPage();
 const errors = [];
 page.on('pageerror',err => errors.push(err.message));
 const base = 'http://127.0.0.1:4173/megaframe-studio/';
 try {
  const response=await page.goto(base,{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>document.querySelector('#draftStatus')?.textContent?.includes('Auto-save ready'),{timeout:45000});
  await page.locator('#createNewProject').click();
  assert.match(await page.title(),/MegaFrame Studio v2\.7/);
  const paths=await page.evaluate(async()=>{
   const manifestNode=document.querySelector('link[rel="manifest"]');
   const manifestUrl=new URL(manifestNode.getAttribute('href'),location.href);
   const response=await fetch(manifestUrl);
   const manifest=await response.json();
   const icon=document.querySelector('link[rel="icon"]');
   const logo=document.querySelector('img.logo');
   return {
    manifestUrl:manifestUrl.pathname,
    manifestStatus:response.status,
    manifest,
    icon:new URL(icon.getAttribute('href'),location.href).pathname,
    logo:logo.src,
    logoLoaded:logo.complete && logo.naturalWidth>0,
    sharedLibraryAvailable:!!document.getElementById('mf-show-private') &&
     !!document.getElementById('mf-show-members')
   };
  });
  assert.equal(paths.manifestUrl,'/megaframe-studio/manifest.webmanifest');
  assert.equal(paths.manifestStatus,200);
  assert.equal(paths.manifest.start_url,'./');
  assert.equal(paths.manifest.scope,'./');
  assert.equal(paths.manifest.id,'./');
  assert.equal(paths.icon,'/megaframe-studio/icons/icon-192.png');
  assert.equal(paths.logoLoaded,true);
  assert.equal(paths.sharedLibraryAvailable,true);

  await page.waitForFunction(()=>navigator.serviceWorker.controller?.scriptURL.endsWith('/megaframe-studio/service-worker.js'),{timeout:45000});
  const sw=await page.evaluate(async()=>{
    const reg=await navigator.serviceWorker.ready;
    const cachesList=await caches.keys();
    const shellName=cachesList.find(x=>x.startsWith('megaframe-shell-'));
    const cache=shellName?await caches.open(shellName):null;
    const keys=cache?await cache.keys():[];
    return {
      scope:reg.scope,
      sw:reg.active?.scriptURL,
      cached:keys.map(x=>new URL(x.url).pathname)
    };
  });
  assert.ok(sw.scope.endsWith('/megaframe-studio/'),'Worker scope must remain under the repo subpath');
  assert.ok(sw.sw.endsWith('/megaframe-studio/service-worker.js'));
  for(const pathname of [
    '/megaframe-studio/','/megaframe-studio/manifest.webmanifest',
    '/megaframe-studio/editor.js','/megaframe-studio/shared.js',
    '/megaframe-studio/icons/icon-192.png'
  ])assert.ok(sw.cached.includes(pathname),'Missing offline resource '+pathname);

  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#draftStatus')?.textContent?.includes('Auto-save ready'),{timeout:45000});
  await page.locator('#createNewProject').click();
  assert.match(await page.locator('#pwa-status').textContent(),/Offline/i);
  assert.deepEqual(errors,[],'Uncaught browser errors: '+errors.join(' | '));
  console.log('PASS: GitHub Pages project base path, logo, cloud controls, PWA manifest/scope and offline reload.');
 } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1});
