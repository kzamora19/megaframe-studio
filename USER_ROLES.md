# MegaFrame Studio v2.6 — User management and access roles

## Roles

| Role | Use editor locally | Browse published | Save/open own private templates | Publish/update/delete shared templates | Manage approved accounts |
|---|---|---|---|---|---|
| Administrator | Yes | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | Yes | Yes | No |
| Viewer | Yes | Yes | Open own only (read-only) | No | No |
| Staff (legacy) | Yes | Yes | Yes | No | No |
| Visitor (not signed in) | Yes | Yes | No | No | No |

**Local photo editing remains freely available to visitors.** Membership roles control publishing, private cloud writes, and user management, not the basic photo editor.

## Add an approved app user

1. An authorized Supabase project administrator must first create a login for the intended person in **Supabase Dashboard → Authentication → Users**. Creating the Supabase Auth identity is a server-side administration operation, not something the public MegaFrame browser performs.
2. Open MegaFrame Studio → **Shared templates**. Sign in with the existing Administrator account.
3. Select **User management**. Enter the exact email of an existing Supabase Authentication user and choose **Administrator**, **Editor**, or **Viewer**.
4. Choose **Assign role**. The user can sign in to MegaFrame Studio using the same email and existing Supabase password.
5. To remove app authorization, use **Remove access**. This does not delete the Supabase Authentication identity or any template data.

Admins cannot change or remove their own admin membership via the app, protecting against an accidental self-lockout. A former member is denied at subsequent authorization checks; their own devices may retain independent local-only templates and editing sessions.

## Security model

- `megaframe_members` RLS continues to allow signed-in users to read only their own role.
- Server-authorized role management uses `public.megaframe_list_members()` and `public.megaframe_manage_member()` invoker RPC functions. They call privileged, admin-checking functions in the non-Data-API-exposed `megaframe_internal` schema. Anonymous and public execution of the RPC functions is revoked.
- Editors can maintain published templates using their own Supabase JWT and editor RLS policies. Viewers cannot publish or mutate templates.
- Private template rows remain owner-scoped via RLS. Neither the user directory nor private template records are added to the public offline cache. Only published frame artwork is publicly cached.
- The existing `staff` role remains available for backward compatibility without being promoted to the Editor role.
- No service-role key, administrator token or password is placed in browser source code. The browser uses the existing Supabase publishable key.
- Current browser sign-in sessions are in memory only; refreshing/reopening the app requires sign-in again.

## Limitations

This release manages membership **for existing Supabase Authentication accounts**. It does not directly create authentication users, send invitation emails, reset passwords, delete authentication identities or force-revoke all active Supabase refresh/access tokens. Use the Supabase administrator dashboard for those account operations, with appropriate caution. Actual multi-account sign-in should be confirmed on devices with real authorized users.

## Source and verification

- `db/v26_roles_and_members.sql` introduces expanded role checks, editor/viewer RLS, and checked membership RPC.
- `db/v26_harden_member_rpc.sql` moves privileged procedures out of the public API schema.
- SQL role simulation verified existing administrator directory visibility, Editor writes in rolled-back transactions and rejection of Viewer directory access.
- Browser smoke tests include administrator role assignment UI, Editor publishing controls, Viewer read-only controls and prior editing/mobile regression checks.
- No existing template rows or membership records were removed or edited permanently during validation.
