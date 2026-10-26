import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const frontend=new URL("../../",import.meta.url);
const read=(p)=>readFileSync(new URL(p,frontend),"utf8");
const host=readFileSync(new URL("../../../../cloud/ky-erp-security-host/worker.js",import.meta.url),"utf8");
const preparer=readFileSync(new URL("../../../../cloud/ky-erp-security-host/prepare-assets.mjs",import.meta.url),"utf8");

test("one existing PWA ID, push channel and trusted-device database own the full PRO ERP",()=>{
 const manifest=JSON.parse(read("public/guvenlik/manifest.webmanifest"));
 const html=read("public/guvenlik/index.html");
 const pro=read("pro.html");
 assert.equal(manifest.id,"/guvenlik/");
 assert.equal(manifest.scope,"/guvenlik/");
 assert.equal(manifest.start_url,"/guvenlik/");
 assert.equal(manifest.short_name,"KY ERP PRO");
 assert.match(html,/href="\/guvenlik\/pro\/"/);
 assert.match(pro,/href="\/guvenlik\/manifest\.webmanifest"/);
 assert.doesNotMatch(pro,/href="\/manifest\.webmanifest"/);
 assert.match(read("public/guvenlik/app.js"),/DB_NAME="kyerp-security-fresh-v3"/);
 assert.match(read("public/guvenlik/app.js"),/CLIENT_VERSION="security-v4\.0"/);
 assert.match(read("public/guvenlik/sw.js"),/const APP_URL="\/guvenlik\/"/);
});

test("full canonical modules are compiled and served on the same Security Worker origin",()=>{
 const main=read("src/pro/main.jsx");
 const registry=read("src/app/moduleRegistry.js");
 const app=read("src/AppV3.jsx");
 assert.match(main,/import\("\.\.\/AppV3\.jsx"\)/);
 assert.match(main,/MODULES,getModuleTabs/);
 assert.match(main,/module\.key,tab\[0\]/);
 assert.match(main,/hasModule\(m\.permissionKey/);
 assert.match(main,/AuthProvider/);
 assert.match(main,/LoginPage/);
 assert.match(registry,/export function getModuleTabs/);
 assert.match(app,/pathForCanonicalModule\(window\.location\.pathname\)/);
 assert.match(app,/PRO_MOBILE_PREFIX="\/guvenlik\/pro"/);
 assert.match(host,/const PRO_PREFIX="\/guvenlik\/pro"/);
 assert.match(host,/PRO_PREFIX\+"\/index\.html"/);
 assert.match(preparer,/dist-security-pro/);
 assert.match(preparer,/join\(destination,"index\.html"\)/);
 assert.doesNotMatch(main,/<iframe/);
});

test("build gets a second ENTRY, not a second installable APP",()=>{
 const vite=read("vite.config.js");
 assert.match(vite,/KYERP_SECURITY_PRO_BUILD/);
 assert.match(vite,/\/guvenlik\/pro\//);
 assert.match(vite,/dist-security-pro/);
 assert.match(vite,/publicDir: unifiedProBuild\?false/);
 assert.match(read("pro.html"),/KY ERP PRO v4\.2\.0/);
 assert.match(read("public/guvenlik/index.html"),/KY ERP PRO v4\.2\.0/);
});

test("owner and restricted company roles use canonical module RBAC and no client-only elevation",()=>{
 const main=read("src/pro/main.jsx");
 assert.match(main,/OWNER_ROLES/);
 assert.match(main,/hasModule/);
 assert.match(main,/MODULES\.filter/);
 assert.doesNotMatch(main,/localStorage\.setItem\("role"|ownerControlAuthorized\s*=\s*true/);
 assert.match(read("src/context/AuthContext.jsx"),/MODULE_KEYS/);
 assert.match(read("src/AppV3.jsx"),/visibleModules/);
});
