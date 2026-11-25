# MegaFrame signed private editor release — production operation

## Status and security boundary
The new photo-layer controls are already verified in the public editor. This procedure prepares a **different** private HTML bundle for the **PTG-authorized MegaFrame** inside Branchline. It does **not** use the disabled `studio-private-package-issuer` endpoint and does **not** change the existing `megaframe-editor-delivery` service until a separate verified cutover.

The current protected editor, its encrypted local projects and PTG session gates must remain available throughout the staging of a replacement.

## Owner-only GitHub environment (required before upload)
Configure an environment named `megaframe-private-production` in the **kzamora19/megaframe-studio** repository. Require owner/reviewer approval for production jobs. Add these two **environment secrets**, never paste them into chat or commit them:

- `MEGAFRAME_PRODUCTION_URL`: `https://vmyoxoiygfcecgkbavgg.supabase.co` (the existing production MegaFrame project, **not** PTG, MegaFlyer or Branchline staging)
- `MEGAFRAME_PRODUCTION_ADMIN_KEY`: the **MegaFrame production** server-side `sb_secret_...` API key. Do not use a publishable key, PTG key, or OAuth credential

Set repository Actions variable `MEGAFRAME_PROTECTED_RELEASE_ENABLED=true` only for the approved upload; reset it to `false` afterward.

## Stage a new immutable private release
From Actions on the repository default **main** branch, run:

`MegaFrame private editor — verified production upload (manual approval)`

Enter confirmation exactly `DEPLOY-MEGAFRAME-PRIVATE` and approve the protected environment. The workflow:
1. Refuses non-main repository/ref and requires explicit approval and the exact production project URL.
2. Rebuilds a self-contained editor inside an ephemeral runner directory; the R6 private project bridge retains AES-GCM parent-vault storage.
3. Validates the frame layer controls and private bundle SHA-256, and confirms the storage bucket is private.
4. Uploads `releases/<sha256-prefix>/studio.html` using `upsert:false`, downloads it privately, and verifies every byte against the manifest.
5. Records only the private object path and SHA-256 in the Actions summary. It does **not** make the new bundle publicly accessible or automatically change the live PTG-gated editor.

## Controlled release and rollback (separate gate)
Before changing `megaframe-editor-delivery`, inspect its currently active private object, project and signed PTG verification. Rotate the pinned private release path/hash only when the new upload is confirmed. Preserve all existing verified tickets, P-256 signed continuation, opaque-origin iframe with no `allow-same-origin`, encrypted draft and named-project recovery, mobile layout, cloud/Drive boundaries, and no-cache headers.

Test using an actual authorized PTG account in the installed Windows Branchline Workspace: **Behind frame** and **In front of frame** selector, alpha detection for the holiday PNG, warnings on flat frames, header/ribbon/footer above imported customer photos, and exported PNG/JPG results. Also test revoked/expired accounts and project restoration. If a check fails, revert the delivery path/hash to the prior immutable release and keep the existing launcher sequence unchanged.

Only after those checks pass, update `studio/updates/release.json` and `studio/index.html` together and publish the protected launcher assets. Do not claim the installed app upgraded simply because public GitHub Pages CI passed.

## Automatic verification
- Private package proof on the release branch (no editor upload): GitHub Actions.
- Public frame rendering: `qa/smoke-transparent-openings.cjs`.
- Remaining protected cutover and acceptance: issue #49.

**Never enable a public direct-storage read policy, print service keys, upload customer images, replace the private package uploader's disabled function with unauthenticated access, or upload protected editor output to GitHub Pages or public Actions artifacts.**
