// Signed private editor release upload, only from the GitHub Actions job
// attested by the Supabase OIDC issuer. No service-role keys in GitHub.
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {createClient} from "@supabase/supabase-js";
const studio="megaframe";
const project="vmyoxoiygfcecgkbavgg";
const bucket="megaframe-editor-release";
const publishable="sb_publishable_jyCflrfvPnPb6O3ncmlG2w_w4FeKz40";
const endpoint="https://"+project+".supabase.co/functions/v1/studio-private-package-issuer";
const audience="branchline-private-editor-release:"+studio+":"+project;
if(!process.env.GITHUB_ACTIONS || process.env.GITHUB_EVENT_NAME!=="push"||
   !process.env.GITHUB_SHA || !process.env.ACTIONS_ID_TOKEN_REQUEST_URL ||
   !process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)throw Error("This private uploader must run inside trusted GitHub Actions push.");
const file=readFileSync(join(process.env.RUNNER_TEMP,"branchline-private-bundle","private","studio.html"));
const sha256=createHash("sha256").update(file).digest("hex");
const bytes=file.byteLength;
const manifest=JSON.parse(readFileSync(join(process.env.RUNNER_TEMP,"branchline-private-bundle","manifest.json"),"utf8"));
if(sha256!==manifest.sha256||bytes!==manifest.bytes)
 throw Error("Editor HTML differs from the private package integrity manifest.");
const expectedPath="releases/"+sha256.slice(0,16)+"/studio.html";
async function action(operation){
 const tokenUrl=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
 tokenUrl.searchParams.set("audience",audience);
 const tokenResponse=await fetch(tokenUrl,{headers:{
  Authorization:"Bearer "+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
 },signal:AbortSignal.timeout(15000)});
 if(!tokenResponse.ok)throw Error("Unable to obtain GitHub job identity attestation.");
 const token=(await tokenResponse.json()).value;
 if(typeof token!=="string")throw Error("GitHub attestation did not include an ID token");
 if(operation==="request"){
  // Diagnostics are booleans only: never log the JWT, token payload or keys.
  const fields=token.split(".");
  const claim=JSON.parse(Buffer.from(fields[1],"base64url").toString("utf8"));
  const head=JSON.parse(Buffer.from(fields[0],"base64url").toString("utf8"));
  console.log("GitHub OIDC eligibility (booleans):",JSON.stringify({
   algOk:head.alg==="RS256",typJwt:head.typ==="JWT",
   subOk:claim.sub==="repo:"+process.env.GITHUB_REPOSITORY+":ref:"+process.env.GITHUB_REF,
   audienceOk:claim.aud===audience,
   repositoryOk:claim.repository===process.env.GITHUB_REPOSITORY,
   repositoryIdOk:String(claim.repository_id)==="1461566255",
   refOk:claim.ref===process.env.GITHUB_REF,
   workflowRefOk:claim.workflow_ref===process.env.GITHUB_REPOSITORY+"/.github/workflows/private-release-upload.yml@"+process.env.GITHUB_REF,
   eventPush:claim.event_name==="push",shaOk:claim.sha===process.env.GITHUB_SHA,
   tokenLifetimeSeconds:claim.exp-claim.iat
  }));
 }

 const response=await fetch(endpoint,{method:"POST",headers:{
  "Content-Type":"application/json",Authorization:"Bearer "+token
 },body:JSON.stringify({operation,sha256,bytes,commit:process.env.GITHUB_SHA}),
 signal:AbortSignal.timeout(25000),redirect:"error"});
 if(!response.ok)throw Error("Private Supabase release issuer refused attested "+operation+" (HTTP "+response.status+")");
 const result=await response.json();
 if(result?.ok!==true||result.path!==expectedPath||result.sha256!==sha256||
   result.bytes!==bytes)throw Error("Release issuer returned invalid path or digest");
 return result;
}
const granted=await action("request");
if(granted.status==="upload"){
 if(typeof granted.token!=="string"||granted.token.length<10)
  throw Error("Missing private signed storage upload authorization.");
 const client=createClient("https://"+project+".supabase.co",publishable,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
 });
 const {error}=await client.storage.from(bucket).uploadToSignedUrl(
  expectedPath,granted.token,file,{contentType:"text/html",cacheControl:"0",upsert:false}
 );
 if(error)throw Error("Private release upload failed: "+(error.name||"StorageError"));
}else if(granted.status!=="verified")throw Error("Unexpected private release broker response");
const confirmed=await action("confirm");
if(confirmed.status!=="verified")throw Error("Private editor byte integrity was not confirmed");
console.log("VERIFIED PRIVATE "+studio.toUpperCase()+" RELEASE:",expectedPath,"SHA256:",sha256,"BYTES:",bytes);
console.log("This secure package is NOT published to GitHub Pages.");
