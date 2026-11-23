# MegaFrame Studio PTG-gated private delivery — staging only

**DO NOT DEPLOY OR MERGE INTO PUBLIC PAGES.** This branch contains an actual mock-authorized protected editor and private packaging proof, but NO live authorization service or production changes.

## Reason for a new route
Existing draft PR #16 protects requests with a Vercel proxy, conflicting with the approved GitHub Pages + Supabase architecture. GitHub Pages cannot authenticate requests to HTML, JavaScript or offline editor files. The PTG Creative Studios gate must authorize loading protected editor assets, not just hide navigation.

## Staged proof
- staging/build-private-package.mjs creates private/studio.html, a tiny public/index.html and an integrity manifest in a **separate output folder**.
- The private package inlines editor scripts and local icons; no output is pushed to Pages. A future restricted Supabase Storage bucket would hold the immutable hash-verified bundle.
- The public entry contains no editor source; only a PTG Creative Studios sign-in link.
- Existing main workflow scripts/build_pages_site.py remains unchanged and still serves the current public editor. No existing sessions or saved frames are altered.

## Required next steps before any release
1. Validate the existing staged MegaFrame Supabase Edge private delivery on an isolated hosted staging backend against current PTG draft #40. Verify entitlement on every load/check, immutable path/hash and no direct Storage read policy.
2. Make protected editor run in a properly isolated browser origin; the current CSP script-src self disallows bundled inline scripts and must be re-designed, not disabled casually. Google Identity and OAuth, cloud library, relative images and storage origin also need testing.
3. Real-login acceptance: eligible TL/Admin allowed; ordinary user, disabled/revoked/branch-off and expired/forged/wrong-studio ticket denied. Check direct editor URL, asset, PWA cache bypasses.
4. Validate photo/frame editing, PDF/PNG export, cloud templates, Google Drive backups, and local draft restoration. A ten-minute ticket may expire mid-edit: add safe renewal/re-entry.
5. Coordinate actual cutover with PTG + Branchline + MegaFlyer so old Pages editor bytes are no longer directly published. Historical installed offline copies cannot be retroactively erased.
6. No secret or refresh token exposed to GitHub Pages or scripts. All applications under kzamora19.github.io share an origin, so URL path separation does not protect localStorage.
7. Obtain separate, explicit production release approval after staging and real-account security checks.

**Mock-protected editor and encrypted project storage work in development; actual live PTG authorization and hosted delivery remain unverified.**

## November 21 — actual sandbox-browser acceptance finding
- Staging Chrome tests confirmed that a forged/mismatched private-bundle digest is denied; a valid mock PTG ticket loads the actual editor into an opaque-origin sandbox; the photo upload and full PNG download work; and a simulated session revocation removes the frame.
- The 8MB+ source is inlined with exact SHA-256 Content Security Policy script hashes; source and secret files remain out of the live GitHub Pages publication.
- **Historical finding (fixed in the staged browser proof):** the original opaque-origin editor had no IndexedDB. The new per-account encrypted parent vault and limited MessagePort draft bridge now support save and restore across relaunches without giving the sandbox access to parent storage.
- Any secure persistence solution must preserve local-only customer-photo privacy, use an origin-separated authenticated storage bridge or another reviewed isolated design, and verify resume after ticket expiry/forced logout on real accounts. Enabling `allow-same-origin` on the shared github.io origin is NOT an acceptable shortcut.
- Other outstanding checks: Supabase cloud template Auth, optional Google Drive backup, mobile/touch/PWA behavior, input image quality, actual Edge Function performance with the 8MB+ JSON response, and server-side session renewal/replay limits.

