import test from "node:test";
import assert from "node:assert/strict";
import { inferAccountingDocumentKind } from "./accounting-document-intelligence.ts";

test("AUTO tarama irsaliye metnini irsaliye olarak tanır", () => {
  assert.equal(
    inferAccountingDocumentKind("E-İRSALİYE\nSevk İrsaliyesi No: IRS20260001\nİrsaliye Tarihi: 06.09.2026", "AUTO"),
    "IRSALIYE",
  );
});

test("AUTO tarama fatura metnini fatura olarak tanır", () => {
  assert.equal(
    inferAccountingDocumentKind("E-FATURA\nFatura No: FTR20260001\nÖdenecek Tutar: 12.500,00 TL", "AUTO"),
    "FATURA",
  );
});

test("kullanıcının açık belge türü AUTO tespitini ezer", () => {
  assert.equal(inferAccountingDocumentKind("E-FATURA", "IRSALIYE"), "IRSALIYE");
  assert.equal(inferAccountingDocumentKind("SEVK IRSALIYESI", "FATURA"), "FATURA");
});
