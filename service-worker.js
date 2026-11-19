/* PTG-gated MegaFrame: the installed app must not serve cached private UI
 * after PTG entitlement expiry or account revocation.
 * Previous shell caches are removed; existing local drafts/IndexedDB are NOT deleted.
 * This necessarily disables offline editing on the protected origin. */
const VERSION="mf-pwa-v16-ptg-access-network-only";
self.addEventListener("install",event=>{
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    for(const name of await caches.keys()){
      if(name.startsWith("megaframe-shell-")) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
// Intentionally no fetch handler. Every request reaches the protected Vercel
// routing layer for a fresh PTG entitlement check.
