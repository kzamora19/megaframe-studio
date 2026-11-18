# MegaFrame Studio v2.2 — Personal Cloud Templates

## What synchronizes

**My private cloud** uses the signed-in owner's Supabase account. It synchronizes only frame artwork and frame-layout settings (opening shape, border, collage setup) over HTTPS. Imported customer photos and editing drafts are never uploaded to Supabase by this feature.

**Published for everyone** remains a separate public library that only administrators can publish to.

**Local saved templates** and **unfinished editing drafts** stay on the current browser/device. They do not become private/cloud templates automatically.

## Use

1. Open **Shared templates**.
2. Select **Sign in for personal cloud**, using a MegaFrame account approved in `megaframe_members` (currently roles `admin` or `staff`).
3. Select **My private cloud**, then **Save current frame privately**.
4. On another device, sign into the *same approved account*, open **My private cloud**, and select the frame.
5. Select **Save template** to store a local copy if you need offline access.

Edits to an already saved private frame must be explicitly re-saved using **Replace with current frame**. Revisions prevent overwriting a conflicting version saved from another device.

## Security and limitations

- New `public.megaframe_private_templates` is protected with RLS and allows only the authenticated owner whose membership is `admin` or `staff` to select/insert/update/delete their own rows. Anonymous users cannot even select the table.
- Existing shared templates, member accounts and production templates are not changed by this migration.
- Private frame data is **not cached** by the service worker or the public IndexedDB cache. Offline access requires a separate local saved template.
- Importing/exporting photos and local editing continue to work without signing in.
- Account creation, self-service invitations, and administrator user-management screens are not part of v2.2. The existing approved MegaFrame logins are used; future account provisioning needs a separate security-reviewed implementation.
- Recommended: Keep Supabase leaked-password protection enabled if supported by the project's plan.

## Testing

- SQL owner session simulation: insert/update/delete of temporary private template succeeded with rollback.
- Anonymous table SELECT privilege: false.
- GitHub Actions browser smoke: app loads, local draft restore works; public and private tabs are separate; private tab requests sign-in.
- Live authenticated two-device testing still requires using an approved account on two actual devices.

Database SQL used: `db/v22_private_templates.sql`.
