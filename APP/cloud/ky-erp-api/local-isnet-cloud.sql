INSERT OR REPLACE INTO companies
  (id, main_company_slug, name, normalized_name, company_type, type, tax_no, is_active, created_at, updated_at)
VALUES
  ('company-isnet-customer', 'mecit-hakan', 'TAHA GİYİM İŞNET TEST', 'TAHA GIYIM ISNET TEST', 'CUSTOMER', 'CUSTOMER', '4444444444', 1, '2026-08-01T14:00:00.000Z', '2026-08-01T14:00:00.000Z');

INSERT OR REPLACE INTO documents
  (id, main_company_slug, company_id, document_type, target_type, detected_type, document_no, date, source_type, status, subtotal, vat_total, grand_total, metadata, raw, created_at, updated_at)
VALUES
  (
    'isnet-incoming-dispatch-1',
    'mecit-hakan',
    'company-isnet-customer',
    'INCOMING_DISPATCH',
    'CUSTOMER_DISPATCH',
    'DISPATCH',
    'DDM2026000009001',
    '2026-08-01',
    'ISNET',
    'RECEIVED',
    0,
    0,
    0,
    '{"direction":"INCOMING","documentKind":"DISPATCH","companyName":"TAHA GİYİM İŞNET TEST","companyType":"CUSTOMER","modelName":"CI ISNET MODEL","quantity":1500,"pdfKey":"isnet/test/DDM2026000009001.pdf","xmlKey":"isnet/test/DDM2026000009001.xml"}',
    '{"direction":"INCOMING","documentKind":"DISPATCH","companyName":"TAHA GİYİM İŞNET TEST","companyType":"CUSTOMER","modelName":"CI ISNET MODEL","quantity":1500}',
    '2026-08-01T14:05:00.000Z',
    '2026-08-01T14:05:00.000Z'
  ),
  (
    'isnet-issued-invoice-1',
    'mecit-hakan',
    'company-isnet-customer',
    'ISSUED_INVOICE',
    'CUSTOMER_INVOICE',
    'INVOICE',
    'HKN2026000009001',
    '2026-08-01',
    'ISNET',
    'COMPLETED',
    10000,
    2000,
    12000,
    '{"direction":"OUTGOING","documentKind":"INVOICE","companyName":"TAHA GİYİM İŞNET TEST","companyType":"CUSTOMER","modelName":"CI ISNET MODEL","pdfKey":"isnet/test/HKN2026000009001.pdf","xmlKey":"isnet/test/HKN2026000009001.xml"}',
    '{"direction":"OUTGOING","documentKind":"INVOICE","companyName":"TAHA GİYİM İŞNET TEST","companyType":"CUSTOMER","modelName":"CI ISNET MODEL"}',
    '2026-08-01T14:10:00.000Z',
    '2026-08-01T14:10:00.000Z'
  );

INSERT OR REPLACE INTO invoice_items
  (id, main_company_slug, document_id, product_name, description, quantity, unit, unit_price, line_total, subtotal, vat_amount, raw, created_at, updated_at)
VALUES
  (
    'isnet-dispatch-line-1',
    'mecit-hakan',
    'isnet-incoming-dispatch-1',
    'CI ISNET MODEL',
    'CI ISNET MODEL ÖN BASKI',
    1500,
    'ADET',
    0,
    0,
    0,
    0,
    '{"modelName":"CI ISNET MODEL","orderNo":"CI-SP-ISNET-1","region":"Ön"}',
    '2026-08-01T14:05:00.000Z',
    '2026-08-01T14:05:00.000Z'
  );
