// STAGING ONLY: separate MegaFrame's editor from a future public Pages launcher.
// Do NOT deploy either generated output until PTG/Supabase private delivery is tested.
// Usage: node staging/build-private-package.mjs /tmp/megaframe-private-check
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {dirname, join, resolve, relative, sep} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.argv[2] || join(root, ".private-studio-check"));
const rel = relative(root, output);
if (output === root || output === join(root, "_site") ||
    output === join(root, "icons") || output === join(root, ".github") ||
    rel.startsWith("_site" + sep) || rel.startsWith(".github" + sep))
  throw Error("Private editor must never be built into a public deployment folder.");
const sha256 = value => createHash("sha256").update(value).digest("hex");
const scriptNames = [
  ...Array.from({length: 6}, (_, i) => "sample_image-" + i + ".js"),
  ...Array.from({length: 4}, (_, i) => "gold_image-" + i + ".js"),
  "overlay-engine.js", "editor.js", "cloud-config.js", "google-drive-config.js",
  "google-drive.js", "shared.js", "chat-sidebar.js"
];
let html = readFileSync(join(root, "index.html"), "utf8");
const inlined = [];
const scriptHashes = [];
for (const name of scriptNames) {
  const resource = (name==="editor.js"||name==="chat-sidebar.js") ? name+"?v=20261121-static-loader-1" : name;
  const tag = '<script src="./' + resource + '" defer></script>';
  if (html.split(tag).length !== 2) throw Error("Missing or duplicate editor script: " + name);
  let code = readFileSync(join(root, name), "utf8").replace(/<\/script/gi, "<\\/script");
  let injected = "";
  if (name === "editor.js") {
    const begin = code.indexOf("async function draftRead() {");
    const finish = code.indexOf("function serializeDraft() {", begin);
    if (begin < 0 || finish < begin)
      throw Error("MegaFrame draft functions changed; review before private packaging.");
    const replacement = [
      "async function draftRead() { return window.__MEGAFRAME_PRIVATE_DRAFT__.request('read'); }",
      "async function draftWrite(record) { return window.__MEGAFRAME_PRIVATE_DRAFT__.request('write',record); }",
      "async function draftDelete() { return window.__MEGAFRAME_PRIVATE_DRAFT__.request('delete'); }",
      "",
    ].join("\n");
    code = code.slice(0, begin) + replacement + code.slice(finish);
    // New live Save Project / Open Projects uses a second IndexedDB database.
    // It cannot work in the opaque sandbox and must never store plaintext
    // customer photos on a shared github.io origin. Replace ALL named-project
    // database functions with the encrypted account-scoped launcher bridge.
    const namedBegin = code.indexOf("// Named projects are separate from");
    const namedEnd = code.indexOf("function projectSize(record){",namedBegin);
    if(namedBegin<0 || namedEnd<namedBegin)
      throw Error("MegaFrame named-project storage changed; security review required.");
    // Only replace IndexedDB-backed CRUD. The current v2.7 startup flow
    // also defines recoveryArchiveId/deleteLinkedRecovery in this region:
    // they coordinate automatic recovery, named archive and safe deletion.
    // Dropping those helpers prevents the startup chooser from opening.
    const archiveBegin=code.indexOf("// A recovered session has two local representations.",namedBegin);
    if(archiveBegin<namedBegin||archiveBegin>=namedEnd||
       !code.slice(archiveBegin,namedEnd).includes("function recoveryArchiveId(draft)")||
       !code.slice(archiveBegin,namedEnd).includes("async function deleteLinkedRecovery(id)"))
      throw Error("MegaFrame recovery-project helpers changed; review before packaging.");
    const recoveryHelpers=code.slice(archiveBegin,namedEnd);
    const namedBridge = [
      "async function projectList(){return window.__MEGAFRAME_PRIVATE_DRAFT__.request('project-list');}",
      "async function projectRead(id){return window.__MEGAFRAME_PRIVATE_DRAFT__.request('project-read',id);}",
      "async function projectWrite(record){return window.__MEGAFRAME_PRIVATE_DRAFT__.request('project-write',record);}",
      "async function projectRemove(id){return window.__MEGAFRAME_PRIVATE_DRAFT__.request('project-delete',id);}",
      recoveryHelpers,
    ].join("\n");
    code=code.slice(0,namedBegin)+namedBridge+code.slice(namedEnd);
    // Current production v2.7 starts on a blank workspace, prompts for
    // New Project / Open Projects, and archives an older recovery copy.
    // Preserve this whole flow inside the private frame; its projectRead/
    // projectWrite and draftRead/draftWrite calls are replaced above by
    // the account-scoped encrypted launcher bridge, not raw IndexedDB.
    if (!code.includes("async function initializeDraftRecovery() {") ||
        !code.includes("async function beginNewProject()") ||
        !code.includes("Previous session protected in Open Projects.") ||
        !code.includes("await openBlankWorkspace();"))
      throw Error("MegaFrame current startup/recovery flow changed; review before packaging.");
    const bridge = readFileSync(join(root, "staging/editor-draft-bridge.js"), "utf8")
      .replace(/<\/script/gi, "<\\/script");
    injected = "<script>" + bridge + "</script>";
    scriptHashes.push("'sha256-" + createHash("sha256").update(bridge).digest("base64") + "'");
  }
  html = html.replace(tag, injected + "<script>" + code + "</script>");
  // Preserve hash-only authorization for every inlined editor script.
  scriptHashes.push("'sha256-" + createHash("sha256").update(code).digest("base64") + "'");
  inlined.push(name);
}
// Preserve current production's new ChatGPT-style navigation without any
// relative public assets in this opaque-origin private bundle.
const newSidebarStylesheet='<link rel="stylesheet" href="./chat-sidebar.css?v=20261121-static-loader-1" />';
if(html.split(newSidebarStylesheet).length!==2)
  throw Error("Live MegaFrame sidebar CSS reference changed; review packaging.");
