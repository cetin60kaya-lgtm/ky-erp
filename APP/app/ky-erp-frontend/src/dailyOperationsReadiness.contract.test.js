import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const src=p=>readFileSync(new URL(p,import.meta.url),"utf8");
test("Daily screens keep active tenant and do not present failed sources as zero",()=>{const d=src("./pages/desen/DesenModelMasasi.jsx"),b=src("./pages/boyahane/workflow/BoyahaneDashboardCompactPage.jsx");assert.match(d,/inboxState==="success"\?value:"—"/);assert.match(d,/seq!==requestSeq.current/);assert.match(b,/verified\("jobs"\)\?openJobs.length:"—"/);assert.match(b,/Europe\/Istanbul/);assert.match(b,/\[productions,day\]/);assert.doesNotMatch(b,/HAKAN EMPRİME BOYAHANE|row.jobId \|\| row.modelSnapshot/);for(const p of ["./pages/desen/DesenPage.jsx","./pages/boyahane/BoyahanePage.jsx","./pages/modules/UretimPage.jsx"])assert.match(src(p),/key=\{tenantKey/);});
test("Integration status requires nonempty WSDL and invalidates prior requests",()=>{assert.match(src("./pages/modules/muhasebe/IsnetOfficeStatus.jsx"),/services\?\.length>0/);assert.match(src("./pages/modules/muhasebe/EBelgeCenterPage.jsx"),/dashboardRequestSeq.current \+= 1; integrationRequestSeq.current \+= 1/);});
