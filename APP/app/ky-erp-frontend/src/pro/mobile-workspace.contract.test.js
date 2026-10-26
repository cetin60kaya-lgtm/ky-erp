import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const here=dirname(fileURLToPath(import.meta.url));
const read=relative=>readFileSync(resolve(here,relative),"utf8");

test("one installed PRO PWA reuses the canonical modules, not a parallel mobile backend",()=>{
 const app=read("./main.jsx");
 assert.match(app,/const PRO_PREFIX="\/guvenlik\/pro"/);
 assert.match(app,/const LazyWorkspace=React\.lazy/);
 assert.match(app,/import\("\.\.\/AppV3\.jsx"\)/);
 assert.match(app,/import\{MODULES,getModuleTabs\}from"\.\.\/app\/moduleRegistry"/);
 assert.doesNotMatch(app,/MobileApp|mobileApi|second-pwa/i);
});

test("Android PRO has module-aware one-handed navigation that follows in-app route changes",()=>{
 const app=read("./main.jsx");
 const workspace=read("../AppV3.jsx");
 const mobileCss=read("./pro-mobile-workspace.css");
 assert.match(app,/function ProWorkspaceToolbar\(\)/);
 assert.match(app,/getModuleTabs\(module\)/);
 assert.match(app,/aria-current=\{tab\[0\]===currentTab\[0\]\?"page":undefined\}/);
 assert.match(app,/addEventListener\("kyerp:route-change",sync\)/);
 assert.match(workspace,/if \(prefix\) window\.dispatchEvent\(new CustomEvent\("kyerp:route-change"/);
 assert.match(app,/className="ky-pro-workspace-toolbar"/);
 assert.match(mobileCss,/\.ky-pro-workspace-toolbar\[hidden\]\{display:none!important\}/);
 assert.match(mobileCss,/\.ky-pro-module-context\[data-module="gunluk-operasyon"\]/);
 assert.match(mobileCss,/\.ky-pro-module-context\[data-module="desen"\]/);
});

test("Phone workspace is width-bounded; scroll remains inside relevant panels",()=>{
 const css=read("./pro-mobile-workspace.css");
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(css,/\.ky-pro-app \.shell-v3-workspace/);
 assert.match(css,/overflow-x:hidden!important;overflow-y:auto!important/);
 assert.match(css,/\.ky-pro-workspace-content>\.shell-v3 \.shell-v3-tabs-bar/);
 assert.match(css,/\.ky-pro-app \.gop-quick-dialog/);
 assert.match(css,/\.ky-pro-app \.kyop-manual-range input\[type="date"\]/);
 assert.match(css,/\.ky-pro-app \.kyop-grid/);
 assert.match(css,/\.ky-pro-app \.shell-v3-workspace :is\(\.bh-form-grid/);
});

test("One-PWA release still has a separate Security Worker build and must be gated",()=>{
 const vite=read("../../vite.config.js");
 const pro=read("./main.jsx");
 assert.match(vite,/KYERP_SECURITY_PRO_BUILD/);
 assert.match(vite,/dist-security-pro/);
 assert.match(pro,/import "\.\/pro-mobile-workspace\.css"/);
});
