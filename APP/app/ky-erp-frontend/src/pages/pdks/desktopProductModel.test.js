import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {inspectProductModel,PRODUCT_SECTIONS,ALL_PRODUCT_TABS} from "./desktopProductModel.js";

const read = (path)=>readFileSync(new URL(path,import.meta.url),"utf8");

test("Masaüstü PDKS: 9 ana bölüm ve 49 benzersiz sekme",()=>{
  const result=inspectProductModel();
  assert.equal(result.sections,9);
  assert.equal(result.tabs,49);
  assert.deepEqual(result.duplicateSections,[]);
  assert.deepEqual(result.duplicateTabs,[]);
  assert.deepEqual(result.unsupportedViews,[]);
  assert.deepEqual(result.missingColumns,[]);
  assert.equal(PRODUCT_SECTIONS.some((item)=>item.id==="devices"),true);
  assert.equal(ALL_PRODUCT_TABS.some((item)=>item.id==="terminals"),true);
});

test("Web PDKS mevcut işlemleri korur; özel günlük seri giriş bileşenine dokunmaz",()=>{
  const page=read("../modules/PdksPage.jsx");
  const menu=read("./PdksDesktopNavigation.jsx");
  assert.match(page,/PdksDesktopNavigation/);
  assert.match(page,/PdksLiveHome/);
  assert.match(page,/PdksPersonnelDesk/);
  assert.match(page,/PdksDeviceCenter/);
  assert.match(menu,/disabled=\{!allowed\}/);
  const app=read("../../AppV3.jsx");
  assert.match(app,/DailyHrWorkspace activeTab=\{activeTab\}/);
});

test("İK tüm personelin ana kaynağı, PDKS cihazı yalnız SGK ve kart eşleşmesi",()=>{
  const pdksApi=read("../../services/pdksApi.js");
  assert.match(pdksApi,/payload\.filter\(isSgkPdksPerson\)/);
  const cloud=read("../../../../cloud/ky-erp-api/src/ik-pdks-device.ts");
  assert.match(cloud,/AND UPPER\(TRIM\(COALESCE\(e\.sgk_status,'YOK'\)\)\)='VAR'/);
  assert.match(cloud,/AND COALESCE\(s\.sgk_follow,0\)<>0/);
});
