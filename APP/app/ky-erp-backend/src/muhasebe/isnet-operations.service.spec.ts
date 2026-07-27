import assert from "node:assert/strict";
import test from "node:test";
import { IsnetOperationsService } from "./isnet-operations.service";

function createService(prisma: any = {}, documentIntake: any = {}) {
  return new IsnetOperationsService(
    prisma,
    documentIntake,
    { normalize: (value: unknown) => String(value || "").trim().toUpperCase() } as any,
    {} as any,
  );
}

function validSnapshot() {
  return {
    recipientName: "TAHA GİYİM", recipientTaxNo: "1234567890", dispatchNo: "IRS-1", dispatchDate: "2026-07-20",
    invoiceDate: "2026-07-21", currency: "TRY", scenario: "2", invoiceType: "1",
    subtotal: 100, vatTotal: 20, grandTotal: 120,
    lines: [{ description: "MODEL A", productName: "MODEL A", quantity: 10, unit: "67", unitPrice: 10, discountAmount: 0, subtotal: 100, vatRate: 20, vatAmount: 20, total: 120 }],
  };
}

test("fatura önizleme onayı olmadan İşNet taslağı başlatılmaz", async () => {
  const service = createService();
  await assert.rejects(
    service.createInvoiceFromDispatch("dispatch-1", {
      mainCompanySlug: "test-company",
      confirmed: true,
      previewApproved: false,
    }),
    /önizlemesi kullanıcı tarafından onaylanmalıdır/i,
  );
});

