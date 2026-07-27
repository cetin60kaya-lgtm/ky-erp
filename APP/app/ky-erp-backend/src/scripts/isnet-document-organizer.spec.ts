import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { classifyDocument, explicitModelName, findDuplicates, parseUblXml, safeFileStem, scanFile, type ScanRow } from "./isnet-document-organizer";

const invoiceXml = `<?xml version="1.0"?><Invoice><ID>HKN20260001</ID><UUID>uuid-1</UUID><IssueDate>2026-07-19</IssueDate><AccountingSupplierParty><Party><PartyIdentification><ID>1234567890</ID></PartyIdentification><PartyName><Name>HKN</Name></PartyName></Party></AccountingSupplierParty><AccountingCustomerParty><Party><PartyIdentification><ID>9876543210</ID></PartyIdentification><PartyName><Name>Musteri</Name></PartyName></Party></AccountingCustomerParty><InvoiceLine><InvoicedQuantity>10</InvoicedQuantity><Item><Name>MODEL: MERVOD POLO 26K</Name></Item></InvoiceLine></Invoice>`;

test("XML uzantısı Windows tür açıklamasından bağımsız XML olarak ayrıştırılır", () => {
  const parsed = parseUblXml(invoiceXml);
  assert.equal(parsed.kind, "INVOICE");
  assert.equal(parsed.documentNo, "HKN20260001");
});

test("aynı temel adda PDF ve XML farklı uzantı oldukları için tekrar değildir", () => {
  const rows = [".pdf", ".xml"].map((extension) => ({ sourcePath: `C:\\x\\A${extension}`, extension, size: 1, sha256: "same", kind: "UNKNOWN", documentNo: "", uuid: "", issuer: "", receiver: "", classification: "UNKNOWN", model: "", proposedName: "", targetPath: "", action: "REPORT_ONLY", confidence: "LOW", warnings: [], duplicateOf: "" }) satisfies ScanRow);
  findDuplicates(rows);
  assert.equal(rows[0].duplicateOf, "");
  assert.equal(rows[1].duplicateOf, "");
});

test("aynı hash değerli iki PDF karantina adayıdır", () => {
  const base = { extension: ".pdf", size: 1, sha256: "same", kind: "UNKNOWN" as const, documentNo: "", uuid: "", issuer: "", receiver: "", classification: "UNKNOWN" as const, model: "", proposedName: "", targetPath: "", action: "REPORT_ONLY", confidence: "LOW" as const, warnings: [], duplicateOf: "" };
  const rows: ScanRow[] = [{ ...base, sourcePath: "C:\\x\\1.pdf" }, { ...base, sourcePath: "C:\\x\\2.pdf" }];
  findDuplicates(rows);
  assert.equal(rows[1].action, "QUARANTINE_CANDIDATE");
});

test("aynı belge numaralı farklı hash PDF otomatik tekrar değildir", () => {
  const first = { sourcePath: "C:\\x\\1.pdf", extension: ".pdf", size: 1, sha256: "one", kind: "UNKNOWN" as const, documentNo: "A", uuid: "", issuer: "", receiver: "", classification: "UNKNOWN" as const, model: "", proposedName: "", targetPath: "", action: "REPORT_ONLY", confidence: "LOW" as const, warnings: [], duplicateOf: "" };
  const second = { ...first, sourcePath: "C:\\x\\2.pdf", sha256: "two" };
  findDuplicates([first, second]);
  assert.equal(second.duplicateOf, "");
});

test("HKN alıcısı fatura tedarikçi faturasıdır", () => {
  const parsed = parseUblXml(invoiceXml);
  assert.equal(classifyDocument({ ...parsed, issuerTaxNo: "9876543210", receiverTaxNo: "1234567890" }, new Set(["1234567890"])), "SUPPLIER_INVOICE");
});

test("yasak karakterler dosya adından çıkarılır", () => assert.equal(safeFileStem('A/B:C*D?'), "A B C D"));

test("açık XML model etiketi temiz model adı üretir", () => assert.equal(explicitModelName("MODEL: MERVOD POLO 26K"), "MERVOD POLO"));

test("bozuk veya erişilemeyen XML hata satırı üretir", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "isnet-test-"));
  const filePath = path.join(directory, "broken.xml");
  writeFileSync(filePath, "not xml");
  const row = scanFile(filePath, new Set());
  rmSync(directory, { recursive: true, force: true });
  assert.equal(row.action, "ERROR");
});