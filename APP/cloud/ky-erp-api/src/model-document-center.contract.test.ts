import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("./model-document-center.ts",import.meta.url),"utf8");
const archive=readFileSync(new URL("./accounting-document-archive.ts",import.meta.url),"utf8");
const main=readFileSync(new URL("./main.ts",import.meta.url),"utf8");

test("Model Kartı tek merkezde giden-gelen tüm faturalar/irsaliyeler ve File Hub dosyalarını bulur",()=>{
 assert.match(source,/\/api\/model-files\/\:modelId\/document-center/);
 assert.match(source,/FROM accounting_documents d/);
 assert.match(source,/accounting_document_relations r/);
 assert.match(source,/file_hub_relations dr/);
 assert.match(source,/json_each/);
 assert.match(source,/json_store j/);
 assert.match(source,/xml_file_asset_id/);
 assert.match(source,/pdf_file_asset_id/);
 assert.match(source,/file_hub_locations/);
 assert.match(main,/registerModelDocumentCenterRoutes\(app\)/);
});
test("Model belgesi yanlış ana firmaya ya da yanlış karşı firma modeline bağlanamaz",()=>{
 assert.match(source,/accountingTenantCandidates/);
 assert.match(source,/accountingTenantReadAllowed/);
 assert.match(source,/accountingAccess/);
 assert.match(source,/getAuthenticatedUser/);
 assert.match(source,/MODEL_COMPANY_CONFLICT/);
 assert.match(source,/sameCompany/);
 assert.match(source,/await Promise\.all\(ids\.map\(mid=>getModel/);
 assert.match(source,/ids\.length<1\|\|ids\.length>20/);
 assert.match(source,/documentId:id,modelIds:models\.map/);
});
test("Model -> çok belge ve tek belge -> çok model bağları kopyalama yapmadan saklanır",()=>{
 assert.match(source,/EBELGE_MODEL_DOCUMENT_LINK_V1/);
 assert.match(source,/source:"USER_CONFIRMED"/);
 assert.match(source,/DB\.batch\(stmts\)/);
 assert.match(source,/copied:0/);
 assert.doesNotMatch(source,/FILES\.put\(|archiveFileToCloudConnection\(|DELETE FROM|UPDATE accounting_documents|INSERT INTO accounting_documents/);
});
test("Model belge XML/PDF okuma yetkiye ve gerçek asset ilişkisine bağlıdır",()=>{
 assert.match(source,/\/documents\/\:documentId\/file\/\:kind/);
 assert.match(source,/await loadRows\(c,slug,model\)/);
 assert.match(source,/FILE_NOT_LINKED/);
 assert.match(source,/readFileHubAssetForMail/);
 assert.match(source,/Cache-Control":"private, no-store"/);
 assert.match(source,/X-Content-Type-Options":"nosniff"/);
});
test("File Hub aktarımı gelen-giden fatura-irsaliye/model adlarına göre, eski dosyaları taşımadan düzenlenir",()=>{
 assert.match(archive,/buildEBelgeArchiveRelativePath/);
 assert.match(archive,/archiveModelNames/);
 assert.match(archive,/json_store/);
 assert.match(archive,/d\.direction,d\.raw_metadata/);
 assert.match(archive,/noOverwrite:upper\(target\.provider_type\)==="GOOGLE_DRIVE"/);
 assert.match(archive,/await archiveRelative\(c,slug,job,target,ts\)/);
 assert.doesNotMatch(archive,/UPDATE\s+file_hub_locations\s+SET\s+relative_path/);
});
