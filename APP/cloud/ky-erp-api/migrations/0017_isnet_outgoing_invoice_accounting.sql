-- İşNet'ten geri okunan bizim satış faturalarımızı muhasebeye tekilleştirerek kapat.
-- Müşteriden gelen irsaliye cari/KDV oluşturmaz.
-- Tedarikçi faturaları mevcut kontrol/onay akışında kalır.

DROP TRIGGER IF EXISTS trg_isnet_outgoing_invoice_vat;
CREATE TRIGGER trg_isnet_outgoing_invoice_vat
AFTER INSERT ON documents
WHEN UPPER(COALESCE(NEW.source_type, '')) = 'ISNET_DIRECT'
 AND UPPER(COALESCE(NEW.document_type, '')) = 'CUSTOMER_INVOICE'
 AND COALESCE(NEW.company_id, '') <> ''
 AND NOT EXISTS (
   SELECT 1 FROM vat_records v
    WHERE v.main_company_slug = NEW.main_company_slug
      AND v.document_id = NEW.id
 )
BEGIN
  INSERT INTO vat_records (
    id,
    main_company_slug,
    company_id,
    firm_id,
    document_id,
    date,
    period_year,
    period_month,
    incoming_vat,
    outgoing_vat,
    carry_vat,
    raw,
    created_at,
    updated_at
  )
  VALUES (
    lower(hex(randomblob(16))),
    NEW.main_company_slug,
    NEW.company_id,
    NEW.company_id,
    NEW.id,
    COALESCE(NEW.date, CURRENT_TIMESTAMP),
    CAST(substr(COALESCE(NEW.date, CURRENT_TIMESTAMP), 1, 4) AS INTEGER),
    CAST(substr(COALESCE(NEW.date, CURRENT_TIMESTAMP), 6, 2) AS INTEGER),
    0,
    COALESCE(NEW.vat_total, 0),
    0,
    json_object(
      'source', 'ISNET_DIRECT',
      'documentNo', COALESCE(NEW.document_no, ''),
      'outgoingBase', COALESCE(NEW.subtotal, 0)
    ),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );
END;

DROP TRIGGER IF EXISTS trg_isnet_outgoing_invoice_receivable;
CREATE TRIGGER trg_isnet_outgoing_invoice_receivable
AFTER INSERT ON documents
WHEN UPPER(COALESCE(NEW.source_type, '')) = 'ISNET_DIRECT'
 AND UPPER(COALESCE(NEW.document_type, '')) = 'CUSTOMER_INVOICE'
 AND COALESCE(NEW.company_id, '') <> ''
 AND COALESCE(NEW.grand_total, 0) > 0
 AND EXISTS (
   SELECT 1 FROM companies c
    WHERE c.id = NEW.company_id
      AND c.main_company_slug = NEW.main_company_slug
      AND COALESCE(c.customer_receivable_tracking, 0) = 1
 )
 AND NOT EXISTS (
   SELECT 1 FROM current_account_movements m
    WHERE m.main_company_slug = NEW.main_company_slug
      AND m.document_id = NEW.id
 )
BEGIN
  INSERT INTO current_account_movements (
    id,
    main_company_slug,
    company_id,
    movement_date,
    movement_type,
    source_type,
    document_no,
    document_id,
    description,
    debit,
    credit,
    amount,
    effect,
    balance_after,
    raw,
    created_at,
    updated_at
  )
  SELECT
    lower(hex(randomblob(16))),
    NEW.main_company_slug,
    NEW.company_id,
    COALESCE(NEW.date, CURRENT_TIMESTAMP),
    'FATURA',
    'CUSTOMER_INVOICE',
    NEW.document_no,
    NEW.id,
    COALESCE(NEW.document_no, 'Satış faturası') || ' müşteri alacak kaydı',
    COALESCE(NEW.grand_total, 0),
    0,
    COALESCE(NEW.grand_total, 0),
    COALESCE(NEW.grand_total, 0),
    COALESCE(c.current_balance, 0) + COALESCE(NEW.grand_total, 0),
    json_object('source', 'ISNET_DIRECT'),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM companies c
  WHERE c.id = NEW.company_id
    AND c.main_company_slug = NEW.main_company_slug;

  UPDATE companies
     SET current_balance = COALESCE(current_balance, 0) + COALESCE(NEW.grand_total, 0),
         updated_at = CURRENT_TIMESTAMP
   WHERE id = NEW.company_id
     AND main_company_slug = NEW.main_company_slug;
END;
