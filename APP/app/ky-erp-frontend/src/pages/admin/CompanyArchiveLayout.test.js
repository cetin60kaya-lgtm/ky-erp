import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 ARCHIVE_SECTIONS,ARCHIVE_DEFAULT_BINDINGS,archiveAssignmentStatus,
 archiveBindingFor,archiveLayoutForSection
} from "./CompanyArchiveLayout.js";

test("tek ana kök 10 sade iş bölümünden oluşur; yerel Windows zorunlu değildir",()=>{
 assert.equal(ARCHIVE_SECTIONS.length,10);
 for(const section of ARCHIVE_SECTIONS){
  assert.ok(!section.path.startsWith("/")&&!section.path.includes(".."));
  assert.ok(!section.path.includes(":"));
 }
 assert.ok(ARCHIVE_SECTIONS.some(s=>s.key==="YONETIM"&&s.areas.includes("Loglar")));
 assert.ok(ARCHIVE_SECTIONS.some(s=>s.key==="DENETIM"&&s.areas.includes("MSDS")&&s.areas.includes("TDS")));
});
test("fatura ön eki değil belge türü ve modül kimliği kullanılır",()=>{
 assert.equal(archiveBindingFor("E_BELGE","E_DOCUMENT").rootPath,"MUHASEBE/e-Belgeler");
 assert.equal(archiveBindingFor("DESEN","MODEL_SOURCE").rootPath,"DESEN/Modeller");
 assert.equal(archiveBindingFor("BOYAHANE","MODEL_FORM").rootPath,"BOYAHANE/Model Formları");
 assert.equal(archiveBindingFor("PDKS","ATTENDANCE_REPORT").rootPath,"İK/İzin ve Puantaj");
 assert.equal(archiveBindingFor("YONETIM","SYSTEM_LOG").rootPath,"YÖNETİM/Loglar");
 const paths=ARCHIVE_DEFAULT_BINDINGS.map(x=>x.rootPath);
 assert.ok(!paths.some(x=>x.includes("HKN")||x.includes("DDM")));
});
test("kullanıcının özel ismi modül kimliğine göre korunur",()=>{
 const template=archiveBindingFor("DESEN","MODEL_IMAGE");
 const bindings=[{module_code:"DESEN",purpose_code:"MODEL_IMAGE",
  storage_connection_id:"owned-provider",root_path:"SANAT/GORSELLER",
  readEnabled:true,writeEnabled:false,syncEnabled:true}];
 const connections=[{id:"owned-provider",isActive:true}];
 const s=archiveAssignmentStatus(template,bindings,connections);
 assert.equal(s.state,"CONNECTED");assert.equal(s.rootPath,"SANAT/GORSELLER");
 assert.equal(s.customized,true);
 assert.equal(s.writeEnabled,false);
 assert.equal(archiveAssignmentStatus(template,bindings,[]).state,"NOT_CONNECTED");
});
test("her klasör yolunun bölümü belirli; çapraz firma veya disk yolu yok",()=>{
 const sectionPaths=ARCHIVE_SECTIONS.map(s=>s.path);
 for(const item of ARCHIVE_DEFAULT_BINDINGS){
  assert.ok(sectionPaths.some(x=>item.rootPath===x||item.rootPath.startsWith(x+"/")));
  assert.equal(ARCHIVE_DEFAULT_BINDINGS.filter(x=>x.moduleCode===item.moduleCode&&x.purposeCode===item.purposeCode).length,1);
 }
 assert.ok(archiveLayoutForSection(ARCHIVE_SECTIONS.find(s=>s.key==="BOYAHANE")).length>=3);
});
test("Yönetim içindeki klasör taslağı gerçek File Hub seçicisine bağlıdır, sahte transfer sunmaz",()=>{
 const page=readFileSync(new URL("./AdminStorageCenter.jsx",import.meta.url),"utf8");
 assert.match(page,/tab==="archive"/);
 assert.match(page,/openArchiveBinding\(template\)/);
 assert.match(page,/folderSelected:Boolean\(existing\)/);
 assert.match(page,/rootPath:existing \? \(existing\.root_path\|\|""\) : template\.rootPath/);
 assert.match(page,/Masaüstü kurulumu zorunlu değildir/);
 assert.doesNotMatch(page,/archiveLayoutForSection\(section\).*apiPost\(.*upload/s);
});

test("pasif sağlayıcı veya başka firma bağlantısı yanlışlıkla hazır sayılmaz",()=>{
 const template=archiveBindingFor("IK","PERSONNEL_DOCUMENT");
 const bindings=[{module_code:"IK",purpose_code:"PERSONNEL_DOCUMENT",
   storage_connection_id:"passive-drive",root_path:"İK/Personel Evrakları",
   readEnabled:true,writeEnabled:false,syncEnabled:false}];
 const disabled=[{id:"passive-drive",isActive:false}];
 const enabled=[{id:"passive-drive",isActive:true}];
 assert.equal(archiveAssignmentStatus(template,bindings,disabled).state,"NOT_CONNECTED");
 assert.equal(archiveAssignmentStatus(template,bindings,enabled).state,"CONNECTED");
 assert.equal(archiveAssignmentStatus(template,[],enabled).state,"NOT_CONNECTED");
});

test("okuması kapalı klasör kullanıma hazır sayılmaz",()=>{const t=archiveBindingFor("E_BELGE","E_DOCUMENT");assert.equal(archiveAssignmentStatus(t,[{module_code:"E_BELGE",purpose_code:"E_DOCUMENT",storage_connection_id:"c",root_path:"archive",readEnabled:false}],[{id:"c",isActive:true}]).state,"READ_DISABLED");});
