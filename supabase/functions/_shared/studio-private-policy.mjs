// STAGING ONLY: pure guards for future MegaFrame Supabase protected editor delivery.
export const studioTicketOk = value => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
export const releasePathOk = value => typeof value === "string" &&
  /^releases\/[a-f0-9]{12,64}\/studio\.html$/.test(value);
export const sha256Ok = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function exactHttpsOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
        url.pathname !== "/" || !/^[a-z0-9.-]+$/i.test(url.hostname) ||
        url.hostname.includes("..") || (value.trim() !== url.origin && value.trim() !== url.origin + "/"))
      return "";
    return url.origin;
  } catch { return ""; }
}
export function deliveryConfigured({origin, secret, serviceKey, path, sha, bucket}) {
  return !!exactHttpsOrigin(origin) &&
    typeof secret === "string" && secret.length >= 32 &&
    typeof serviceKey === "string" && serviceKey.length >= 32 &&
    releasePathOk(path) && sha256Ok(sha) && bucket === "megaframe-editor-release";
}

/**
 * Cross-project PTG Studio authorization endpoint.
 * Staging must NEVER call the production PTG project; production cannot
 * silently accept an unreviewed alternative verification endpoint.
 * HTTPS only, exact Supabase function path, no port/query/credentials.
 */
export const PRODUCTION_PTG_REF = "agknxlowackphvwyvxge";
export const KNOWN_PRODUCTION_REFS = new Set([
 "agknxlowackphvwyvxge", "vmyoxoiygfcecgkbavgg",
 "tzklsscoiwnmeantcefw", "psoopubvdpwztzkdyifa"
]);
export function validStudioBackendUrl(raw,mode,productionRef){
 if(typeof raw!=="string" || !["staging","production"].includes(mode))return "";
 try{
  const url=new URL(raw);
  const match=/^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname);
  if(url.protocol!=="https:"||url.username||url.password||url.port||url.search||url.hash||
     url.pathname!=="/"||!match||raw!==url.origin)return "";
  if(mode==="staging" && KNOWN_PRODUCTION_REFS.has(match[1]))return "";
  if(mode==="production" && match[1]!==productionRef)return "";
  return url.origin;
 }catch{return "";}
}
export function validPtgGatewayUrl(raw,mode) {
 if(typeof raw!=="string" || !["staging","production"].includes(mode))return "";
 try{
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.username||u.password||u.port||u.search||u.hash||
     u.pathname!=="/functions/v1/ptg-studio-access")return "";
  const match=/^([a-z0-9]{20})\.supabase\.co$/.exec(u.hostname);
  if(!match || u.hostname!==u.hostname.toLowerCase())return "";
  const isProd=match[1]===PRODUCTION_PTG_REF;
  if(mode==="staging"&&KNOWN_PRODUCTION_REFS.has(match[1]))return "";
  if(mode==="production"&&!isProd)return "";
  if(raw!==u.href)return "";
  return u.href;
 }catch{return "";}
}
