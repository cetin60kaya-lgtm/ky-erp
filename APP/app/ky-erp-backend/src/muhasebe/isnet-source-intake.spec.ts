import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildIsnetSourceDedupeKey,
  calculateDispatchCapacity,
  normalizeIsnetSourceIntake,
} from './isnet-source-intake';

test('portal kaydını ETTN ile tekilleştirir', () => {
  const key = buildIsnetSourceDedupeKey({
    sourceType: 'PORTAL',
    companyName: 'Taha Giyim',
    modelName: 'Magic',
    issueDate: '2026-07-26',
    quantity: 1000,
    ettn: 'abc-123',
  });
  assert.equal(key, 'PORTAL:ETTN:ABC-123');
});

test('manuel PDF kaydını dosya özetiyle tekilleştirir', () => {
  const input = {
    sourceType: 'MANUAL_PDF' as const,
    companyName: 'Taha Giyim',
    modelName: 'Magic',
    customerDispatchNo: 'TIA2026001',
    issueDate: '2026-07-26',
    quantity: 1000,
    pdfBuffer: Buffer.from('aynı pdf'),
  };
  const otherMetadata = {
    ...input,
    companyName: 'Başka Firma',
    customerDispatchNo: 'FARKLI2026001',
    issueDate: '2026-07-25',
  };
  assert.equal(
    buildIsnetSourceDedupeKey(input),
    buildIsnetSourceDedupeKey(otherMetadata),
  );
  assert.match(buildIsnetSourceDedupeKey(input), /^PDF:[a-f0-9]{64}$/);
});

test('irsaliyesiz talimatta sahte müşteri irsaliye numarası üretmez', () => {
  const normalized = normalizeIsnetSourceIntake({
    sourceType: 'NO_CUSTOMER_DISPATCH',
    companyName: 'Taha Giyim',
    companyRole: 'CUSTOMER',
    modelId: 'model-1',
    modelName: 'Magic',
    orderNo: 'P-100',
    issueDate: '2026-07-26',
    quantity: 2500,
  });
  assert.equal(normalized.customerDispatchNo, null);
  assert.equal(normalized.customerDispatchMissing, true);
  assert.match(normalized.internalReference, /^KYI-20260726-/);
  assert.equal(normalized.status, 'READY_FOR_PRODUCTION');
});

test('model seçilmemiş müşteri kaydını model bekleyen yapar', () => {
  const normalized = normalizeIsnetSourceIntake({
    sourceType: 'PORTAL',
    companyName: 'Taha Giyim',
    companyRole: 'CUSTOMER',
    modelName: 'Magic',
    customerDispatchNo: 'TIA2026001',
    issueDate: '2026-07-26',
    quantity: 2500,
  });
  assert.equal(normalized.status, 'MODEL_PENDING');
});

test('model adı henüz okunmamış müşteri kaydını model bekleyen yapar', () => {
  const normalized = normalizeIsnetSourceIntake({
    sourceType: 'PORTAL',
    companyName: 'Taha Giyim',
    companyRole: 'CUSTOMER',
    modelName: '',
    customerDispatchNo: 'TIA2026002',
    issueDate: '2026-07-26',
    quantity: 2500,
  });
  assert.equal(normalized.status, 'MODEL_PENDING');
});

test('takvimde olmayan tarihleri kabul etmez', () => {
  assert.throws(
    () => normalizeIsnetSourceIntake({
      sourceType: 'NO_CUSTOMER_DISPATCH',
      companyName: 'Taha Giyim',
      modelName: 'Magic',
      issueDate: '2026-02-31',
      quantity: 100,
    }),
    /Geçerli bir işlem tarihi/,
  );
});

test('tedarikçi kaydını faturalandırılmaz olarak ayırır', () => {
  const normalized = normalizeIsnetSourceIntake({
    sourceType: 'PORTAL',
    companyName: 'Selvi Kimya',
    companyRole: 'SUPPLIER',
    modelName: '',
    customerDispatchNo: 'ISV2026001',
    issueDate: '2026-07-26',
    quantity: 10,
  });
  assert.equal(normalized.status, 'NON_BILLABLE_SUPPLIER');
});

test('kısmi ve tam irsaliye/fatura durumlarını hesaplar', () => {
  const partial = calculateDispatchCapacity({
    sourceQuantity: 10000,
    producedNetQuantity: 6000,
    outgoingDispatchQuantity: 6000,
    invoicedQuantity: 6000,
    nonBillableQuantity: 0,
  });
  assert.equal(partial.dispatchStatus, 'PARTIAL');
  assert.equal(partial.invoiceStatus, 'PARTIAL');
  assert.equal(partial.outgoingRemaining, 4000);

  const complete = calculateDispatchCapacity({
    sourceQuantity: 10000,
    producedNetQuantity: 10000,
    outgoingDispatchQuantity: 10000,
    invoicedQuantity: 9990,
    nonBillableQuantity: 10,
  });
  assert.equal(complete.dispatchStatus, 'COMPLETE');
  assert.equal(complete.invoiceStatus, 'COMPLETE');
  assert.equal(complete.sourceClosingRemaining, 0);
});

test('giden irsaliye kaynak adedi aşarsa işlemi durdurur', () => {
  assert.throws(
    () => calculateDispatchCapacity({
      sourceQuantity: 1000,
      producedNetQuantity: 1100,
      outgoingDispatchQuantity: 1001,
      invoicedQuantity: 0,
      nonBillableQuantity: 0,
    }),
    /Toplam giden irsaliye adedi kaynak adedi aşamaz/,
  );
});
