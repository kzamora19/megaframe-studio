import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {join} from "node:path";
import {chromium} from "playwright";

const studio=process.argv[2]==="flyer"?"megaflyer":"megaframe";
const target="http://127.0.0.1:4173/studio/";
const out=join("artifacts","official-navigation");
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[];
try{
 const desktop=await browser.newPage({viewport:{width:1440,height:900}});
 desktop.on("pageerror",error=>errors.push(error.message));
 await desktop.goto(target,{waitUntil:"domcontentloaded"});
 await desktop.locator(".bl-protected-app-rail").waitFor({state:"visible"});
 assert.equal(await desktop.locator(".bl-protected-app-link").count(),4);
 assert.equal(await desktop.locator("#studio-editor-frame").count(),0,
   "Invalid PTG ticket must not expose an editor");
 assert.equal(await desktop.locator(".bl-protected-mobile-brand").isVisible(),false);
 const links=await desktop.locator(".bl-protected-app-list-link").allTextContents();
 assert.deepEqual(links,["Price Tag Generator","Sales Tracker","MegaFrame Studio","MegaFlyer Studio"]);
 const guarded=await desktop.locator(".bl-protected-app-list-link").evaluateAll(nodes=>
   nodes.slice(2).map(x=>x.getAttribute("href")));
 assert.ok(guarded.every(x=>x?.startsWith("https://kzamora19.github.io/first-megasaver-ptg/studios/?studio=")));
 await desktop.screenshot({path:join(out,studio+"-desktop.png"),fullPage:true});
 await desktop.locator(".bl-protected-brand").click();
 assert.equal(await desktop.locator("#bl-protected-app-drawer").isVisible(),true);
 await desktop.screenshot({path:join(out,studio+"-desktop-menu.png"),fullPage:true});
 await desktop.locator(".bl-protected-brand").click();
 assert.equal(await desktop.locator("#bl-protected-app-drawer").isVisible(),false);
 await desktop.close();

 const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});
 mobile.on("pageerror",error=>errors.push(error.message));
 await mobile.goto(target,{waitUntil:"domcontentloaded"});
 await mobile.locator(".bl-protected-mobile-brand").waitFor({state:"visible"});
 assert.equal(await mobile.locator(".bl-protected-app-rail").isVisible(),false);
 assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true,
   "Protected app shell must not overflow mobile");
 await mobile.screenshot({path:join(out,studio+"-mobile.png"),fullPage:true});
 await mobile.locator(".bl-protected-mobile-brand").click();
 assert.equal(await mobile.locator("#bl-protected-app-drawer").isVisible(),true);
 await mobile.screenshot({path:join(out,studio+"-mobile-menu.png"),fullPage:true});
 await mobile.keyboard.press("Escape");
 assert.equal(await mobile.locator("#bl-protected-app-drawer").isVisible(),false);
 await mobile.locator(".bl-protected-mobile-brand").click();
 await mobile.locator(".bl-protected-mobile-brand").click();
 assert.equal(await mobile.locator("#bl-protected-app-drawer").isVisible(),false);
 await mobile.close();
 assert.deepEqual(errors,[]);
 console.log("PASS: Official "+studio+" four-app rail and protected public launcher, desktop/mobile screenshots");
}finally{await browser.close();}
