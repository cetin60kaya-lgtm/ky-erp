INSERT OR REPLACE INTO companies
  (id, main_company_slug, name, normalized_name, company_type, type, tax_no, is_active, created_at, updated_at)
VALUES
  ('company-chemical', 'mecit-hakan', 'URAS KİMYA TEST', 'URAS KIMYA TEST', 'SUPPLIER', 'SUPPLIER', '3333333333', 1, '2026-08-01T13:00:00.000Z', '2026-08-01T13:00:00.000Z');

INSERT OR REPLACE INTO documents
  (id, main_company_slug, company_id, document_type, target_type, detected_type, document_no, date, source_type, status, subtotal, vat_total, grand_total, metadata, raw, created_at, updated_at)
VALUES
  ('supplier-invoice-chemical', 'mecit-hakan', 'company-chemical', 'SUPPLIER_INVOICE', 'SUPPLIER_INVOICE', 'SUPPLIER_INVOICE', 'URS2026000000001', '2026-08-01', 'ISNET', 'CONTROL_WAITING', 12000, 2400, 14400, '{"direction":"INCOMING","documentKind":"SUPPLIER_INVOICE","companyName":"URAS KİMYA TEST"}', '{"direction":"INCOMING","documentKind":"SUPPLIER_INVOICE","companyName":"URAS KİMYA TEST"}', '2026-08-01T13:05:00.000Z', '2026-08-01T13:05:00.000Z');

INSERT OR REPLACE INTO invoice_items
  (id, main_company_slug, document_id, product_name, description, quantity, unit, unit_price, line_total, subtotal, vat_amount, raw, created_at, updated_at)
VALUES
  ('line-chemical-red', 'mecit-hakan', 'supplier-invoice-chemical', 'REAKTİF KIRMIZI TEST', 'REAKTİF KIRMIZI TEST', 120, 'KG', 100, 12000, 12000, 2400, '{"rawName":"REAKTİF KIRMIZI TEST"}', '2026-08-01T13:05:00.000Z', '2026-08-01T13:05:00.000Z');

INSERT OR REPLACE INTO json_store
  (id, scope, main_company_slug, file_name, data, created_at, updated_at)
VALUES
  ('js-chemical-profile', 'MUHASEBE_CHEMICAL_SUPPLIER', 'mecit-hakan', 'company-chemical', '{"companyId":"company-chemical","companyName":"URAS KİMYA TEST","isChemicalSupplier":true,"defaultWarehouse":"BOYAHANE","defaultUnit":"KG","requireLot":true,"allowNegativeStock":false}', '2026-08-01T13:00:00.000Z', '2026-08-01T13:00:00.000Z');