html=html.replace(newSidebarStylesheet,'<style>'+readFileSync(join(root,"chat-sidebar.css"),"utf8")+'</style>');
// The Branchline-approved chrome palette is applied only to protected UI.
// Keep the live index.html intact so late overlay/font/sidebar features survive.
const branchlineStyles="/* BRANCHLINE unified-interface branding — approved Workspace source tokens.\n   Only interactive editor chrome is styled. Customer images, frame templates,\n   preview canvas pixels, and PNG/PDF export settings are unchanged. */\n:root{\n  --branchline-navy:#1d2836;\n  --branchline-blue:#355ee8;\n  --branchline-blue-dark:#2348c7;\n  --branchline-blue-soft:#eef2ff;\n  --branchline-white:#fff;\n  --branchline-line:#e9edf1;\n}\nbody>.appbar{\n  height:auto;min-height:74px;\n  background:var(--branchline-navy);\n  color:var(--branchline-white);\n  border-bottom:2px solid var(--branchline-blue);\n}\nbody>.appbar .brandname{color:var(--branchline-white);font-weight:850}\nbody>.appbar .brandname span{color:#dce6ff!important}\nbody>.appbar .brandtag{color:#dce6ff;font-weight:650;letter-spacing:.01em}\nbody>.appbar .btn.ghost{\n  background:var(--branchline-blue-soft);\n  border-color:#d8e2ff;\n  color:var(--branchline-blue-dark);\n}\nbody>.appbar .btn.ghost:hover:not(:disabled){\n  background:#dce6ff;border-color:#bccdff;\n}\nbody>.appbar .logo{box-shadow:0 3px 10px #101a3690}\n.appbody>.sidebar{border-right-color:var(--branchline-line)}\n.appbody>.sidebar .pinNav button.active,\n.appbody>.sidebar .pinNav button:hover{\n  background:var(--branchline-blue-soft);\n  border-color:#aac0ff;\n  color:var(--branchline-blue-dark);\n}\n.appbody .btn.primary{background:var(--branchline-blue);border-color:var(--branchline-blue)}\n.appbody .btn.primary:hover:not(:disabled){background:var(--branchline-blue-dark);border-color:var(--branchline-blue-dark)}\n.appbody .btn.dark{background:var(--branchline-navy);border-color:var(--branchline-navy)}\n.appbody .workspaceHeader h1{color:var(--branchline-navy)}\n@media(max-width:720px){\n  body>.appbar{min-height:74px;padding:12px 15px;gap:10px}\n  body>.appbar .brand{min-width:0}\n  body>.appbar .brandname{font-size:16px}\n  body>.appbar .brandtag{font-size:10px;line-height:1.3;max-width:29ch}\n}\n\n";
if(html.split('</style>').length<2)throw Error("No private UI style boundary.");
html=html.replace('</style>',branchlineStyles+'</style>');
inlined.push("chat-sidebar.css", "Branchline protected chrome");
// Source CSP permits external scripts from self, but the private bundle
// contains inlined code. Hash-only script exceptions keep the existing policy
// restrictive, rather than bypassing it with unsafe-inline.
const scriptDirective = "script-src 'self' https://accounts.google.com https://www.gstatic.com;";
if (html.split(scriptDirective).length !== 2)
  throw Error("Unexpected source Content Security Policy; review before packaging.");
