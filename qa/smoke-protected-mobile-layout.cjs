const assert=require("node:assert/strict");const {chromium}=require("playwright");const {apply}=require("../studio/device-layout.js");
(async()=>{const browser=await chromium.launch({headless:true});try{
for(const width of [320,390,600]){
 const page=await browser.newPage({viewport:{width,height:800}});
 const raw='<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body><!-- PRIVATE MEGAFRAME EDITOR BUNDLE --><header class="appbar"><div class="brand">MegaFrame Studio</div><div class="inline" style="width:190px"><button>New Project</button><button>Shared templates</button><button>Google Drive backup</button><button>Install app</button><button>Reload</button><button>Exit Studio</button></div></header></body></html>';
 await page.setContent(apply(raw));
 const boxes=await page.locator(".inline button").evaluateAll(a=>a.map(b=>{const r=b.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,width:r.width};}));
 assert.equal(boxes.length,6);assert.ok(boxes.every(b=>b.right<=width&&b.width>30));assert.ok(boxes.some((b,i)=>i&&b.y===boxes[i-1].y),"Multiple actions fill a row");
 await page.close();
}console.log("PASS responsive toolbar wraps without clipping at 320, 390, 600");}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
