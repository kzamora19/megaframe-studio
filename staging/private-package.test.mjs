import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, mkdtempSync, rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const script=fileURLToPath(new URL("./build-private-package.mjs",import.meta.url));
const root=fileURLToPath(new URL("../",import.meta.url));
test("private MegaFrame build leaves the public output editor-free", () => {
  const output=mkdtempSync(join(tmpdir(),"megaframe-private-poc-"));
  try {
    execFileSync(process.execPath,[script,output],{stdio:"pipe",timeout:30000});
    const manifest=JSON.parse(readFileSync(join(output,"manifest.json"),"utf8"));
    const editor=readFileSync(join(output,"private","studio.html"),"utf8");
    const publicEntry=readFileSync(join(output,"public","index.html"),"utf8");
    assert.equal(manifest.inlined.length,15);
    assert.ok(editor.length>75000);
    assert.ok(editor.startsWith("<!-- PRIVATE MEGAFRAME EDITOR BUNDLE."));
    assert.match(editor,/<script>/);
    assert.doesNotMatch(editor,/megaframe_named_projects_v1/, "The public named-project IndexedDB must be replaced in the private bundle");
    assert.match(editor,/project-list/, "Named projects use a protected parent vault bridge");
    assert.doesNotMatch(editor,/<script\s+src=["']\.\//);
    assert.doesNotMatch(editor,/<img[^>]+src=["']\.\//);
    assert.ok(publicEntry.length<1400);
    assert.doesNotMatch(publicEntry,/src=["']\.\/(?:editor|shared|sample_image|gold_image)/);
    assert.doesNotMatch(publicEntry,/<script/);
    assert.match(publicEntry,/PTG Creative Studios/);
    assert.match(readFileSync(join(root,".github/workflows/pages.yml"),"utf8"),
      /python3 scripts\/build_pages_site\.py _site/);
    assert.equal(readFileSync(join(root,"scripts/build_pages_site.py"),"utf8").includes("staging/build-private-package"),false);
  } finally { rmSync(output,{recursive:true,force:true}); }
});

test("private package builder refuses a public Pages output destination", () => {
  for(const destination of [join(root,"_site"),join(root,"_site","private")])
    assert.throws(() => execFileSync(process.execPath,[script,destination],{stdio:"pipe",timeout:30000}));
});
