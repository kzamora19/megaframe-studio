// DEVELOPMENT: build an additive, non-deployed shadow preview.
// Original public editor, PWA service worker and assets stay byte-identical.
// The /studio/ launcher contains no editor source and requires PTG authorization.
import {mkdtempSync,mkdirSync,cpSync,rmSync,existsSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const output=resolve(process.argv[2]||join(root,"staging",".shadow-pages"));
// Restrict removal/copy operations to explicitly named disposable preview
// folders. No run may delete an arbitrary path, repository root or live source.
const approved=(output.startsWith(join(root,"staging",".shadow-"))||
 output.startsWith(join(tmpdir(),"branchline-shadow-artifact-")));
if(!approved)throw Error("Shadow output must be an approved disposable directory");
if(process.env.PTG_STUDIO_SHADOW_PREVIEW!=="1")
 throw Error("Shadow build requires explicit PTG_STUDIO_SHADOW_PREVIEW=1");
if(output===root||output===join(root,"_site")||output===join(root,"icons")||
 output.startsWith(join(root,"_site")+"/"))
 throw Error("Refusing to overwrite public MegaFrame deployment inputs");
if(!/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(process.env.MEGAFRAME_STUDIO_PUBLISHABLE_KEY||""))
 throw Error("Shadow launcher requires the actual public MegaFrame publishable key");
const temp=mkdtempSync(join(root,"staging",".shadow-build-"));
try {
 const publicSite=join(temp,"public"),protectedCutover=join(temp,"cutover");
 execFileSync("python3",[join(root,"scripts/build_pages_site.py"),publicSite],{cwd:root,stdio:"pipe"});
 execFileSync(process.execPath,[join(root,"staging/build-cutover-pages.mjs"),protectedCutover],{
   cwd:root,stdio:"pipe",env:{...process.env,PTG_STUDIO_CUTOVER_PREVIEW:"1",
     PTG_STUDIO_PRODUCTION_RELEASE:"0"}
 });
 if(!existsSync(join(protectedCutover,"studio","launch.js")))
   throw Error("Private editor launcher missing from protected preview");
 // The ONLY addition over the existing deployed editor files is /studio/.
 if(existsSync(join(publicSite,"studio")))throw Error("Public baseline already contains studio route");
 rmSync(output,{recursive:true,force:true});
 cpSync(publicSite,output,{recursive:true});
 cpSync(join(protectedCutover,"studio"),join(output,"studio"),{recursive:true});
 const entry=readFileSync(join(output,"studio","index.html"),"utf8");
 if(!entry.includes("MEGAFRAME_STUDIO_PRIVATE_CONFIG")||
   !entry.includes(process.env.MEGAFRAME_STUDIO_PUBLISHABLE_KEY)||
   entry.includes("<!-- PRIVATE MEGAFRAME EDITOR BUNDLE"))
   throw Error("Shadow launcher is missing a public config or embeds private editor bytes");
 console.log("Shadow-only MegaFrame artifact created. Original editor/PWA remains byte-identical. NOT DEPLOYED.");
} finally {rmSync(temp,{recursive:true,force:true});}
