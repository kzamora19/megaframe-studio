"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const {inspect,restartPath}=require("../studio/updates/check.js");
const release=JSON.parse(read("studio/updates/release.json"));
test("module release is production-only, scoped and monotonic",()=>{
 assert.equal(inspect(release,release.sequence),"current");
 assert.equal(inspect({...release,sequence:release.sequence+1},release.sequence),"available");
 for(const data of [null,{}, {...release,app:"sales"}, {...release,channel:"staging"}, {...release,sequence:release.sequence-1}, {...release,sequence:""+release.sequence}])assert.equal(inspect(data,release.sequence),"invalid");
 assert.equal(restartPath("/branchline/"),null);
 assert.equal(restartPath("/megaframe-studio/studio/"),"/megaframe-studio/studio/");
});
test("protected entry stamps match and fresh authorization is required after restart",()=>{
 const html=read("studio/index.html");
 assert.ok(html.includes('data-sequence="'+release.sequence+'"'));
 assert.ok(html.includes('src="/megaframe-studio/studio/updates/check.js?v='+release.sequence+'"'));
 const code=read("studio/updates/check.js");
 assert.ok(code.includes('root.location.assign("/first-megasaver-ptg/studios/?studio=megaframe")'));
 assert.ok(!code.includes("location.hash"));
 assert.ok(!code.includes("contentWindow"));
});

test("mobile toolbar presentation retains every control and is applied after private integrity verification",()=>{
 const {apply}=require("../studio/device-layout.js");
 const raw='<!doctype html><body><!-- PRIVATE MEGAFRAME EDITOR BUNDLE --><header class="appbar"><div class="inline"><button id="newProject">New Project</button><button id="exitStudio">Exit</button></div></header></body></html>';
 const patched=apply(raw);assert.ok(patched.includes('id="bl-frame-device-layout"'));assert.equal(apply(patched),patched);
 assert.ok(patched.includes('<button id="newProject">New Project</button>'));assert.ok(patched.includes('<button id="exitStudio">Exit</button>'));
 assert.equal(apply("<body>unrecognized</body>"),"<body>unrecognized</body>");
 const launch=read("studio/launch.js");assert.ok(launch.indexOf("if (sha !== data.sha256)")<launch.indexOf("BranchlineFrameDeviceLayout?.apply(data.html)"));
 assert.ok(!launch.includes('allow-same-origin allow-scripts'));assert.ok(!read("studio/index.html").includes("PTG protected test access"));
});
