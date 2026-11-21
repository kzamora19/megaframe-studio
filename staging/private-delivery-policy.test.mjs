import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {studioTicketOk,releasePathOk,sha256Ok,exactHttpsOrigin,deliveryConfigured}
  from "../supabase/functions/_shared/studio-private-policy.mjs";

test("MegaFrame ticket, immutable asset path, SHA-256 and origin guards are strict", () => {
  assert.equal(studioTicketOk("A".repeat(43)),true);
  for(const value of ["","A".repeat(42),"A".repeat(44),"../../index.html"])assert.equal(studioTicketOk(value),false);
  assert.equal(releasePathOk("releases/abcdef123456/studio.html"),true);
  assert.equal(releasePathOk("releases/abcdef123456/../studio.html"),false);
  assert.equal(sha256Ok("f".repeat(64)),true);
  assert.equal(sha256Ok("z".repeat(64)),false);
  assert.equal(exactHttpsOrigin("https://kzamora19.github.io"),"https://kzamora19.github.io");
  for(const value of ["http://kzamora19.github.io","https://*.github.io",
    "https://kzamora19.github.io/megaframe-studio/","https://u:p@kzamora19.github.io"])
    assert.equal(exactHttpsOrigin(value),"");
});
test("private MegaFrame delivery cannot configure without server secrets or a private bucket", () => {
  const valid={origin:"https://kzamora19.github.io",secret:"x".repeat(32),
    serviceKey:"x".repeat(32),path:"releases/abcdef123456/studio.html",
    sha:"f".repeat(64),bucket:"megaframe-editor-release"};
  assert.equal(deliveryConfigured(valid),true);
  for(const invalid of [
    {secret:""},{serviceKey:""},{bucket:"flyer-editor-release"},
    {origin:"http://example.com"},{path:"site/index.html"},{sha:""},
  ])assert.equal(deliveryConfigured({...valid,...invalid}),false);
});
test("server verifies PTG megaframe ticket for each load/check, without exposing bucket URLs", () => {
  const source=readFileSync(new URL("../supabase/functions/megaframe-editor-delivery/index.ts",import.meta.url),"utf8");
  assert.match(source,/studio:"megaframe",ticket/);
  assert.match(source,/if\(!expiresAt\)return json/);
  assert.match(source,/if\(body.action==="check"\)/);
  assert.match(source,/admin.storage.from\(BUNDLE_BUCKET\).download\(BUNDLE_PATH\)/);
  assert.match(source,/if\(hash!==BUNDLE_SHA\)/);
  assert.match(source,/if\(origin!==exactHttpsOrigin\(ALLOWED_ORIGIN\)\)/);
  assert.doesNotMatch(source,/createSignedUrl\(/);
  assert.doesNotMatch(source,/vercel[.]app/);
  assert.match(source,/Cache-Control":"no-store, private"/);
  assert.match(source,/15_000_000/);
});
