// Server-only PTG entitlement lookup. NEVER send the gateway secret to browsers.
export const STUDIO_ID = "megaframe";
export const PTG_VERIFY_URL = "https://agknxlowackphvwyvxge.supabase.co/functions/v1/ptg-studio-access";
export const TICKET_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const COOKIE_NAME = "ptg_studio_access";
export function parseTicketCookie(value) {
  const item = String(value || "").split(";").map(x => x.trim())
    .find(x => x.startsWith(COOKIE_NAME+"="));
  const ticket = item ? item.slice(COOKIE_NAME.length+1) : "";
  return TICKET_PATTERN.test(ticket) ? ticket : "";
}
export async function verifyPtgTicket(ticket, {env=process.env, fetcher=fetch, now=Date.now}={}) {
  if(!TICKET_PATTERN.test(ticket))return false;
  const secret=env.PTG_STUDIO_GATEWAY_SECRET;
  if(typeof secret!=="string" || secret.length<32)return false; // fail closed
  try {
    const response=await fetcher(PTG_VERIFY_URL,{
      method:"POST",cache:"no-store",
      headers:{"Content-Type":"application/json","x-ptg-studio-secret":secret},
      body:JSON.stringify({action:"verify",studio:STUDIO_ID,ticket}),
      signal:AbortSignal.timeout(4000),
    });
    if(!response.ok)return false;
    const json=await response.json();
    return json.ok===true && Number.isFinite(Date.parse(json.expiresAt))
      && Date.parse(json.expiresAt)>now();
  } catch {return false;}
}
