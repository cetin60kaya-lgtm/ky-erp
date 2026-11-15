import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const panel=readFileSync(new URL("./ModelDocumentCenter.jsx",import.meta.url),"utf8");
const modal=readFileSync(new URL("../../pages/desen/DesenWorkflowShared.jsx",import.meta.url),"utf8");
const files=readFileSync(new URL("./ModelFilesPanel.jsx",import.meta.url),"utf8");
const css=readFileSync(new URL("./modelDocumentCenter.css",import.meta.url),"utf8");
test("Model kartı açıldığında bütün dosyalar ilk sekmede görünür",()=>{
 assert.match(modal,/const \[tab, setTab\] = useState\("files"\)/);
 assert.match(modal,/\["files", "Tüm Dosyalar"\]/);
 assert.match(modal,/<ModelDocumentCenter modelId=\{model\.id\}/);
 assert.match(modal,/<ModelFilesPanel modelId=\{model\.id\}/);
 assert.match(files,/<details className="ky-model-files-list" defaultOpen>/);
});
test("Gelen giden dört belge ayrı filtre ve tek model kartında XML PDF indirme sunar",()=>{
 assert.match(panel,/Gelen İrsaliye/);
 assert.match(panel,/Giden İrsaliye/);
 assert.match(panel,/Gelen Fatura/);
 assert.match(panel,/Giden Fatura/);
 assert.match(panel,/XML bekleniyor/);
 assert.match(panel,/PDF bekleniyor/);
 assert.match(panel,/download\(doc,"XML"\)/);
 assert.match(panel,/download\(doc,"PDF"\)/);
 assert.match(panel,/Drive yolu:/);
 assert.match(panel,/RELATED_DOCUMENT/);
});
test("Bir belge birden fazla modelle sadece ilişkilendirilir, kopyalanmaz",()=>{
 assert.match(panel,/modelIds:additional/);
 assert.match(panel,/link/);
 assert.match(panel,/Belgeyi Seçili Modellerle İlişkilendir/);
 assert.match(panel,/Dosyalar fiziksel olarak taşınmaz/);
 assert.match(panel,/apiPost/);
 assert.doesNotMatch(panel,/apiUpload|uploadFile|deleteFile|removeFile/);
});
test("Dar ekranda belge kartları alt alta açılır ve erişilebilir kontroller vardır",()=>{
 assert.match(css,/@media\(max-width:760px\)/);
 assert.match(panel,/aria-label="Model kartı tüm e-Belge dosyaları"/);
 assert.match(panel,/role="alert"/);
 assert.match(panel,/role="status"/);
});
