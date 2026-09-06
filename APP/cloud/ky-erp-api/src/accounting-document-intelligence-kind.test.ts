import test from "node:test";
import assert from "node:assert/strict";
import { compareAccountingExtractions, extractAccountingLot, inferAccountingDocumentKind, scoreAccountingExtraction, selectAccountingExtraction } from "./accounting-document-intelligence.ts";

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


test("OCR metnindeki LOT bilgisini ayırır", () => {
  assert.equal(extractAccountingLot("WHITE PIGMENT LOT NO: LOT-260906-A"), "LOT-260906-A");
  assert.equal(extractAccountingLot("Ürün X Parti: BATCH_44/2"), "BATCH_44/2");
});


test("OCR kalite skoru kritik alanları ödüllendirir", () => {
  const strong = scoreAccountingExtraction({
    extractionConfidence: 0.9,
    documentNo: "FTR-1",
    partyTaxNo: "1234567890",
    issueDate: "2026-09-06",
    payableTotal: 1200,
    partyName: "Firma",
    lines: [{ description: "Ürün" }],
  });
  const weak = scoreAccountingExtraction({ extractionConfidence: 0.4, lines: [] });
  assert.ok(strong > weak);
  assert.ok(strong >= 80);
});

test("kritik OCR uyuşmazlığını manuel kontrole yollar", () => {
  const primary = {
    extractionConfidence: 0.72,
    documentNo: "FTR-100",
    partyTaxNo: "1234567890",
    issueDate: "2026-09-06",
    payableTotal: 1000,
    taxTotal: 180,
    partyName: "Firma A",
    lines: [{ description: "Ürün" }],
  };
  const secondary = {
    extractionConfidence: 0.82,
    documentNo: "FTR-101",
    partyTaxNo: "1234567890",
    issueDate: "2026-09-06",
    payableTotal: 1250,
    taxTotal: 180,
    partyName: "Firma A",
    lines: [{ description: "Ürün" }],
  };
  const discrepancies = compareAccountingExtractions(primary, secondary);
  assert.ok(discrepancies.some((row) => row.code === "DOCUMENT_NO_MISMATCH" && row.severity === "ERROR"));
  assert.ok(discrepancies.some((row) => row.code === "PAYABLE_TOTAL_MISMATCH" && row.severity === "ERROR"));
  const selected = selectAccountingExtraction(primary, secondary);
  assert.equal(selected.needsManualReview, true);
});

test("daha yüksek kaliteli secondary OCR sonucu seçilebilir", () => {
  const primary = { extractionConfidence: 0.35, documentNo: "", issueDate: "", payableTotal: 0, lines: [] };
  const secondary = {
    extractionConfidence: 0.88,
    documentNo: "FTR-200",
    partyTaxNo: "1234567890",
    issueDate: "2026-09-06",
    payableTotal: 900,
    partyName: "Firma",
    lines: [{ description: "Hizmet" }],
  };
  const selected = selectAccountingExtraction(primary, secondary);
  assert.equal(selected.fallbackSelected, true);
  assert.equal(selected.documentNo, "FTR-200");
});