test("aynı firma için eşzamanlı ikinci senkronizasyon yeni işlem başlatmaz", async () => {
  const service = createService() as any;
  let calls = 0;
  let release: (value: any) => void = () => undefined;
  const gate = new Promise((resolve) => { release = resolve; });
  service.syncInternal = async () => {
    calls += 1;
    return gate;
  };
  const first = service.sync({ mainCompanySlug: "test-company" });
  const second = service.sync({ mainCompanySlug: "test-company" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  release({ success: true });
  assert.deepEqual(await Promise.all([first, second]), [{ success: true }, { success: true }]);
});

test("iki karakterden kısa model araması havuz sorgusu çalıştırmaz", async () => {
  const service = createService() as any;
  service.customerIntakeContext = async () => ({
    intake: { id: "intake-1", modelGuess: "", modelId: null },
    company: { id: "company-1", name: "Müşteri" },
  });
  const result = await service.modelSuggestions("intake-1", {
    mainCompanySlug: "test-company",
    search: "M",
  });
  assert.deepEqual(result.suggestions, []);
});

test("VKN farkı resmî gönderim doğrulamasını engeller", () => {
  const service = createService() as any;
  const actual = { ...validSnapshot(), recipientTaxNo: "9999999999" };
  assert.ok(service.compareInvoiceSnapshots(validSnapshot(), actual).some((item: any) => item.field === "recipientTaxNo"));
});

test("adet farkı resmî gönderim doğrulamasını engeller", () => {
  const service = createService() as any;
  const actual = validSnapshot();
  actual.lines = [{ ...actual.lines[0], quantity: 9 }];
  assert.ok(service.compareInvoiceSnapshots(validSnapshot(), actual).some((item: any) => item.field === "lines[0].quantity"));
});

test("fiyat KDV ve toplam farkları ayrı ayrı kaydedilir", () => {
  const service = createService() as any;
  const actual = validSnapshot();
  actual.lines = [{ ...actual.lines[0], unitPrice: 11, vatRate: 18, vatAmount: 19.8 }];
  actual.grandTotal = 119.8;
  const fields = service.compareInvoiceSnapshots(validSnapshot(), actual).map((item: any) => item.field);
  assert.ok(fields.includes("lines[0].unitPrice"));
  assert.ok(fields.includes("lines[0].vatRate"));
  assert.ok(fields.includes("grandTotal"));
});

test("son onay güvenlik metni olmadan kaydedilmez", async () => {
  const service = createService() as any;
  await assert.rejects(service.finalApproveInvoiceDraft("draft-1", { mainCompanySlug: "test-company", approved: true, confirmationText: "ONAYLA", expectedVersion: "v1" }), /FATURAYI GÖNDER/);
});

test("eski taslak sürümüyle son onay engellenir", async () => {
  const prisma = {
    isnetInvoiceDraftRequest: { findFirst: async () => ({ id: "draft-1", status: "VERIFIED", verificationDiff: [], draftVersion: "v2", expectedSnapshot: { localCompanyId: "company-1" } }) },
  };
  const service = createService(prisma) as any;
  await assert.rejects(service.finalApproveInvoiceDraft("draft-1", { mainCompanySlug: "test-company", approved: true, confirmationText: "FATURAYI GÖNDER", expectedVersion: "v1" }), /sürümü değişti/i);
});

test("VERIFY_PENDING işlem otomatik ikinci gönderim yapmaz", async () => {
  const prisma = { isnetInvoiceDraftRequest: { findFirst: async () => ({ id: "draft-1", status: "VERIFY_PENDING" }) } };
  const service = createService(prisma) as any;
  service.sendStagingInvoice = async () => { throw new Error("çağrılmamalı"); };
  await assert.rejects(service.submitOfficialInvoice("draft-1", { mainCompanySlug: "test-company" }, "user-1"), /otomatik ikinci gönderim/i);
});

test("gönderilmiş taslak ikinci kez portala gönderilmez", async () => {
  const row = { id: "draft-1", status: "SENT", lineAllocations: [], officialInvoiceNumber: "HKN1", officialUuid: "uuid-1" };
  const prisma = { isnetInvoiceDraftRequest: { findFirst: async () => row } };
  const service = createService(prisma) as any;
  service.sendStagingInvoice = async () => { throw new Error("çağrılmamalı"); };
  const result = await service.submitOfficialInvoice("draft-1", { mainCompanySlug: "test-company" }, "user-1");
  assert.equal(result.status, "SENT");
});

test("UUID ve fatura numarası XML içinden doğrulanır", () => {
  const service = createService() as any;
  const result = service.officialXmlIdentity(Buffer.from('<?xml version="1.0"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:ID>HKN2026001</cbc:ID><cbc:UUID>uuid-1</cbc:UUID></Invoice>'));
  assert.deepEqual(result, { invoiceNo: "HKN2026001", uuid: "uuid-1" });
});

test("resmî kimlikler olmadan arşivleme başlamaz", async () => {
  const prisma = { isnetInvoiceDraftRequest: { findFirst: async () => ({ id: "draft-1", status: "SENT" }) } };
  const service = createService(prisma);
  await assert.rejects(service.archiveInvoice({ mainCompanySlug: "test-company", draftId: "draft-1" }), /numarası ve UUID/i);
});

test("kısmi ve tam faturalama satır bazında hesaplanır", async () => {
  const created: any[] = [];
  const tx = { isnetInvoiceLineAllocation: { deleteMany: async () => ({}), createMany: async ({ data }: any) => { created.push(...data); } } };
  const prisma = { isnetInvoiceLineAllocation: { findMany: async () => [] }, $transaction: async (callback: any) => callback(tx) };
  const service = createService(prisma) as any;
  await service.reserveInvoiceLineAllocations("draft-1", "IRS-1", [{ id: "l1", quantity: 10 }, { id: "l2", quantity: 5 }], [{ quantity: 4, productName: "A" }, { quantity: 5, productName: "B" }]);
  assert.equal(created[0].status, "KISMI_FATURALANDI");
  assert.equal(created[0].remainingQuantity, 6);
  assert.equal(created[1].status, "TAM_FATURALANDI");
  assert.equal(created.length, 2);
});

test("önceki faturalanan adet kaynak adedi aşarsa yeni taslak engellenir", async () => {
  const prisma = {
    isnetInvoiceLineAllocation: { findMany: async () => [{ sourceLineKey: "l1", billedQuantity: 8 }] },
    $transaction: async () => { throw new Error("transaction çalışmamalı"); },
  };
  const service = createService(prisma) as any;
  await assert.rejects(service.reserveInvoiceLineAllocations("draft-2", "IRS-1", [{ id: "l1", quantity: 10 }], [{ quantity: 3, productName: "A" }]), /kalan adedini aşıyor/i);
});

test("tam eşleşen taslakta doğrulama farkı oluşmaz", () => {
  const service = createService() as any;
  assert.deepEqual(service.compareInvoiceSnapshots(validSnapshot(), validSnapshot()), []);
});

test("geçerli sürüm ve güvenlik metniyle onay zamanı ve kullanıcı kaydedilir", async () => {
  let updated: any = null;
  const prisma = {
    isnetInvoiceDraftRequest: {
      findFirst: async () => ({ id: "draft-1", status: "VERIFIED", verificationDiff: [], draftVersion: "v1", expectedSnapshot: { localCompanyId: "company-1" } }),
      update: async ({ data }: any) => (updated = { id: "draft-1", ...data }),
    },
    company: { findFirst: async () => ({ id: "company-1", companyType: "CUSTOMER" }) },
  };
  const service = createService(prisma);
  const result = await service.finalApproveInvoiceDraft("draft-1", { mainCompanySlug: "test-company", approved: true, confirmationText: "FATURAYI GÖNDER", expectedVersion: "v1" }, "user-42");
  assert.equal(result.status, "APPROVED");
  assert.equal(updated.approvedBy, "user-42");
  assert.equal(updated.approvalVersion, "v1");
  assert.ok(updated.approvedAt instanceof Date);
});

test("belirsiz portal gönderim hatası VERIFY_PENDING bırakır", async () => {
  const updates: any[] = [];
  const request = { id: "draft-1", status: "APPROVED", approvedAt: new Date(), approvalVersion: "v1", draftVersion: "v1", portalDraftId: "10", expectedSnapshot: {} };
  const prisma = {
    isnetInvoiceDraftRequest: {
      findFirst: async () => request,
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }: any) => { updates.push(data); return { ...request, ...data }; },
    },
  };
  const service = createService(prisma) as any;
  service.configuredPortal = async () => ({ companyId: "1", session: {} });
  service.verifyStoredDraft = async () => ({ verified: true, request, differences: [] });
  service.sendStagingInvoice = async () => { throw new Error("connection reset"); };
  await assert.rejects(service.submitOfficialInvoice("draft-1", { mainCompanySlug: "test-company" }, "user-1"), /connection reset/);
  assert.equal(updates.at(-1).status, "VERIFY_PENDING");
});

