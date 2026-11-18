/* Install controls and offline availability indicator; no third-party services. */
(() => {
  'use strict';
  const install = document.getElementById('pwa-install');
  const status = document.getElementById('pwa-status');
  let pendingPrompt = null;

  const installed = () => matchMedia('(display-mode: standalone)').matches ||
    !!window.navigator.standalone;
  const refreshStatus = () => {
    if (status) {
      status.textContent = navigator.onLine ? 'Online · local editing ready' : 'Offline · local editing ready';
      status.title = navigator.onLine
        ? 'Published templates synchronize with Supabase while connected.'
        : 'Photos and local templates work offline. Shared templates use previously cached copies.';
    }
    if (install) install.hidden = installed();
  };
  const help = () => {
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua))
      alert('To install MegaFrame Studio: open this website in Safari, tap Share, then Add to Home Screen.');
    else if (/android/i.test(ua))
      alert('To install MegaFrame Studio: open the browser menu and choose Install app or Add to Home screen.');
    else
      alert('To install MegaFrame Studio on Windows or Ubuntu: use Chrome or Edge browser menu → Install MegaFrame Studio or Create shortcut → Open as window.');
  };
  if (install) install.addEventListener('click', async () => {
    if (!pendingPrompt) return help();
    const event = pendingPrompt;
    pendingPrompt = null;
    await event.prompt();
    await event.userChoice.catch(() => null);
    refreshStatus();
  });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pendingPrompt = event;
    refreshStatus();
  });
  window.addEventListener('appinstalled', () => { pendingPrompt = null; refreshStatus(); });
  window.addEventListener('online', refreshStatus);
  window.addEventListener('offline', refreshStatus);
  refreshStatus();

  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .then(reg => {
        const notifyUpdate = () => {
          if (!navigator.serviceWorker.controller || !reg.waiting) return;
          const banner = document.getElementById('pwa-update');
          const button = document.getElementById('pwa-update-reload');
          if (!banner || !button) return;
          banner.hidden = false;
          button.onclick = () => reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
        };
        if (reg.waiting) notifyUpdate();
        reg.addEventListener('updatefound', () => {
          reg.installing?.addEventListener('statechange', notifyUpdate);
        });
      }).catch(() => {});
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!reloading) { reloading = true; location.reload(); }
    });
  });
})();
