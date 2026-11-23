// Development-only, editor-free preview. The approved production release is separate.
import {mkdirSync,rmSync,writeFileSync,copyFileSync,readFileSync} from "node:fs";
import {resolve,relative,join,dirname,sep} from "node:path";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const target=resolve(process.argv[2]||join(root,"staging",".cutover-preview"));
const rel=relative(root,target);
if(process.env.PTG_STUDIO_CUTOVER_PREVIEW!=="1")throw Error("Cutover preview is not authorized");
if(!rel||rel==="."||rel===".."||rel.startsWith(".."+sep)||rel==="_site"||rel.startsWith("_site"+sep)||!rel.startsWith("staging"+sep))
 throw Error("Refusing public or out-of-repository cutover target");
const portal="https://kzamora19.github.io/first-megasaver-ptg/studios/";
const html=String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#1d2836"><title>MegaFrame Studio — protected access</title>
<link rel="manifest" href="./manifest.webmanifest">
<style>:root{font-family:"Segoe UI",Arial,sans-serif;color:#1d2836;background:#eef2ff}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px}
main{width:min(100%,490px);padding:26px;border-radius:16px;background:#fff;border:1px solid #e9edf1;box-shadow:0 14px 40px #17263b14}
img{width:45px;height:45px;border-radius:10px}h1{font-size:23px}p{font-size:14px;line-height:1.6;color:#40506b}
small{color:#65748a}a{display:inline-block;padding:12px 16px;background:#355ee8;color:white;text-decoration:none;border-radius:8px}
a:hover{background:#2348c7}</style><script defer src="./retire-client.js"></script></head>
<body><main><img src="./icons/icon-192.png" alt="MegaFrame Studio icon">
<h1>MegaFrame Studio</h1><p>Social Media Photo Frame Generator</p>
<p>This public editor address is retired. Authorized PTG Team Leaders, Branch Admins and System Admins can open the protected Studio using Branchline PTG.</p>
<p>Existing offline copies may remain available until each device reconnects. Arrange project backups and migration before the coordinated cutover; this page does not remove personal data.</p>
<a href="https://kzamora19.github.io/first-megasaver-ptg/studios/" rel="noreferrer">Open PTG Creative Studios</a>
<p><small id="retirement-status" role="status">Checking app update status.</small></p>
</main></body></html>`;
const worker=String.raw`/* No original editor; strictly network-only after activation. */
const BASE=new URL("./",self.location.href).pathname;
self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));
self.addEventListener("message",e=>{if(e.data?.type==="RETIRE_NOW")self.skipWaiting()});
self.addEventListener("activate",e=>e.waitUntil((async()=>{
 for(const name of await caches.keys())if(name.startsWith("megaframe-shell-"))await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener("fetch",e=>{
 const r=e.request,u=new URL(r.url);
 if(r.method!=="GET"||u.origin!==self.location.origin||!u.pathname.startsWith(BASE))return;
 e.respondWith(fetch(r,{cache:"no-store"}).catch(()=>{
  if(r.mode!=="navigate")return Response.error();
  return new Response("<!doctype html><h1>Connect to PTG to access MegaFrame Studio</h1>",{
   status:503,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}
  });
 }));
});
`;
const client=String.raw`/* Never clear IndexedDB, localStorage, or another app's PWA caches. */
(async()=>{const el=document.getElementById("retirement-status");
if(!("serviceWorker" in navigator)){if(el)el.textContent="Use PTG Creative Studios to continue.";return}
try{
 const reg=await navigator.serviceWorker.register("./service-worker.js",{scope:"./",updateViaCache:"none"});
 reg.waiting?.postMessage({type:"RETIRE_NOW"});await reg.update();
 if(el)el.textContent="The public app has been retired. Sign in through PTG.";
}catch{if(el)el.textContent="Reconnect to complete the old app update."}
})();
`;
const manifest=JSON.stringify({id:"./",name:"MegaFrame Studio — protected access",short_name:"MegaFrame",description:"Access MegaFrame from PTG Creative Studios",start_url:"./",scope:"./",display:"standalone",background_color:"#1d2836",theme_color:"#1d2836",icons:[{src:"./icons/icon-192.png",sizes:"192x192",type:"image/png",purpose:"any"},{src:"./icons/icon-512.png",sizes:"512x512",type:"image/png",purpose:"any"}]},null,2)+"\n";
rmSync(target,{recursive:true,force:true});
mkdirSync(join(target,"icons"),{recursive:true});
for(const [name,contents] of [["index.html",html],["service-worker.js",worker],["retire-client.js",client],["manifest.webmanifest",manifest],[".nojekyll",""]]){
 writeFileSync(join(target,name),contents);
}
for(const name of ["icon-192.png","icon-512.png","apple-touch-icon.png"])
 copyFileSync(join(root,"icons",name),join(target,"icons",name));
// Public ticket-only launcher at /megaframe-studio/studio/ (never editor HTML).
const publishableKey=process.env.MEGAFRAME_STUDIO_PUBLISHABLE_KEY||"";
if(process.env.PTG_STUDIO_PRODUCTION_RELEASE==="1" &&
   !/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(publishableKey))
 throw Error("Missing explicit production MegaFrame publishable key");
const source=readFileSync(join(root,"staging","studio-access","index.html"),"utf8");
if(!source.includes('publishableKey: ""'))throw Error("Launcher config drift");
const officialNavCss=readFileSync(join(root,"staging","studio-access","unified-navigation.css"),"utf8")
 .replace("./official/four-apps.png","data:image/png;base64,"+
   readFileSync(join(root,"staging","studio-access","official","four-apps.png")).toString("base64"));
const officialNavJs=readFileSync(join(root,"staging","studio-access","unified-navigation.js"),"utf8")
 .replace('const BRAND_SRC = "./official/branchline.png";',
   'const BRAND_SRC = "data:image/png;base64,'+
   readFileSync(join(root,"staging","studio-access","official","branchline.png")).toString("base64")+'";');
const launcher=source
 .replace("— PTG Protected Launch (STAGING ONLY)","— Branchline protected access")
 .replace("MegaFrame Studio — development preview","MegaFrame Studio — Branchline protected editor")
 .replace('publishableKey: ""',"publishableKey: "+JSON.stringify(publishableKey));
const bundledLauncher=launcher
 .replace('<link rel="stylesheet" href="./unified-navigation.css">','<style>'+officialNavCss+'</style>')
 .replace('<script src="./unified-navigation.js" defer></script>','<script>'+officialNavJs.replace(/<\\/script/gi,'<\\\\/script')+'</script>');
if(bundledLauncher===launcher || bundledLauncher.includes('src="./unified-navigation.js"'))
 throw Error("Official app rail must be inline in the editor-free public launcher");
if(/PRIVATE MEGAFRAME EDITOR BUNDLE|id="photosInput"|<canvas/.test(bundledLauncher))
 throw Error("Editor bytes are not allowed in public launcher");
mkdirSync(join(target,"studio"),{recursive:true});
writeFileSync(join(target,"studio","index.html"),bundledLauncher);
for(const asset of ["launch.js","draft-vault.js","central-drive.js"])
 copyFileSync(join(root,"staging","studio-access",asset),join(target,"studio",asset));

console.log("Created DEVELOPMENT cutover preview only; Pages production untouched.");
