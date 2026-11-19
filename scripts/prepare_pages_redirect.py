"""Prepare an intentional GitHub Pages redirect for the PTG-gated release.
Staged only: this script is NOT executed against live Pages until release.
"""
from pathlib import Path
import html

TARGET = "https://megaframe-studio.vercel.app/studio-access.html"
ROOT = Path("_pages_redirect")
ROOT.mkdir(parents=True,exist_ok=True)
target=html.escape(TARGET,quote=True)
page=f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<meta http-equiv="refresh" content="0;url={target}">
<title>Creative Studio access moved to PTG</title></head>
<body><main>
<h1>This studio is now restricted to PTG Team Leaders and administrators.</h1>
<p>Sign in through PTG to use the protected application.</p>
<a href="{target}" rel="noopener noreferrer">Continue to the protected studio</a>
</main></body></html>"""
(ROOT/"index.html").write_text(page,encoding="utf-8")
# Replace an old MegaFrame service worker with a cache-cleaning retirement worker.
# It clears static caches only, never local projects or IndexedDB.
(ROOT/"service-worker.js").write_text("""
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys()){
    if(key.startsWith('megaframe-shell-')) await caches.delete(key);
  }
  await self.registration.unregister();
  await self.clients.claim();
})()));
""",encoding="utf-8")
