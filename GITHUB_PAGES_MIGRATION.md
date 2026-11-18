# MegaFrame Studio: GitHub Pages + Supabase hosting

## Hosting

Production target: **https://kzamora19.github.io/megaframe-studio/**

- **GitHub Pages:** serves the static HTML/JS editor, artwork, manifest and installable PWA assets.
- **Supabase:** continues to provide published templates, private templates, Supabase Auth and Administrator/Editor/Viewer authorization. No database migration or new Supabase project is needed.
- **GitHub Actions:** tests on pull requests; verified changes merged to `main` publish via `.github/workflows/pages.yml`.
- **Old Vercel app:** https://megaframe-studio.vercel.app remains unchanged and available as an independent fallback until the user decides to retire it.

## First-time GitHub Pages setup

The publishing workflow uses `actions/configure-pages@v5` with `enablement: true`. This *attempts* to enable GitHub Pages automatically. If GitHub rejects provisioning or permissions, a repository administrator should visit:

1. https://github.com/kzamora19/megaframe-studio/settings/pages
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Re-run **Build, verify and publish MegaFrame to GitHub Pages** from the repository's Actions tab, or push another reviewed commit to `main`.

Do not use the entire repository as the web artifact. The build script `scripts/build_pages_site.py` stages only required public application assets; it excludes `db/`, `qa/`, `.github/`, and other source/development material.

## Installed app and storage migration warning

**Browser storage is scoped by origin.** Moving from `megaframe-studio.vercel.app` to `kzamora19.github.io` creates a new origin.

- Supabase **published** frames remain available on both URLs, live when online.
- Supabase **private cloud** templates remain accessible after logging in with the same approved account.
- Local-only saved frames, favorites and unfinished draft photos **do not automatically transfer** to the new site.
- **Do not uninstall the old installed app or delete its local data** before copying/backing up important unfinished work. You may continue opening the Vercel URL to retrieve your local-only work.
- If you need a frame accessible on the new origin, save only approved frame artwork to **My private cloud** (not customer photos), then open it on the new site after signing in.
- Reinstall the PWA from the new GitHub Pages URL only after verifying the needed work is accessible. The old desktop icon links to the old origin.

## Relative base paths

The app uses relative icon, manifest, startup and service-worker paths. Its manifest's `scope`, `start_url` and `id` are `./`. The offline shell is resolved using the worker script location, not hard-coded to `/`.

This means the same source works at both `/` (Vercel) and `/megaframe-studio/` (GitHub Pages). The service worker only caches same-origin app-shell assets, not external Supabase responses, authentication or uploaded photos.

## Security limitations on GitHub Pages

Vercel supports custom HTTP headers such as Content-Security-Policy, X-Frame-Options and Permissions-Policy. GitHub Pages does **not** let this repository configure equivalent response headers. The new HTML meta tag enforces a compatible CSP (for supported directives), and a no-referrer policy, but a CSP meta tag cannot provide equivalent `frame-ancestors` protection. Evaluate this trade-off before using the public Pages URL for highly sensitive workflows. This photo editor keeps customer images local.

## Verification

1. GitHub Actions must pass existing v2.1/v2.2/v2.5/v2.6 browser regression tests.
2. The Pages-specific browser test `qa/smoke-pages.cjs` checks subpath links, the blue-M logo, PWA manifest and scope, shell cache, and an offline reload.
3. Confirm the GitHub Pages deployment action completes, then open the actual URL; do not assume a successful build alone means Pages is live.
4. Test Supabase login, shared frames and owner-private templates with approved accounts on the new origin. Real account credentials are not stored in CI.
