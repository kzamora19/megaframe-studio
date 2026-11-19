import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {STUDIO_ID,COOKIE_NAME,parseTicketCookie,verifyPtgTicket} from "../studio-access/verify.mjs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf-8");
const ticket="A".repeat(43);
const env={PTG_STUDIO_GATEWAY_SECRET:"x".repeat(40)};
const expires=new Date(Date.now()+100000).toISOString();
test("Only megaframe ticket can grant access and a missing secret fails closed",async()=>{
 assert.equal(STUDIO_ID,"megaframe");
 assert.equal(await verifyPtgTicket(ticket,{env:{}}),false);
 assert.equal(await verifyPtgTicket("bad",{env}),false);
 let seen;
 const ok=await verifyPtgTicket(ticket,{env,fetcher:async(url,request)=>{
   seen={url,request};return {ok:true,json:async()=>({ok:true,expiresAt:expires})};
 }});
 assert.equal(ok,true);
 assert.deepEqual(JSON.parse(seen.request.body),{action:"verify",studio:"megaframe",ticket});
 assert.ok(seen.request.headers["x-ptg-studio-secret"].length>=32);
 assert.equal(seen.request.cache,"no-store");
});
test("Wrong roles, stale tickets, network failures and denial cannot pass",async()=>{
 assert.equal(await verifyPtgTicket(ticket,{env,fetcher:async()=>({ok:false})}),false);
 assert.equal(await verifyPtgTicket(ticket,{env,fetcher:async()=>({ok:true,json:async()=>({ok:false,expiresAt:expires})})}),false);
 assert.equal(await verifyPtgTicket(ticket,{env,fetcher:async()=>({ok:true,json:async()=>({ok:true,expiresAt:new Date(Date.now()-10000).toISOString()})})}),false);
 assert.equal(await verifyPtgTicket(ticket,{env,fetcher:async()=>{throw Error("offline")}}),false);
});
test("Cookie parsing rejects malformed or attacker-controlled cookie values",()=>{
 assert.equal(COOKIE_NAME,"ptg_studio_access");
 assert.equal(parseTicketCookie("theme=dark; "+COOKIE_NAME+"="+ticket+"; z=1"),ticket);
 for(const cookie of ["",COOKIE_NAME+"="+ticket+".evil",COOKIE_NAME+"=x","not_ptg_studio_access="+ticket])
   assert.equal(parseTicketCookie(cookie),"");
});
test("Middleware guards all resources and exchange API has safe cookie",()=>{
 const proxy=read("proxy.mjs"),api=read("api/studio-session.js"),client=read("studio-access.js");
 const cfg=JSON.parse(read("vercel.json"));
 assert.equal(cfg.proxy.entrypoint,"proxy.mjs");
 assert.deepEqual(cfg.proxy.matcher,["/(.*)"]);
 assert.ok(proxy.includes("verifyPtgTicket(ticket)"));
 assert.ok(proxy.includes("return next()"));
 assert.ok(proxy.includes('Response.redirect(login,302)'));
 assert.ok(api.includes("HttpOnly; Secure; SameSite=Lax"));
 assert.ok(api.includes("origin!==originExpected"));
 assert.ok(client.includes('history.replaceState(null,"",location.pathname+location.search)'));
 assert.ok(!client.includes("PTG_STUDIO_GATEWAY_SECRET"));
});