html = html.replace(scriptDirective,
  "script-src 'self' https://accounts.google.com https://www.gstatic.com " +
  scriptHashes.join(" ") + ";");
// PWA installation and service-worker caches are incompatible with the private
// source-delivery proof. The existing public app is NOT altered by this tool.
const pwa = '<script src="./pwa-client.js" defer></script>';
if (html.split(pwa).length !== 2) throw Error("Unexpected PWA registration path.");
html = html.replace(pwa, "");
html = html.replace(/<link rel="manifest" href="\.\/manifest\.webmanifest" \/>/, "");
for (const name of ["icon-192.png", "apple-touch-icon.png"]) {
  const reference = "./icons/" + name + "?v=blue-m-20261118";
  if (!html.includes(reference)) throw Error("Missing icon reference " + name);
  const uri = "data:image/png;base64," + readFileSync(join(root, "icons", name)).toString("base64");
  html = html.split(reference).join(uri);
}
if (/<script\s+src=["']\.\//i.test(html) || /<img[^>]+src=["']\.\//i.test(html))
  throw Error("Private package still requires public relative editor assets.");
if (!html.includes("MegaFrame Studio") || !html.includes("editor.js".replace(".js","")))
  throw Error("Invalid editor input.");
html = "<!-- PRIVATE MEGAFRAME EDITOR BUNDLE. NEVER PUBLISH VIA GITHUB PAGES. -->\n" + html;
const stub = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>MegaFrame Studio — PTG access</title><main><h1>MegaFrame Studio</h1><p>Open MegaFrame from an active PTG Team Leader, Branch Admin or System Admin account.</p><p>The protected editor delivery service is not enabled on this public preview.</p><a rel="noreferrer" href="https://kzamora19.github.io/first-megasaver-ptg/studios/">Open PTG Creative Studios</a></main></html>';
mkdirSync(join(output, "private"), {recursive: true});
mkdirSync(join(output, "public"), {recursive: true});
writeFileSync(join(output, "private", "studio.html"), html);
writeFileSync(join(output, "public", "index.html"), stub);
const manifest = {
  type: "MegaFramePrivateEditorProof", revision: 1,
  sha256: sha256(html), bytes: Buffer.byteLength(html),
  inlined, inlineScriptHashes: scriptHashes.length,
  publicSha256: sha256(stub), publicBytes: Buffer.byteLength(stub),
};
writeFileSync(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("Staging-only MegaFrame private editor bytes:", manifest.bytes,
  "sha256:", manifest.sha256.slice(0, 16), "public entry bytes:", manifest.publicBytes);
