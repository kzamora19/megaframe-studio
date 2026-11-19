// Vercel Node function: exchange a short-lived PTG ticket for an HttpOnly
// same-origin cookie. All subsequent requests are rechecked by the proxy.
import {STUDIO_ID,TICKET_PATTERN,COOKIE_NAME,verifyPtgTicket} from "../studio-access/verify.mjs";
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store, private");
  res.setHeader("Pragma","no-cache");
  const origin=req.headers.origin;
  const originExpected="https://"+req.headers.host;
  if(origin!==originExpected){
    return res.status(403).json({ok:false,message:"Invalid request origin."});
  }
  if(req.method==="DELETE"){
    res.setHeader("Set-Cookie",COOKIE_NAME+"=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
    return res.status(200).json({ok:true});
  }
  if(req.method!=="POST")return res.status(405).json({ok:false});
  const ticket=req.body?.ticket;
  if(typeof ticket!=="string"||!TICKET_PATTERN.test(ticket))
    return res.status(400).json({ok:false,message:"Invalid PTG access ticket."});
  if(!await verifyPtgTicket(ticket))
    return res.status(403).json({ok:false,message:"PTG access denied or expired."});
  res.setHeader("Set-Cookie",COOKIE_NAME+"="+ticket+"; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax");
  return res.status(200).json({ok:true,studio:STUDIO_ID});
}
