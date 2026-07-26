import {
  buildIsnetSourceDedupeKey,
  calculateDispatchCapacity,
  normalizeIsnetSourceIntake,
} from './isnet-source-intake';

describe('İşNet üç kaynaklı giriş', () => {
  it('portal kaydını ETTN ile tekilleştirir', () => {
    const key = buildIsnetSourceDedupeKey({
      sourceType: 'PORTAL',
      companyName: 'Taha Giyim',
      modelName: 'Magic',
      issueDate: '2026-07-26',
      quantity: 1000,
      ettn: 'abc-123',
    });

    expect(key).toBe('PORTAL:ETTN:ABC-123');
  });

  it('manuel PDF kaydını dosya özetiyle tekilleştirir', () => {
    const first = buildIsnetSourceDedupeKey({
      sourceType: 'MANUAL_PDF',
      companyName: 'Taha Giyim',
      modelName: 'Magic',
      customerDispatchNo: 'TIA2026001',
      issueDate: '2026-07-26',
      quantity: 1000,
      pdfBuffer: Buffer.from('aynı pdf'),
    });
    const second = buildIsnetSourceDedupeKey({
      sourceType: 'MANUAL_PDF',
      companyName: 'Taha Giyim',
      modelName: 'Magic',
      customerDispatchNo: 'TIA2026001',
      issueDate: '2026-07-26',
      quantity: 1000,
      pdfBuffer: Buffer.from('aynı pdf'),
    });

    expect(first).toBe(second);
  });

  it('irsaliyesiz talimatta sahte müşteri irsaliye numarası üretmez', () => {
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

    expect(normalized.customerDispatchNo).toBeNull();
    expect(normalized.customerDispatchMissing).toBe(true);
    expect(normalized.internalReference).toMatch(/^KYI-20260726-/);
    expect(normalized.status).toBe('READY_FOR_PRODUCTION');
  });

  it('model seçilmemiş müşteri kaydını model bekleyen yapar', () => {
    const normalized = normalizeIsnetSourceIntake({
      sourceType: 'PORTAL',
      companyName: 'Taha Giyim',
      companyRole: 'CUSTOMER',
      modelName: 'Magic',
      customerDispatchNo: 'TIA2026001',
      issueDate: '2026-07-26',
      quantity: 2500,
    });

    expect(normalized.status).toBe('MODEL_PENDING');
  });

  it('tedarikçi kaydını faturalandırılmaz olarak ayırır', () => {
    const normalized = normalizeIsnetSourceIntake({
      sourceType: 'PORTAL',
      companyName: 'Selvi Kimya',
      companyRole: 'SUPPLIER',
      modelName: '',
      customerDispatchNo: 'ISV2026001',
      issueDate: '2026-07-26',
      quantity: 10,
    });

    expect(normalized.status).toBe('NON_BILLABLE_SUPPLIER');
  });

  it('kısmi ve tam irsaliye/fatura durumlarını hesaplar', () => {
    const partial = calculateDispatchCapacity({
      sourceQuantity: 10000,
      producedNetQuantity: 6000,
      outgoingDispatchQuantity: 6000,
      invoicedQuantity: 6000,
      nonBillableQuantity: 0,
    });

    expect(partial.dispatchStatus).toBe('PARTIAL');
    expect(partial.invoiceStatus).toBe('PARTIAL');
    expect(partial.outgoingRemaining).toBe(4000);

    const complete = calculateDispatchCapacity({
      sourceQuantity: 10000,
      producedNetQuantity: 10000,
      outgoingDispatchQuantity: 10000,
      invoicedQuantity: 9990,
      nonBillableQuantity: 10,
    });

    expect(complete.dispatchStatus).toBe('COMPLETE');
    expect(complete.invoiceStatus).toBe('COMPLETE');
    expect(complete.sourceClosingRemaining).toBe(0);
  });

  it('giden irsaliye kaynak adedi aşarsa işlemi durdurur', () => {
    expect(() =>
      calculateDispatchCapacity({
        sourceQuantity: 1000,
        producedNetQuantity: 1100,
        outgoingDispatchQuantity: 1001,
        invoicedQuantity: 0,
        nonBillableQuantity: 0,
      }),
    ).toThrow('Toplam giden irsaliye adedi kaynak adedi aşamaz.');
  });
});
