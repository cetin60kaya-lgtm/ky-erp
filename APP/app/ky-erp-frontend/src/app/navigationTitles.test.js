import assert from "node:assert/strict";
import { test } from "node:test";
import { breadcrumbTitles, workspaceTabTitle } from "./navigationTitles.js";
test("Başlıklar modül ve işlem adıyla eşlenir, tekrarlar kaldırılır",()=>{
 assert.equal(workspaceTabTitle("Ana Sayfa","Ana Sayfa"),"Ana Sayfa");
 assert.equal(workspaceTabTitle("Platform Yönetimi","Kullanıcılar"),"Platform Yönetimi · Kullanıcılar");
 assert.deepEqual(breadcrumbTitles("Muhasebe & Finans","Muhasebe","Firmalar & Cari"),["Muhasebe & Finans","Muhasebe","Firmalar & Cari"]);
 assert.deepEqual(breadcrumbTitles("Ana Sayfa","Ana Sayfa","Ana Sayfa"),["Ana Sayfa"]);
});
