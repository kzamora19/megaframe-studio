// STAGING PROOF ONLY. Never deploy without real integration, payload performance and cutover approval.
// Returns a private editor bundle as JSON after checking a PTG-issued studio ticket.
// GET text/html is not used: default Supabase Edge domains rewrite HTML responses.
import {createClient} from "npm:@supabase/supabase-js@2.49.8";
import {studioTicketOk,deliveryConfigured,exactHttpsOrigin} from "../_shared/studio-private-policy.mjs";

const MEGAFRAME_URL=Deno.env.get("SUPABASE_URL")||"";
const MEGAFRAME_SERVICE=Deno.env.get("SUPABASE_SECRET_KEY")||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const VERIFY_SECRET=Deno.env.get("MEGAFRAME_PTG_STUDIO_GATEWAY_SECRET")||"";
const ALLOWED_ORIGIN=Deno.env.get("MEGAFRAME_STUDIO_ALLOWED_ORIGIN")||"";
const BUNDLE_PATH=Deno.env.get("MEGAFRAME_PRIVATE_BUNDLE_PATH")||"";
const BUNDLE_SHA=Deno.env.get("MEGAFRAME_PRIVATE_BUNDLE_SHA256")||"";
const BUNDLE_BUCKET="megaframe-editor-release"; // Never reuse the live shared-assets bucket.
const PTG_VERIFY_URL="https://agknxlowackphvwyvxge.supabase.co/functions/v1/ptg-studio-access";
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
 return /^https:\/\/[^/]+\.supabase\.co$/.test(MEGAFRAME_URL)&&deliveryConfigured({
  origin:ALLOWED_ORIGIN,secret:VERIFY_SECRET,serviceKey:MEGAFRAME_SERVICE,
  path:BUNDLE_PATH,sha:BUNDLE_SHA,bucket:BUNDLE_BUCKET
 });
}
async function verified(ticket:string):Promise<string|null>{
 const check=await fetch(PTG_VERIFY_URL,{method:"POST",cache:"no-store",headers:{
   "Content-Type":"application/json","x-ptg-studio-secret":VERIFY_SECRET,
 },body:JSON.stringify({action:"verify",studio:"megaframe",ticket}),signal:AbortSignal.timeout(8000)});
 if(!check.ok)return null;
 const data=await check.json().catch(()=>null);
 return data?.ok===true&&typeof data.expiresAt==="string"&&
   Number.isFinite(Date.parse(data.expiresAt))&&Date.parse(data.expiresAt)>Date.now()?data.expiresAt:null;
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
  if(raw.length>1024)return json(origin,{ok:false,error:"Request too large."},413);
  const body=JSON.parse(raw);
  if(!body||typeof body!=="object"||Array.isArray(body)||!studioTicketOk(body.ticket)||
     !["load","check"].includes(body.action))return json(origin,{ok:false,error:"Invalid request."},400);
  const expiresAt=await verified(body.ticket);
  if(!expiresAt)return json(origin,{ok:false,error:"PTG Studio authorization required."},403);
  if(body.action==="check")return json(origin,{ok:true,expiresAt});
  const admin=createClient(MEGAFRAME_URL,MEGAFRAME_SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await admin.storage.from(BUNDLE_BUCKET).download(BUNDLE_PATH);
  if(error||!data)throw Error("Private release object unavailable");
  const html=await data.text();
  if(!html||html.length>15_000_000||!html.includes("PRIVATE MEGAFRAME EDITOR BUNDLE"))
   throw Error("Invalid private editor bundle");
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(html))),
    b=>b.toString(16).padStart(2,"0")).join("");
  if(hash!==BUNDLE_SHA)throw Error("Private editor bundle hash mismatch");
  return json(origin,{ok:true,html,expiresAt,sha256:hash});
 }catch(error){
  console.error("Private Studio delivery blocked:",error instanceof Error?error.name:"unknown");
  return json(origin,{ok:false,error:"Private editor delivery unavailable."},503);
 }
});
