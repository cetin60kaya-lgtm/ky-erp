import test from "node:test";
import assert from "node:assert/strict";
import {xlsxReportBytes,reportCsv,reportFileName} from "./reportExports.js";
test("genuine ZIP-based Excel starts with PK and contains sheet XML",()=>{
 const zip=xlsxReportBytes(["Personel","Maaş","İmza"],[{
  "Personel":"İrem & Çetin","Maaş":"55000","İmza":""}]);
 assert.ok(zip instanceof Uint8Array);
 assert.deepEqual([...zip.slice(0,4)],[80,75,3,4]);
 const decoded=new TextDecoder().decode(zip);
 assert.match(decoded,/\[Content_Types\]\.xml/);
 assert.match(decoded,/xl\/worksheets\/sheet1\.xml/);
 assert.match(decoded,/İrem &amp; Çetin/);
});
test("Excel injection stays inline text and CSV is hardened",()=>{
 const cells=[{"Personel":"=HYPERLINK(\"evil\")","Yemek":"+400"}];
 const xlsx=new TextDecoder().decode(xlsxReportBytes(["Personel","Yemek"],cells));
 assert.match(xlsx,/t="inlineStr"/);
 assert.doesNotMatch(xlsx,/<f>/);
 assert.match(reportCsv(["Personel","Yemek"],cells),/"'=HYPERLINK/);
 assert.match(reportCsv(["Personel","Yemek"],cells),/"'\+400"/);
});
test("report formats and ranges validated",()=>{
 assert.equal(reportFileName("signatures",2026,9,"xlsx"),"KY_PDKS_signatures_2026-09.xlsx");
 assert.throws(()=>reportFileName("signatures",2026,9,"xls"),/FORMAT_INVALID/);
 assert.throws(()=>xlsxReportBytes([],[]),/KAPSAM_GECERSIZ/);
});
