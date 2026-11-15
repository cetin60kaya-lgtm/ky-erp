import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {getIsnetConnectionModePreference,saveIsnetConnectionModePreference} from "./isnetConnectionModePreference.js";
const connection=readFileSync(new URL("./EBelgeIntegrationsWorkspace.jsx",import.meta.url),"utf8");
const center=readFileSync(new URL("./EBelgeIntegrationTestCenter.jsx",import.meta.url),"utf8");
const manager=readFileSync(new URL("./EBelgeAdapterManager.jsx",import.meta.url),"utf8");
test("Chrome oturum tercihi sadece tenant ve yöntem tutar; eski portal tercihi Chrome'a göçer",()=>{
 const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
 assert.equal(saveIsnetConnectionModePreference("a","browser",storage),true);
 assert.equal(getIsnetConnectionModePreference("a",storage),"browser");
 assert.equal(getIsnetConnectionModePreference("b",storage),null);
 assert.equal(getIsnetConnectionModePreference("legacy",{getItem:()=> "portal"}),"browser");
 assert.equal(saveIsnetConnectionModePreference("a","portal",storage),false);
 assert.deepEqual([...memory.values()],["browser"]);
});
test("Chrome girişinde Cloudflare portal login denemesi yok; İşNet portalı yeni sekmede açılıyor",()=>{
 assert.match(connection,/getIsnetConnectionModePreference\(tenant\) \|\| "browser"/);
 assert.match(connection,/connection\.connectionMode==="browser" \? <div className="ism-chrome-flow"/);
 assert.match(connection,/href="https:\/\/nettefatura\.isnet\.net\.tr\//);
 assert.match(connection,/target="_blank" rel="noopener noreferrer"/);
 assert.match(connection,/if \(busy \|\| connection\.connectionMode === "browser"\) return/);
 assert.match(connection,/\{connection\.connectionMode!=="browser"&&<>/);
 assert.doesNotMatch(connection,/<option value="portal">/);
});
test("Chrome'dan indirilen XML/PDF belge test merkezinde yerel incelenir, API sorgusu Chrome modunda kapalıdır",()=>{
 assert.match(center,/const chromeMode=key==="ISNET"&&getIsnetConnectionModePreference\(tenant\)!=="api"/);
 assert.match(center,/remoteAllowed=available&&!chromeMode/);
 assert.match(center,/\{key==="ISNET"&&chromeMode&&<div className="itc-chrome"/);
 assert.match(center,/\{key==="ISNET"&&!chromeMode&&<div className="itc-remote"/);
 assert.match(center,/Yerel XML \/ PDF Dosyası/);
 assert.match(center,/if\(data\.kind!==\(t\.kind==="invoice"\?"INVOICE":"DISPATCH"\)\)/);
 assert.match(center,/parseUblForVisualOutput/);
 assert.match(center,/getEBelgeVisualProfiles/);
 assert.match(center,/renderUblOutput/);
 assert.match(manager,/onOpenDocumentTest=\{\(\)=>setPanel\("test"\)\}/);
});
test("Güvenlik: Chrome oturumu KY ERP'ye aktarılmaz; API opsiyonel kalır",()=>{
 assert.match(connection,/otomatik XML çekme bu modda aktif değildir/i);
 assert.match(connection,/İşNet API · resmî yetkiyle otomatik senkronizasyon/);
 assert.doesNotMatch(connection,/document\.cookie|chrome\.cookies|localStorage\.setItem\(["']token/i);
 assert.doesNotMatch(center,/chrome\.cookies|document\.cookie|postMessage\(.*cookie/);
});
