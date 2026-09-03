import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
const here=dirname(fileURLToPath(import.meta.url));
const frontend=(name:string)=>readFileSync(resolve(here,"../../../app/ky-erp-frontend/src",name),"utf8");
const storage=frontend("pages/admin/AdminStorageCenter.jsx"),css=frontend("pages/admin/AdminStorageCenter.css"),page=frontend("pages/modules/DepolamaPage.jsx");

test("File Hub screen uses current admpro design system instead of orphaned admin classes",()=>{assert.match(storage,/AdminStorageCenter\.css/);assert.match(storage,/admpro-page storage-page/);assert.doesNotMatch(storage,/className="admin-management-page"/);assert.doesNotMatch(storage,/className="admin-stat-grid"/);assert.match(css,/\.storage-hero/);assert.match(css,/\.storage-steps/);assert.match(css,/\.storage-map/)});

test("all six storage workspaces remain reachable",()=>{for(const token of ["depolama-genel","depolama-kaynaklar","depolama-atamalar","depolama-dosyalar","depolama-senkronizasyon"])assert.match(storage,new RegExp(token));assert.match(page,/depolama-yedekleme/)});

test("storage overview exposes setup progress and health",()=>{for(const label of ["Aktif Kaynak","Dosya İndeksi","Bölüm Ataması","Çevrimiçi Agent","Firma Depolama Haritası","Sağlık ve Uyarılar"])assert.match(storage,new RegExp(label));assert.match(storage,/setupSteps/);assert.match(storage,/missingCount/);assert.match(storage,/unmatchedCount/)});

test("connection and binding centers cover every provider and business module",()=>{for(const provider of ["GOOGLE_DRIVE","ONEDRIVE","SHAREPOINT","LOCAL_FOLDER","NAS"])assert.match(storage,new RegExp(provider));for(const module of ["DESEN","IMALAT","BOYAHANE","MUHASEBE","ISNET","IK","DTF","STOK"])assert.match(storage,new RegExp(module));assert.match(storage,/Bölüm → Dosya Türü → Depolama/)});

test("agent credential management is tenant scoped and one-time secret aware",()=>{assert.match(storage,/\/file-hub\/agent-credential/);assert.match(storage,/\/file-hub\/agent-credential\/rotate/);assert.match(storage,/mainCompanySlug:slug/);assert.match(storage,/Bu anahtar yalnız şimdi gösterilir/);assert.match(storage,/Anahtarı Kopyala/)});

test("file index keeps search status relation and provider visibility",()=>{assert.match(storage,/Dosya, model veya yol ara/);assert.match(storage,/Tüm Durumlar/);assert.match(storage,/relation_count/);assert.match(storage,/providerLabel\(row\.provider_type\)/);assert.match(storage,/relative_path/)});
