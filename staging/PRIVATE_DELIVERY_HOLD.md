# MegaFrame Studio PTG-gated private delivery — staging only

**DO NOT DEPLOY OR MERGE INTO PUBLIC PAGES.** This branch contains only source/public bundling proof, not a functioning authorized app.

## Reason for a new route
Existing draft PR #16 protects requests with a Vercel proxy, conflicting with the approved GitHub Pages + Supabase architecture. GitHub Pages cannot authenticate requests to HTML, JavaScript or offline editor files. The PTG Creative Studios gate must authorize loading protected editor assets, not just hide navigation.

## Staged proof
- staging/build-private-package.mjs creates private/studio.html, a tiny public/index.html and an integrity manifest in a **separate output folder**.
- The private package inlines editor scripts and local icons; no output is pushed to Pages. A future restricted Supabase Storage bucket would hold the immutable hash-verified bundle.
- The public entry contains no editor source; only a PTG Creative Studios sign-in link.
- Existing main workflow scripts/build_pages_site.py remains unchanged and still serves the current public editor. No existing sessions or saved frames are altered.

## Required next steps before any release
1. Implement MegaFrame Supabase Edge private delivery with exact-origin CORS plus server-side ticket verification via PTG #38. Verify ticket entitlement for MegaFrame on every load/check, immutable path/hash and no direct Storage read policy.
2. Make protected editor run in a properly isolated browser origin; the current CSP script-src self disallows bundled inline scripts and must be re-designed, not disabled casually. Google Identity and OAuth, cloud library, relative images and storage origin also need testing.
3. Real-login acceptance: eligible TL/Admin allowed; ordinary user, disabled/revoked/branch-off and expired/forged/wrong-studio ticket denied. Check direct editor URL, asset, PWA cache bypasses.
4. Validate photo/frame editing, PDF/PNG export, cloud templates, Google Drive backups, and local draft restoration. A ten-minute ticket may expire mid-edit: add safe renewal/re-entry.
5. Coordinate actual cutover with PTG + Branchline + MegaFlyer so old Pages editor bytes are no longer directly published. Historical installed offline copies cannot be retroactively erased.
6. No secret or refresh token exposed to GitHub Pages or scripts. All applications under kzamora19.github.io share an origin, so URL path separation does not protect localStorage.
7. Obtain separate, explicit production release approval after staging and real-account security checks.

**Current work is not an authentication solution or a functioning protected MegaFrame.**

## November 21 — actual sandbox-browser acceptance finding
- Staging Chrome tests confirmed that a forged/mismatched private-bundle digest is denied; a valid mock PTG ticket loads the actual editor into an opaque-origin sandbox; the photo upload and full PNG download work; and a simulated session revocation removes the frame.
- The 8MB+ source is inlined with exact SHA-256 Content Security Policy script hashes; source and secret files remain out of the live GitHub Pages publication.
- **BLOCKER: photo draft auto-save does NOT work inside the sandbox.** The current editor's IndexedDB is unavailable from this opaque origin, reporting: `Draft not saved (storage unavailable or full)`. A release cannot silently discard customer edits. The staged browser test now hard-fails when a draft cannot be recovered.
- Any secure persistence solution must preserve local-only customer-photo privacy, use an origin-separated authenticated storage bridge or another reviewed isolated design, and verify resume after ticket expiry/forced logout on real accounts. Enabling `allow-same-origin` on the shared github.io origin is NOT an acceptable shortcut.
- Other outstanding checks: Supabase cloud template Auth, optional Google Drive backup, mobile/touch/PWA behavior, input image quality, actual Edge Function performance with the 8MB+ JSON response, and server-side session renewal/replay limits.

**Current live MegaFrame remains on GitHub Pages + Supabase, unchanged; this is a deliberately failing release gate.**
