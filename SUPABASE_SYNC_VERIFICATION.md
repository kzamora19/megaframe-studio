# MegaFrame Studio: Supabase template synchronization

## Current architecture (November 18, 2026)

- **Cloud project:** `vmyoxoiygfcecgkbavgg` (MegaFrame Studio).
- **Cloud tables expected by the existing frontend:** `public.megaframe_templates` and `public.megaframe_members`.
- **Published/shared templates:** Supabase is authoritative while online. The Shared Templates dialog refreshes on open, manual Refresh, online reconnection, when the app becomes visible and periodically while open.
- **Offline:** IndexedDB retains lists last fetched and artwork of shared frames previously opened on that particular device. On reconnect, newer revisions of already cached frames are fetched and cached again.
- **Local saved templates:** Are intentionally device-local until an authorized administrator **publishes** a frame to the shared library. Local templates and unpublished artwork are never silently made public.
- **Customer photos, photo adjustments and exports:** Stay on the device; they are not sent to Supabase.
- **Changes to shared templates:** The administrator must be online to publish/replace/rename/delete. There is no offline write queue; this avoids a stale offline edit overwriting another device's version.
- **Concurrent edits:** The frontend sends the recorded `revision` when modifying a shared frame. The database must enforce revision checks and write authorization; the frontend cannot substitute for RLS.

## Connectivity requirement: verify the actual project

The Supabase integration currently authorized in ChatGPT has access to other projects, **not** `vmyoxoiygfcecgkbavgg`. An attempted read-only schema listing returned "You do not have permission to perform this action". No schema or policy was changed.

Sign in to the dedicated MegaFrame Supabase organization (the project was shown previously under the `kennethalvinzamora19@gmail.com` account) and either reconnect the Supabase integration under that account or inspect the database directly in the Supabase Dashboard.

The following are **read-only** queries to use in SQL Editor:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('megaframe_templates', 'megaframe_members')
order by table_name;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relname in ('megaframe_templates', 'megaframe_members');

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('megaframe_templates', 'megaframe_members')
order by tablename, policyname;
```

Check that:
1. Both tables are present, with the columns the frontend needs: shared-template `id`, `name`, `revision`, `updated_at`, `settings`, `artwork`; memberships `role`, `user_id`.
2. RLS is enabled on both tables.
3. Published frame SELECT permissions permit public viewing, but INSERT/UPDATE/DELETE require valid authenticated administrator authorization. Never trust an editable `user_metadata` field for role checks.
4. Memberships are not publicly writable.
5. The publishable key is used in the website, **not** a service-role/secret key.
6. Any revision check actually rejects stale updates at the database layer.

## End-to-end device test

1. On Device A, open the app online, open **Shared templates**, sign in with an authorized administrator account, and publish a frame (without customer photos).
2. On Device B, open the app online, select **Shared templates** and Refresh; the published frame should appear without signing in.
3. Open it once on Device B, then go offline; reopening that frame should use its locally cached artwork.
4. Back on Device A, replace the shared frame with updated artwork/settings.
5. Reconnect Device B, open Shared templates, Refresh; the revised `revision` should update the cached copy.
6. Disconnect Device B, reopen the frame and check that it matches the updated artwork.
7. Confirm a non-admin user cannot publish, replace or delete shared frames; verify this with Supabase API responses, not only hidden UI controls.

Do not claim that live cloud sync or RLS has passed until the target Supabase project is accessible and these tests are completed.
