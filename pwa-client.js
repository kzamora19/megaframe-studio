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
    let instructions;
    if (/iphone|ipad|ipod/i.test(ua))
      instructions = 'Open this website in Safari, tap Share, then Add to Home Screen.';
    else if (/android/i.test(ua))
      instructions = 'Open the browser menu and choose Install app or Add to Home screen.';
    else
      instructions = 'In Chrome or Edge, use the browser menu to choose Install MegaFrame Studio, or Create shortcut and Open as window.';
    if (typeof window.megaFrameShowInfoModal === 'function')
      window.megaFrameShowInfoModal('Install MegaFrame Studio', instructions);
    else if (status) status.textContent = instructions; // no native alert fallback
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

  const secureOrigin = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
  if (!('serviceWorker' in navigator) || !secureOrigin) return;
  window.addEventListener('load', () => {
    let registration = null;
    let updateApproved = false;
    let reloading = false;
    let hadController = !!navigator.serviceWorker.controller;
    const banner = document.getElementById('pwa-update');
    const button = document.getElementById('pwa-update-reload');

    function showUpdateBanner() {
      if (!banner || !button) return;
      banner.hidden = false;
      button.onclick = () => {
        if (typeof window.megaFrameOpenReloadModal === 'function')
          window.megaFrameOpenReloadModal('update');
        else if (typeof window.megaFrameShowInfoModal === 'function')
          window.megaFrameShowInfoModal('App update ready',
            'Save your project before restarting the application.');
      };
    }
    function reloadApproved() {
      if (reloading) return;
      reloading = true;
      if (typeof window.megaFrameReloadApproved === 'function')
        window.megaFrameReloadApproved();
      else window.location.reload();
    }
    // The confirmation and optional named save live in editor.js. Do not
    // SKIP_WAITING or reload until the user confirms that dialog.
    window.megaFrameApplyUpdate = () => {
      updateApproved = true;
      if (registration?.waiting) {
        registration.waiting.postMessage({type:'SKIP_WAITING'});
      } else {
        reloadApproved(); // already activated in another tab
      }
    };
    navigator.serviceWorker.register('./service-worker.js', {scope:'./'})
      .then(reg => {
        registration = reg;
        const notifyUpdate = () => {
          if (!navigator.serviceWorker.controller || !reg.waiting) return;
          showUpdateBanner();
        };
        if (reg.waiting) notifyUpdate();
        reg.addEventListener('updatefound', () => {
          reg.installing?.addEventListener('statechange', notifyUpdate);
        });
      }).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // First install: claim control without interrupting imports or edits.
      if (!hadController) {hadController = true;return;}
      if (updateApproved) reloadApproved();
      else showUpdateBanner(); // other tabs may activate updates; do not force reload
    });
  });
})();
