# Optional Google Drive backups for MegaFrame Studio

MegaFrame Studio continues to use **GitHub Pages** for hosting and **Supabase** for published/private templates, approved user accounts, and Administrator/Editor/Viewer permissions.

Google Drive is an **additional, opt-in** backup option. Drive sign-in does not grant administrator access to Supabase. It does not replace or migrate existing Supabase templates.

## One-time Google OAuth setup (app owner)

1. Open [Google Cloud Console](https://console.cloud.google.com/), create or select a Google Cloud project.
2. Enable **Google Drive API** in APIs & Services → Library.
3. Configure the OAuth consent screen (Google Auth Platform → Branding/Audience/Data Access). Add the scope `https://www.googleapis.com/auth/drive.file`, which is limited to files the app creates or opens. If the app is in Testing, add your Google account to the allowed test users. Users outside the testing list may not be able to connect until you publish and meet Google's verification requirements.
4. Under **Clients/Credentials**, create an OAuth 2.0 Client ID of type **Web application**. Add **Authorized JavaScript origins**: `https://kzamora19.github.io` (scheme + hostname only; no `/megaframe-studio/` path).
5. Copy the **Client ID** (format `123456789-xyz.apps.googleusercontent.com`). Do not copy or publish a client **secret**. A browser app must never contain Google service-account keys or secrets.
6. For a single browser: open MegaFrame Studio → **Google Drive backup** → **Google connection settings**, paste the Client ID and choose **Save Client ID on this device**.
7. To configure all users automatically, set the same public Client ID in `google-drive-config.js` in GitHub and deploy the change through GitHub Pages. It is a public app identifier, **not** a secret.

Google Identity Services handles the authorization pop-up. Consent is required for the app's access to Google Drive. The app's short-lived Drive access token is held **only in memory**, never in localStorage, Supabase, IndexedDB, backup files, URLs, or browser caches.

## Using backups

1. Open MegaFrame Studio at `https://kzamora19.github.io/megaframe-studio/`.
2. Choose **Google Drive backup** and **Connect Google Drive**. Allow pop-ups if your browser blocks Google's consent window.
3. Choose **Back up current frame**. The default **frame-only** backup includes your frame artwork, borders, layout and opening, **not imported photos**.
4. If you explicitly check **Include imported customer photos and adjustments**, MegaFrame asks again for consent before uploading a **full project** containing those photos. Use this only with permission to store the photos on your Google Drive.
5. A folder named **MegaFrame Studio** will be created in **your own** Google Drive. Each backup is a separate JSON file. This release does not delete or overwrite existing backups.
6. Choose **Refresh backups**, then **Restore** on a saved record. Restoring a frame changes the active frame but leaves your current photo queue intact. Restoring a **full project** replaces the imported photo queue, so back up unfinished work first.
7. Choose **Disconnect** to revoke/clear the current OAuth token. Disconnecting does not delete Drive backups.

Google Drive access is distinct from **Sign in to MegaFrame Studio**, which uses the existing Supabase accounts and roles.

## Privacy and limits

- Uses the least-privilege Google Drive scope `drive.file`: create and manage files the MegaFrame app creates or is given access to, not blanket access to all existing Google Drive files.
- No auto-upload, background synchronization, or automatic photo backups. Every backup requires clicking a button; full-project photo inclusion requires a checkbox and separate confirmation.
- Files live in the user's own Drive; account storage quota and Google's Drive API limits apply.
- Each backup must be at most **24 MB** when serialized as JSON. Large projects should be backed up as frame-only files or exported separately.
- Drive backup records are in a visible `MegaFrame Studio` folder, **not hidden appDataFolder**. They're portable and can be downloaded manually, but contain base64 artwork; full projects also include original photo data.
- No encryption beyond HTTPS and encryption provided by Google Drive is added. Do not back up customer photos without appropriate permission.
- On network/OAuth failure, MegaFrame local photo editing and existing Supabase libraries still work.
- GitHub Pages service worker caches only local static application assets; it does not cache Drive API responses, access tokens or uploaded user photos.
- The Drive Client ID setting is device-local unless the owner publishes it in `google-drive-config.js`.
- Google OAuth setup is **required before real Drive sign-in works**. Browser CI uses mocked OAuth and Drive responses; it does not verify a real Google account connection.

## Developer notes

- `google-drive-config.js`: optional public client ID.
- `google-drive.js`: Google Identity Services token client and Drive v3 REST operations.
- `qa/smoke-drive.cjs`: simulated browser backup/restore and privacy verification.
- `.github/workflows/pages.yml`: runs Drive and existing editor/Supabase/mobile/browser regression tests before publishing.
- No change to the Supabase database schema or authorization policies is required.
