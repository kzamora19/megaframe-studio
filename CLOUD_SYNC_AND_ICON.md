# MegaFrame Studio — Supabase cloud sync and custom app icon

## Shared templates: current behavior

- Online published frames are served from the dedicated Supabase project `vmyoxoiygfcecgkbavgg`, table `public.megaframe_templates`.
- Opening **Shared templates** fetches the latest published list. The app also refreshes the list in the background while open (roughly every two minutes when the dialog is closed, more frequently when open), and immediately when connectivity returns.
- Previously opened published artwork and settings are cached locally in IndexedDB. Edits to the published frame on another device are refreshed online for previously cached entries on the current page.
- **Only shared templates intentionally published by an administrator synchronize.** Private device-only saved templates are not automatically uploaded. Customer photos, photo filters, and exports remain local.
- Administrator authentication is held in memory, not persisted by the offline cache. Public template GET requests always use the publishable key without a user bearer token.
- Publishing, renaming, replacing and deleting use Supabase Auth with role authorization. Those writes are not queued offline.

## Tested 18 November 2026

A read-only GitHub Actions test against the live public Data API succeeded:

| Check | Result |
| --- | --- |
| Anonymous GET `megaframe_templates` metadata | HTTP 200 |
| Published template row returned | Yes (1 checked) |
| Anonymous GET published artwork/settings | HTTP 200, expected types |
| Anonymous GET `megaframe_members` | HTTP 401 — membership data not returned |
| Admin publish/update/delete with authenticated session | Not tested: target Supabase project not connected through the available plugin |
| Actual cross-device admin publication workflow | Not tested on two physical devices |

The connected Supabase plugin currently lists unrelated PTG/Branchline projects, not the MegaFrame Studio project. A project owner needs to connect the MegaFrame Supabase organization to complete privileged RLS and write testing. **No database schema or RLS policies were changed.**

When connected, run a read-only RLS audit using the Supabase SQL Editor (never disclose SQL results containing private credentials):

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('megaframe_templates', 'megaframe_members');

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('megaframe_templates', 'megaframe_members')
order by tablename, policyname;
```

Then verify that a signed-in administrator can publish an approved frame and that a different unsigned device can browse it. Confirm staff read-only and anonymous write denial. Test an update on the first device followed by refresh on the second.

## Custom installed-app icon

The user's selected navy/cyan/gold image was used to generate the installed-app artwork, without redesigning it.

- `icons/icon-192.png` — Windows / Ubuntu / Android small icon
- `icons/icon-512.png` — desktop and Android large icon
- `icons/apple-touch-icon.png` — iPhone / iPad icon
- `icons/icon.svg` — vector wrapper displaying the selected image
- `assets/custom-icon-source.webp.base64` — compressed source artwork retained for reproducibility
- `scripts/build_icons.py` — rebuilds the three PNG assets using Pillow

To regenerate locally:

```bash
python -m pip install Pillow==11.3.0
python scripts/build_icons.py
```

The manifest and page icon URLs carry a version query. The service-worker cache version has been incremented. If an operating system keeps showing an older installed icon, uninstall and reinstall the app after the update propagates.

## Privacy and limitations

Shared artwork is public to anybody allowed to browse the published-library API; do not publish customer photos or confidential images. Offline browsing works only for frames previously cached on that device. Browser storage can be cleared or evicted, especially on mobile, so do not use the cache as the sole source of important files.

Tests were performed on GitHub Actions and Vercel preview HTTP responses; physical Windows, Ubuntu, Android and iOS install flows still need device-specific checks.
