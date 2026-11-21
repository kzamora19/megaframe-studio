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
  "editor.js", "cloud-config.js", "google-drive-config.js",
  "google-drive.js", "shared.js"
];
let html = readFileSync(join(root, "index.html"), "utf8");
const inlined = [];
const scriptHashes = [];
for (const name of scriptNames) {
  const tag = '<script src="./' + name + '" defer></script>';
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
    const restoredNote = "notify('Restored your unfinished editing session from this device.');";
    if (code.split(restoredNote).length !== 2)
      throw Error("MegaFrame restore UI changed; review the private bundle.");
    code = code.replace(restoredNote,
      restoredNote + " draftStatus('Draft restored on this device.');");
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
