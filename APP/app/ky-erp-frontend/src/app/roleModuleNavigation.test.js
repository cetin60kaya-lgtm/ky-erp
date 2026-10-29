import {test} from "node:test";
import assert from "node:assert/strict";
import {roleModules} from "./roleModuleNavigation.js";
test("Firma Sahibi yalnız kendisine ait doğru isimli 4 yönetim işlemine gider",()=>{
 const modules=[{key:"admin",label:"Platform Yönetimi",groups:[{tabs:[["admin-sistem","Uygulama Ayarları"]]}],hiddenTabs:[["uygulama-sahibi","Süper Yönetici"]]}, {key:"ik",label:"İK"}];
 const company=roleModules(modules,"COMPANY_ADMIN");
 assert.equal(company[0].label,"Firma Yönetimi");
 assert.deepEqual(company[0].groups[0].tabs.map(([key,label])=>[key,label]),[
  ["admin-yonetim-ozeti","Firma Özeti"],["kullanicilar","Kullanıcılar"],
  ["admin-guvenlik","Güvenlik Merkezi"],["admin-sistem","Firma Yetkileri"]
 ]);
 assert.deepEqual(company[0].hiddenTabs,[]);
 assert.equal(company[1],modules[1]);
 assert.equal(roleModules(modules,"SUPER_ADMIN"),modules);
});
