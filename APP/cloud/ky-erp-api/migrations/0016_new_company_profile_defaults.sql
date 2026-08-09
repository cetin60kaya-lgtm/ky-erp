-- Yeni firma kartları için güvenli varsayılan muhasebe davranışı.

-- Mevcut firma adlarını da kendi ana aliası olarak kaydet.
INSERT INTO company_aliases
  (id, main_company_slug, company_id, raw_name, normalized_name, is_active, source, tax_no, created_at, updated_at)
SELECT lower(hex(randomblob(16))),
       c.main_company_slug,
       c.id,
       c.name,
       c.normalized_name,
       1,
       'COMPANY_NAME',
       c.tax_no,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
  FROM companies c
 WHERE c.deleted_at IS NULL
   AND COALESCE(TRIM(c.name), '') <> ''
ON CONFLICT(main_company_slug, normalized_name) DO NOTHING;

DROP TRIGGER IF EXISTS trg_company_type_compat_insert;
CREATE TRIGGER trg_company_type_compat_insert
AFTER INSERT ON companies
BEGIN
  UPDATE companies
     SET company_type = CASE
           WHEN UPPER(COALESCE(NEW.company_type, NEW.type, '')) IN ('MUSTERI', 'MÜŞTERİ', 'CUSTOMER') THEN 'CUSTOMER'
           WHEN UPPER(COALESCE(NEW.company_type, NEW.type, '')) = 'BOTH' THEN 'BOTH'
           ELSE 'SUPPLIER'
         END,
         supplier_debt_tracking = CASE
           WHEN (
             UPPER(NEW.name) LIKE '%BIM %' OR UPPER(NEW.name) LIKE 'BIM%' OR UPPER(NEW.name) LIKE '%BİM%'
             OR UPPER(NEW.name) LIKE '%METRO%'
             OR UPPER(NEW.name) LIKE '%MIGROS%'
             OR UPPER(NEW.name) LIKE '%A101%'
             OR UPPER(NEW.name) LIKE '%ŞOK%'
             OR UPPER(NEW.name) LIKE '%SOK MARKET%'
             OR UPPER(NEW.name) LIKE '%FILE MARKET%'
             OR UPPER(NEW.name) LIKE '%FİLE MARKET%'
             OR UPPER(NEW.name) LIKE '%CARREFOUR%'
           ) THEN 0
           WHEN UPPER(COALESCE(NEW.company_type, NEW.type, '')) IN ('SUPPLIER', 'SATICI', 'BOTH') THEN 1
           ELSE 0
         END,
         customer_receivable_tracking = CASE
           WHEN UPPER(COALESCE(NEW.company_type, NEW.type, '')) IN ('MUSTERI', 'MÜŞTERİ', 'CUSTOMER', 'BOTH') THEN 1
           ELSE 0
         END,
         payment_mode = CASE
           WHEN (
             UPPER(NEW.name) LIKE '%BIM %' OR UPPER(NEW.name) LIKE 'BIM%' OR UPPER(NEW.name) LIKE '%BİM%'
             OR UPPER(NEW.name) LIKE '%METRO%'
             OR UPPER(NEW.name) LIKE '%MIGROS%'
             OR UPPER(NEW.name) LIKE '%A101%'
             OR UPPER(NEW.name) LIKE '%ŞOK%'
             OR UPPER(NEW.name) LIKE '%SOK MARKET%'
             OR UPPER(NEW.name) LIKE '%FILE MARKET%'
             OR UPPER(NEW.name) LIKE '%FİLE MARKET%'
             OR UPPER(NEW.name) LIKE '%CARREFOUR%'
           ) THEN 'CASH'
           WHEN UPPER(COALESCE(NEW.company_type, NEW.type, '')) IN ('SUPPLIER', 'SATICI', 'BOTH') THEN 'CREDIT'
           ELSE 'CASH'
         END,
         vat_tracking_enabled = 1,
         expense_category = CASE
           WHEN (
             UPPER(NEW.name) LIKE '%BIM %' OR UPPER(NEW.name) LIKE 'BIM%' OR UPPER(NEW.name) LIKE '%BİM%'
             OR UPPER(NEW.name) LIKE '%METRO%'
             OR UPPER(NEW.name) LIKE '%MIGROS%'
             OR UPPER(NEW.name) LIKE '%A101%'
             OR UPPER(NEW.name) LIKE '%ŞOK%'
             OR UPPER(NEW.name) LIKE '%SOK MARKET%'
             OR UPPER(NEW.name) LIKE '%FILE MARKET%'
             OR UPPER(NEW.name) LIKE '%FİLE MARKET%'
             OR UPPER(NEW.name) LIKE '%CARREFOUR%'
           ) THEN 'Gıda / Market'
           WHEN UPPER(NEW.name) LIKE '%YEMEK%' THEN 'Yemek'
           WHEN UPPER(NEW.name) LIKE '%ELEKTRIK%' OR UPPER(NEW.name) LIKE '%ELEKTRİK%' THEN 'Elektrik / Enerji'
           ELSE NEW.expense_category
         END
   WHERE id = NEW.id;

  INSERT INTO company_aliases
    (id, main_company_slug, company_id, raw_name, normalized_name, is_active, source, tax_no, created_at, updated_at)
  VALUES (
    lower(hex(randomblob(16))),
    NEW.main_company_slug,
    NEW.id,
    NEW.name,
    NEW.normalized_name,
    1,
    'COMPANY_NAME',
    NEW.tax_no,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT(main_company_slug, normalized_name) DO NOTHING;
END;

-- Alias/VKN eşleştirmesi belgeyi sonradan firmaya bağlarsa, temiz başlangıçta gizlenen firma tekrar Muhasebe'de görünür.
DROP TRIGGER IF EXISTS trg_accounting_reactivate_company_from_document_match;
CREATE TRIGGER trg_accounting_reactivate_company_from_document_match
AFTER UPDATE OF company_id ON documents
WHEN NEW.main_company_slug = 'mecit-hakan'
 AND COALESCE(NEW.company_id, '') <> ''
BEGIN
  UPDATE companies
     SET note = NULLIF(TRIM(REPLACE(COALESCE(note, ''), '[[ACC_RESET_2026_08]]', '')), ''),
         opening_balance = 0,
         updated_at = CURRENT_TIMESTAMP
   WHERE id = NEW.company_id
     AND main_company_slug = NEW.main_company_slug;
END;
