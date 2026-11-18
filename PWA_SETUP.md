# MegaFrame Studio — PWA and offline use

## Installation

Open https://megaframe-studio.vercel.app while online at least once.

- **Windows / Ubuntu (Chrome or Edge where available):** click **Install app** or the browser's install icon/menu. The app can run as its own window.
- **Android (Chrome):** tap **Install app** or use browser menu > **Add to Home screen / Install app**.
- **iPhone / iPad (Safari):** Share > **Add to Home Screen** > Add, with **Open as Web App** enabled if offered.

The app uses a web app manifest, 192/512 PNG icons, an Apple 180px touch icon, and a service worker. Browser support varies.

## Offline

1. Visit the site once online and allow the service worker to finish caching.
2. Disconnect from the internet (or use DevTools Network > Offline).
3. Relaunch the installed app and import a photo from the device.
4. Adjust zoom, photo enhancement, frame and collage settings; export to JPG/PNG/ZIP locally.
5. Local templates already saved in IndexedDB remain on that device. **Imported photos and editing sessions are not automatically restored after closing the app.** Export before closing.
6. The list of shared templates last fetched from Supabase is visible offline. A particular shared frame's artwork is available offline **only if opened while online previously on that device**.

## Shared templates

- The existing Supabase project is the online source of truth; published template listing refreshes when the shared-library dialog is opened and after reconnection/visibility refresh.
- Only public template metadata, settings, and artwork are stored in local IndexedDB; passwords and access tokens are never persisted by the PWA.
- Administrative publishing, renaming, replacing, and deleting require an online connection.
- Offline shared-template copies can be stale until the next successful online synchronization.
- Uploaded customer photos, private editing state and exports are never sent to Supabase by the PWA.
- Supabase table permissions and live data operations **must still be verified on the MegaFrame Supabase project**; that database is not accessible through the currently connected Supabase account.

## Verify before release

- Check DevTools > Application > Manifest: correct icon, display mode and installability.
- Check DevTools > Application > Service Workers: activated and controlling the page.
- Confirm service-worker.js and manifest.webmanifest return 200 and the correct content types.
- Test fresh install on Windows/Ubuntu Chrome, Android Chrome and iPhone Safari.
- Test offline *after* an online launch and first cache install (all bundled template assets cached).
- Verify that existing local photo editing/exports work offline, and that online Supabase access still works.
- Open a shared frame online, go offline, and reopen the same frame.
- Confirm the published list refreshes after a change on another device and after reconnect.
- Confirm no API responses, identity information or credentials are cached by the service worker.
- Review whether iOS storage eviction or browser private mode impacts available offline templates.

## Production release

This feature was developed on `feature/pwa-offline-templates` to avoid deploying unreviewed changes directly to `main`. Merge only after preview/testing and confirm Vercel production is healthy. Do not change the Branchline or PTG repositories.