## November 21 — encrypted draft recovery and PTG signed proof integration
- The private editor's draft read/write/delete operations now use a limited MessagePort to an **AES-256-GCM encrypted IndexedDB vault in the launcher**. No draft/photos are sent over the network. The sandbox still omits allow-same-origin.
- Each vault record is keyed to a stable, server-derived PTG account scope and protected with a distinct per-account recovery key. The non-extractable key stays in the launcher's memory; scope/key are never stored in IndexedDB. Authentication must be live before the Edge function supplies these values.
- PTG draft #40 derives deterministic studio/account-scoped HMAC recovery material only on a **one-time consumed exchange** with a non-extractable browser P-256 public key. The MegaFrame private Edge prototype now forwards signed continuation challenges to PTG and rejects replayed bearer checks.
- GitHub Actions mock-browser run 44868201343 passed: editor load, photo upload, PNG export, encrypted save, same-account restore, different-account isolation, bad hash denial, and revoked-session lock. TypeScript Edge validation and packaging checks passed. This is mocked authorization, not live PTG acceptance.
- The draft still requires actual PTG/Studio deployments to isolated test resources, cross-origin security review for shared github.io, proof-session renewal, Supabase cloud template Auth, Google Drive backup, mobile/PWA compatibility, lossless recovery after abrupt offline closure, Edge transfer/load testing for 8MB+ bundles and complete real-role/forced-logout verification.
- Key rotation must be planned: changing PTG_STUDIO_DRAFT_RECOVERY_SECRET without decrypt/re-encrypt migration would make existing encrypted local drafts unreadable.
- **Production remains unchanged.** Do not merge or deploy until real end-to-end, privacy, direct-URL/PWA-cache and atomic cutover checks pass.



## November 21 — synchronize new live project library and privacy bridge (current)
- Latest production MegaFrame main commit `1bcf361241a190b676f4ce17c5ba3086b3c5548d` (searchable categorized emoji picker, named Save Project/Open Projects, backup/import) was incorporated as a two-parent merge into this **development-only** branch.
- The original named-project IndexedDB would not work inside a sandbox without `allow-same-origin`, and must not save plaintext customer photos on the shared GitHub Pages origin. The private package builder now replaces all four named-project storage functions with the same narrow parent `MessagePort` vault used by automatic drafts.
- The launcher AES-256-GCM vault now keeps each saved project as a separate ciphertext record keyed by the authenticated PTG-account scope. The record's name and original customer-photo payload are encrypted, with per-record authenticated associated data. The existing encrypted rolling draft remains readable without a database version change.
- Chromium regression verifies emoji search/picker, the real Save Project/Open Projects UI, same-account project restoration after revoked/new PTG launch, different-account project denial, and ciphertext-only IndexedDB records.
- **[Passing private package + Chromium browser CI](https://github.com/kzamora19/megaframe-studio/actions/runs/44876506308)**, staging commit `83de09d611cf047230bc08ffcaa845fb77a195a6`. This is mocked PTG/cloud authorization; it does NOT prove real Google Drive backups, cloud templates, separate-device synchronization, account revocation against deployed Edge services, or PWA/old-source cutover.
- Downloaded MegaFrame project JSON backup files intentionally contain the original customer photos **in plaintext**; users must keep those exports private. Automatic cross-device upload is not enabled.
- PTG #40 additionally passed local real Supabase Auth/PostgREST, PostgreSQL concurrency, and per-account atomic launch rate limiting. Do not confuse those PTG-local results with a deployed MegaFrame integration. **NO merge or production deployment approved.**


## November 21 — v2.7 startup choice, Save-before-New, and encrypted recovery reconciliation

After the live standalone MegaFrame app gained a mandatory startup choice and **New Project** save-first behavior, the private PTG integration branch was synchronized to the current `main` HTML, `editor.js`, service worker, and QA scripts. Branchline navy branding remains in the private editor; no live app was overwritten.

- On every protected launch, users must explicitly choose **Create New Project** or **Retrieve Saved Project**. A fresh new project starts blank, with no preselected template or photo opening.
- The private builder replaces only plaintext IndexedDB-backed draft/named-project CRUD. It now **preserves** the live `recoveryArchiveId` and `deleteLinkedRecovery` helpers. Omitting those functions had prevented initialization of the v2.7 chooser.
- The PTG-scoped AES-GCM vault now accepts both tightly validated `project_...` IDs and deterministic `recovery_<savedAt>` archive IDs, with all ciphertext names/photos still isolated under each account scope.
- Native `<dialog>` controls for startup, saved projects and emoji picker are permitted inside the sandbox using `allow-modals`, but **`allow-same-origin` remains forbidden**.
- The protected browser test now selects an actual frame after blank startup before exercising photo/emoji controls. It separately checks named Save, then an additional unsaved edit and recovery after revocation; a named Save legitimately clears the older automatic recovery copy.
- The standalone MegaFrame runtime retains its own tested behavior; these changes are still **draft only**, not production-approved.

Remaining mandatory release gates: complete private browser CI, actual hosted PTG and account revocation, cross-device and Drive/cloud behavior, protected printing, real project migration, PWA/cache cutover and rollback, and full four-app integration. No new Supabase project, account, hosting provider or costs were created.
