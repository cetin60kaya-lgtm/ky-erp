import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const code=readFileSync(new URL("./ik-personnel-media.ts",import.meta.url),"utf8");
test("İK fotoğrafı firma kimliği yalnız imzalı oturumdan alınır",()=>{
 assert.match(code,/user\.mainCompanySlug \|\| user\.main_company_slug \|\| user\.security\?\.main_company_slug/);
 assert.match(code,/if \(!company \|\| \(requestedCompany && requestedCompany !== company\)\) return null;/);
 assert.doesNotMatch(code,/DEFAULT_COMPANY/);
});
test("fotoğraf okuma, yazma ve silme aynı korumalı company ve personel kimliğine bağlı",()=>{
 assert.match(code,/\.bind\(company, employeeId\)/);
 assert.match(code,/\.bind\(auth\.company, employeeId\)/);
 assert.match(code,/if \(!auth\) return error\(c, 401/);
 assert.match(code,/PHOTO_TYPE_INVALID/);
 assert.match(code,/PHOTO_SIZE_INVALID/);
});
