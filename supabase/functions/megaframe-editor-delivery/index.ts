// STAGING PROOF ONLY. Never deploy without real integration, payload performance and cutover approval.
// Returns a private editor bundle as JSON after checking a PTG-issued studio ticket.
// GET text/html is not used: default Supabase Edge domains rewrite HTML responses.
import {createClient} from "npm:@supabase/supabase-js@2.49.8";
import {studioTicketOk,deliveryConfigured,exactHttpsOrigin,validPtgGatewayUrl,validStudioBackendUrl} from "../_shared/studio-private-policy.mjs";

const MEGAFRAME_URL=Deno.env.get("SUPABASE_URL")||"";
const MEGAFRAME_SERVICE=Deno.env.get("SUPABASE_SECRET_KEY")||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const VERIFY_SECRET=Deno.env.get("MEGAFRAME_PTG_STUDIO_GATEWAY_SECRET")||"";
const ALLOWED_ORIGIN=Deno.env.get("MEGAFRAME_STUDIO_ALLOWED_ORIGIN")||"";
const BUNDLE_PATH=Deno.env.get("MEGAFRAME_PRIVATE_BUNDLE_PATH")||"";
const BUNDLE_SHA=Deno.env.get("MEGAFRAME_PRIVATE_BUNDLE_SHA256")||"";
const BUNDLE_BUCKET="megaframe-editor-release"; // Never reuse the live shared-assets bucket.
// Never connect a staging Studio to a live PTG authorization authority.
const DEPLOYMENT_MODE=Deno.env.get("PTG_STUDIO_DEPLOYMENT_MODE")||"";
const PTG_VERIFY_URL=validPtgGatewayUrl(
  Deno.env.get("PTG_STUDIO_GATEWAY_URL")||"",DEPLOYMENT_MODE
);
const NO_CACHE={"Cache-Control":"no-store, private","Pragma":"no-cache","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};

function json(origin:string,value:unknown,status=200){
 const headers:Record<string,string>={"Content-Type":"application/json; charset=utf-8",...NO_CACHE};
 if(origin===exactHttpsOrigin(ALLOWED_ORIGIN)){
  headers["Access-Control-Allow-Origin"]=origin;
  headers["Access-Control-Allow-Methods"]="POST, OPTIONS";
  headers["Access-Control-Allow-Headers"]="content-type, apikey";
  headers["Vary"]="Origin";
 }
 return new Response(JSON.stringify(value),{status,headers});
}
function configReady(){
 return !!PTG_VERIFY_URL && !!validStudioBackendUrl(MEGAFRAME_URL,DEPLOYMENT_MODE,"vmyoxoiygfcecgkbavgg") && deliveryConfigured({
  origin:ALLOWED_ORIGIN,secret:VERIFY_SECRET,serviceKey:MEGAFRAME_SERVICE,
  path:BUNDLE_PATH,sha:BUNDLE_SHA,bucket:BUNDLE_BUCKET
 });
}
// A PTG launch ticket is exchanged ONCE for a proof-bound session.
// Every subsequent check requires a P-256 signature on a fresh challenge.
async function trustedPtg(action:"exchange"|"prove"|"cloud"|"drive",body:Record<string,unknown>){
 const response=await fetch(PTG_VERIFY_URL,{method:"POST",cache:"no-store",redirect:"error",
  headers:{"Content-Type":"application/json","x-ptg-studio-secret":VERIFY_SECRET},
  body:JSON.stringify({action,studio:"megaframe",...body}),signal:AbortSignal.timeout(8000)});
 if(!response.ok)return null;
 const data=await response.json().catch(()=>null);
 if(!data||data.ok!==true||typeof data.expiresAt!=="string"||
    !Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=Date.now()||
    typeof data.sessionId!=="string"||!/^[0-9a-f-]{36}$/i.test(data.sessionId)||
    !studioTicketOk(data.challenge))return null;
 return data;
}
Deno.serve(async req=>{
 const origin=req.headers.get("origin")||"";
 if(!exactHttpsOrigin(ALLOWED_ORIGIN)||origin!==exactHttpsOrigin(ALLOWED_ORIGIN))
  return json(origin,{ok:false,error:"Forbidden origin."},403);
 if(req.method==="OPTIONS")
  return json(origin,{ok:true});
 if(req.method!=="POST")return json(origin,{ok:false,error:"Method not allowed."},405);
 if(!configReady())return json(origin,{ok:false,error:"Protected editor delivery is not configured."},503);
 if(!(req.headers.get("content-type")||"").toLowerCase().includes("application/json"))
  return json(origin,{ok:false,error:"JSON required."},415);
 try{
  const raw=await req.text();
  if(raw.length>1_700_000)return json(origin,{ok:false,error:"Request too large."},413);
  const body=JSON.parse(raw);
  if(!body||typeof body!=="object"||Array.isArray(body)||
     !["load","check","cloud","drive"].includes(body.action) ||
     (!["cloud","drive"].includes(body.action)&&raw.length>1024))return json(origin,{ok:false,error:"Invalid request."},400);
  if(body.action==="drive"){
    // This is the central OWNER Google Drive account. Never return an OAuth
    // token to staff or let the browser select a different Google account.
    if(typeof body.sessionId!=="string"||!/^[0-9a-f-]{36}$/i.test(body.sessionId)||
       !studioTicketOk(body.challenge)||typeof body.signature!=="string"||
       !/^[A-Za-z0-9_-]{80,96}$/.test(body.signature)||
       !["list","read","write"].includes(body.operation))
      return json(origin,{ok:false,error:"Invalid signed Drive operation."},400);
    const verified=await trustedPtg("drive",{
      sessionId:body.sessionId,challenge:body.challenge,signature:body.signature,
      operation:body.operation,recordKey:body.recordKey,fileId:body.fileId,
      iv:body.iv,encrypted:body.encrypted
    });
    if(!verified||!verified.drive)
      return json(origin,{ok:false,error:"PTG owner Drive authorization required."},403);
    return json(origin,{ok:true,sessionId:verified.sessionId,
      challenge:verified.challenge,expiresAt:verified.expiresAt,drive:verified.drive});
  }
  if(body.action==="cloud"){
    // Separate PTG account scope, never Studio Auth uid or browser-provided actor.
    // Prove the SAME one-use P-256 challenge as regular session refresh.
    if(typeof body.sessionId!=="string"||!/^[0-9a-f-]{36}$/i.test(body.sessionId)||
       !studioTicketOk(body.challenge)||typeof body.signature!=="string"||
       !/^[A-Za-z0-9_-]{80,96}$/.test(body.signature)||
       !["list","read","write"].includes(body.operation))
      return json(origin,{ok:false,error:"Invalid cloud proof."},400);
    const verified=await trustedPtg("cloud",{
      sessionId:body.sessionId,challenge:body.challenge,signature:body.signature,
      operation:body.operation,recordKey:body.recordKey,
      iv:body.iv,encrypted:body.encrypted,expectedVersion:body.expectedVersion
    });
    if(!verified||!verified.cloud)return json(origin,{ok:false,error:"PTG cloud authorization required."},403);
    // PTG actor ID and administrator flags are service-only; cloud responses
    // expose ONLY a rotated challenge and the requested encrypted record.
    return json(origin,{ok:true,sessionId:verified.sessionId,
      challenge:verified.challenge,expiresAt:verified.expiresAt,cloud:verified.cloud});
  }
  if(body.action==="check"){
   if(typeof body.sessionId!=="string"||!/^[0-9a-f-]{36}$/i.test(body.sessionId)||
      !studioTicketOk(body.challenge)||typeof body.signature!=="string"||
      !/^[A-Za-z0-9_-]{80,96}$/.test(body.signature))
     return json(origin,{ok:false,error:"Invalid signed session proof."},400);
   const verified=await trustedPtg("prove",{sessionId:body.sessionId,
      challenge:body.challenge,signature:body.signature});
   if(!verified)return json(origin,{ok:false,error:"PTG Studio authorization required."},403);
   return json(origin,{ok:true,sessionId:verified.sessionId,challenge:verified.challenge,
      expiresAt:verified.expiresAt});
  }
  if(!studioTicketOk(body.ticket)||!body.publicKey||typeof body.publicKey!=="object")
    return json(origin,{ok:false,error:"Invalid launch ticket or proof key."},400);
  const exchanged=await trustedPtg("exchange",{ticket:body.ticket,publicKey:body.publicKey});
  if(!exchanged||!studioTicketOk(exchanged.draftScope)||!studioTicketOk(exchanged.draftKey))
    return json(origin,{ok:false,error:"PTG Studio authorization required."},403);
  const {expiresAt,sessionId,challenge,draftScope,draftKey}=exchanged;
  const admin=createClient(MEGAFRAME_URL,MEGAFRAME_SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await admin.storage.from(BUNDLE_BUCKET).download(BUNDLE_PATH);
  if(error||!data)throw Error("Private release object unavailable");
  const html=await data.text();
  if(!html||html.length>15_000_000||!html.includes("PRIVATE MEGAFRAME EDITOR BUNDLE"))
   throw Error("Invalid private editor bundle");
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(html))),
    b=>b.toString(16).padStart(2,"0")).join("");
  if(hash!==BUNDLE_SHA)throw Error("Private editor bundle hash mismatch");
  return json(origin,{ok:true,html,expiresAt,sessionId,challenge,draftScope,draftKey,sha256:hash});
 }catch(error){
  console.error("Private Studio delivery blocked:",error instanceof Error?error.name:"unknown");
  return json(origin,{ok:false,error:"Private editor delivery unavailable."},503);
 }
});
