import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {studioTicketOk,releasePathOk,sha256Ok,exactHttpsOrigin,deliveryConfigured,validPtgGatewayUrl,PRODUCTION_PTG_REF,validStudioBackendUrl,KNOWN_PRODUCTION_REFS}
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
  assert.match(source,/studio:"megaframe",\.\.\.body/);
  assert.match(source,/trustedPtg\("exchange"/);
  assert.match(source,/trustedPtg\("prove"/);
  assert.match(source,/if\(body.action==="check"\)/);
  assert.doesNotMatch(source,/action:"verify"/);
  assert.match(source,/admin.storage.from\(BUNDLE_BUCKET\).download\(BUNDLE_PATH\)/);
  assert.match(source,/if\(hash!==BUNDLE_SHA\)/);
  assert.match(source,/origin!==exactHttpsOrigin\(ALLOWED_ORIGIN\)/);
  assert.doesNotMatch(source,/createSignedUrl\(/);
  assert.doesNotMatch(source,/vercel[.]app/);
  assert.match(source,/Cache-Control":"no-store, private"/);
  assert.match(source,/15_000_000/);
});

test("studio PTG verifier is explicitly configured and never crosses production/staging",()=>{
 const prod="https://"+PRODUCTION_PTG_REF+".supabase.co/functions/v1/ptg-studio-access";
 const stage="https://gmrnzcrxysafqwertyui.supabase.co/functions/v1/ptg-studio-access";
 assert.equal(validPtgGatewayUrl(prod,"production"),prod);
 assert.equal(validPtgGatewayUrl(stage,"staging"),stage);
 assert.equal(validPtgGatewayUrl(prod,"staging"),"","Staging cannot access production PTG");
 assert.equal(validPtgGatewayUrl(stage,"production"),"","Production cannot trust unreviewed PTG");
 for(const invalid of [
   ["", "staging"],[prod,""],[prod,"development"],
   ["http://"+PRODUCTION_PTG_REF+".supabase.co/functions/v1/ptg-studio-access","production"],
   [prod+"/","production"],[prod+"?token=123","production"],
   [prod+"#ticket","production"],[prod.replace(".supabase.co",":444.supabase.co"),"production"],
   [prod.replace("https://","https://attacker.example@"),"production"],
   ["https://localhost/functions/v1/ptg-studio-access","staging"],
   ["https://x.supabase.co/functions/v1/ptg-studio-access","staging"],
 ]){
   assert.equal(validPtgGatewayUrl(...invalid),"",JSON.stringify(invalid));
 }
 const src=readFileSync(new URL("../supabase/functions/megaframe-editor-delivery/index.ts",import.meta.url),"utf8");
 assert.match(src,/Deno\.env\.get\("PTG_STUDIO_GATEWAY_URL"\)/);
 assert.match(src,/Deno\.env\.get\("PTG_STUDIO_DEPLOYMENT_MODE"\)/);
 assert.match(src,/return !!PTG_VERIFY_URL && /,"Misconfigured backend must fail closed before ticket redemption");
 assert.doesNotMatch(src,/const PTG_VERIFY_URL="https:/);
 assert.match(src,/redirect:"error"/,"PTG call must reject redirects");
});

test("studio backend cannot accidentally use another production Supabase project",()=>{
 const prod="https://vmyoxoiygfcecgkbavgg.supabase.co";
 const stage="https://gmrnzcrxysafqwertyui.supabase.co";
 assert.equal(validStudioBackendUrl(prod,"production","vmyoxoiygfcecgkbavgg"),prod);
 assert.equal(validStudioBackendUrl(stage,"staging","vmyoxoiygfcecgkbavgg"),stage);
 assert.equal(validStudioBackendUrl(prod,"staging","vmyoxoiygfcecgkbavgg"),"");
 assert.equal(validStudioBackendUrl(stage,"production","vmyoxoiygfcecgkbavgg"),"");
 assert.equal(validStudioBackendUrl("http://gmrnzcrxysafqwertyui.supabase.co","staging","vmyoxoiygfcecgkbavgg"),"");
 for(const ref of KNOWN_PRODUCTION_REFS){
   assert.equal(validStudioBackendUrl("https://"+ref+".supabase.co","staging","vmyoxoiygfcecgkbavgg"),"");
   assert.equal(validPtgGatewayUrl("https://"+ref+".supabase.co/functions/v1/ptg-studio-access","staging"),"");
 }
 const src=readFileSync(new URL("../supabase/functions/megaframe-editor-delivery/index.ts",import.meta.url),"utf8");
 assert.match(src,/!!validStudioBackendUrl\(/);
});
