// Vercel Routing Middleware: fail closed for ALL resources, not only HTML.
// This cannot protect independently published GitHub Pages copies.
import {next} from "@vercel/functions";
import {parseTicketCookie,verifyPtgTicket} from "./studio-access/verify.mjs";
const allowed = new Set(["/studio-access.html","/studio-access.js","/api/studio-session"]);
export default async function proxy(request){
  const url=new URL(request.url);
  if(allowed.has(url.pathname))return next();
  const ticket=parseTicketCookie(request.headers.get("cookie"));
  if(ticket&&await verifyPtgTicket(ticket))return next();
  if(request.method==="GET"||request.method==="HEAD"){
    const login=new URL("/studio-access.html",url.origin);
    return Response.redirect(login,302);
  }
  return new Response("PTG Team Leader or higher is required.",{
    status:401,headers:{"Cache-Control":"no-store","Content-Type":"text/plain; charset=utf-8"},
  });
}