test("fatura numarası veya UUID eksikse SENT yazılmaz", async () => {
  const updates: any[] = [];
  const request = { id: "draft-1", status: "APPROVED", approvedAt: new Date(), approvalVersion: "v1", draftVersion: "v1", portalDraftId: "10", expectedSnapshot: {} };
  const prisma = {
    isnetInvoiceDraftRequest: {
      findFirst: async () => request,
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }: any) => { updates.push(data); return { ...request, ...data }; },
    },
  };
  const service = createService(prisma) as any;
  service.configuredPortal = async () => ({ companyId: "1", session: {} });
  service.verifyStoredDraft = async () => ({ verified: true, request, differences: [] });
  service.sendStagingInvoice = async () => ({ ok: true });
  service.findSubmittedInvoice = async () => ({ documentNo: "HKN1", sourceId: "55", uuid: "" });
  await assert.rejects(service.submitOfficialInvoice("draft-1", { mainCompanySlug: "test-company" }, "user-1"), /numarası\/UUID/i);
  assert.equal(updates.at(-1).status, "VERIFY_PENDING");
  assert.equal(updates.some((item) => item.status === "SENT"), false);
});

test("geçersiz veya eksik PDF dosyası FILE_DOWNLOAD_PENDING bırakır", async () => {
  const updates: any[] = [];
  const request = { id: "draft-1", mainCompanySlug: "test-company", status: "SENT", officialInvoiceNumber: "HKN1", officialUuid: "uuid-1", isnetDocumentId: "55", expectedSnapshot: {} };
  const prisma = { isnetInvoiceDraftRequest: { findFirst: async () => request, update: async ({ data }: any) => { updates.push(data); return { ...request, ...data }; } } };
  const service = createService(prisma) as any;
  service.configuredPortal = async () => ({ session: {} });
  service.downloadPortalFile = async (_session: any, input: any) => input.format === "pdf" ? { buffer: Buffer.alloc(0) } : { buffer: Buffer.from("<Invoice/>") };
  await assert.rejects(service.archiveInvoice({ mainCompanySlug: "test-company", draftId: "draft-1" }), /PDF/i);
  assert.equal(updates.at(-1).status, "FILE_DOWNLOAD_PENDING");
});

test("mevcut satış faturası cari ve KDV kayıtları yeniden oluşturulmaz", async () => {
  let uploadCalled = false;
  const request = { id: "draft-1", mainCompanySlug: "test-company", officialInvoiceNumber: "HKN1", officialUuid: "uuid-1", dispatchNo: "IRS-1" };
  const tx = {
    isnetInvoiceDraftRequest: { update: async () => ({}) },
    isnetInvoiceLineAllocation: { update: async () => ({}) },
    invoiceItem: { update: async () => ({}) },
  };
  const prisma = {
    document: { findFirst: async ({ where }: any) => where.documentNo === "HKN1" ? { id: "invoice-doc" } : null },
    currentAccountMovement: { findFirst: async () => ({ id: "movement-1" }) },
    vatRecord: { findFirst: async () => ({ id: "vat-1" }) },
    invoiceItem: { findMany: async () => [] },
    isnetInvoiceLineAllocation: { findMany: async () => [] },
    $transaction: async (callback: any) => callback(tx),
  };
  const service = createService(prisma, { upload: async () => { uploadCalled = true; } }) as any;
  const result = await service.closeOfficialInvoiceAccounting(request, { buffer: Buffer.from("xml") }, { buffer: Buffer.from("pdf") });
  assert.equal(uploadCalled, false);
  assert.equal(result.document.id, "invoice-doc");
  assert.equal(result.movement.id, "movement-1");
});
