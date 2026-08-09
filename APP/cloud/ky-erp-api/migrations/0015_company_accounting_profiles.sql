-- KY ERP firma muhasebe profili ve cari güvenlik kuralları.
-- Temel kural:
-- 1) Tedarikçi faturası yalnız supplier_debt_tracking=1 ise cari borç yaratır.
-- 2) Peşin alış firmaları gider/KDV'de görünür fakat cari borç yaratmaz.
-- 3) Resmî olmayan kayıtlar KDV kaydı oluşturmaz.
-- 4) Cari bakiye, gerçek cari hareketlerin effect toplamından türetilir.

ALTER TABLE companies ADD COLUMN supplier_debt_tracking INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN customer_receivable_tracking INTEGER NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN payment_mode TEXT NOT NULL DEFAULT 'CASH';
ALTER TABLE companies ADD COLUMN vat_tracking_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE companies ADD COLUMN expense_category TEXT;

-- Gerçek tedarikçiler varsayılan olarak cari/vadeli; müşteriler alacak takipli.
UPDATE companies
   SET supplier_debt_tracking = CASE
         WHEN UPPER(COALESCE(company_type, type, '')) IN ('SUPPLIER', 'SATICI') THEN 1
         WHEN UPPER(COALESCE(company_type, type, '')) = 'BOTH' THEN 1
         ELSE 0
       END,
       customer_receivable_tracking = CASE
         WHEN UPPER(COALESCE(company_type, type, '')) IN ('CUSTOMER', 'MUSTERI') THEN 1
         WHEN UPPER(COALESCE(company_type, type, '')) = 'BOTH' THEN 1
         ELSE 0
       END,
       payment_mode = CASE
         WHEN UPPER(COALESCE(company_type, type, '')) IN ('SUPPLIER', 'SATICI', 'BOTH') THEN 'CREDIT'
         ELSE 'CASH'
       END,
       vat_tracking_enabled = 1
 WHERE main_company_slug = 'mecit-hakan'
   AND deleted_at IS NULL;

-- Market/perakende peşin alış firmaları: gider + KDV, cari borç YOK.
UPDATE companies
   SET supplier_debt_tracking = 0,
       payment_mode = 'CASH',
       expense_category = 'Gıda / Market'
 WHERE main_company_slug = 'mecit-hakan'
   AND deleted_at IS NULL
   AND (
     UPPER(name) LIKE '%BIM %' OR UPPER(name) LIKE 'BIM%' OR UPPER(name) LIKE '%BİM%'
     OR UPPER(name) LIKE '%METRO%'
     OR UPPER(name) LIKE '%MIGROS%'
     OR UPPER(name) LIKE '%A101%'
     OR UPPER(name) LIKE '%ŞOK%'
     OR UPPER(name) LIKE '%SOK MARKET%'
     OR UPPER(name) LIKE '%FILE MARKET%'
     OR UPPER(name) LIKE '%FİLE MARKET%'
     OR UPPER(name) LIKE '%CARREFOUR%'
   );

UPDATE companies
   SET expense_category = COALESCE(NULLIF(expense_category, ''), 'Yemek')
 WHERE main_company_slug = 'mecit-hakan'
   AND deleted_at IS NULL
   AND UPPER(name) LIKE '%YEMEK%';

UPDATE companies
   SET expense_category = COALESCE(NULLIF(expense_category, ''), 'Elektrik / Enerji')
 WHERE main_company_slug = 'mecit-hakan'
   AND deleted_at IS NULL
   AND (UPPER(name) LIKE '%ELEKTRIK%' OR UPPER(name) LIKE '%ELEKTRİK%');

-- Peşin veya cari kapalı tedarikçiye yanlışlıkla tedarikçi faturası cari hareketi yazılırsa sil.
DROP TRIGGER IF EXISTS trg_supplier_invoice_block_cash_cari;
CREATE TRIGGER trg_supplier_invoice_block_cash_cari
AFTER INSERT ON current_account_movements
WHEN UPPER(COALESCE(NEW.source_type, '')) = 'SUPPLIER_INVOICE'
 AND EXISTS (
   SELECT 1
     FROM companies c
    WHERE c.id = NEW.company_id
      AND c.main_company_slug = NEW.main_company_slug
      AND (COALESCE(c.supplier_debt_tracking, 0) = 0 OR UPPER(COALESCE(c.payment_mode, 'CASH')) = 'CASH')
 )
BEGIN
  DELETE FROM current_account_movements WHERE id = NEW.id;
END;

-- Tedarikçiye yapılan ödeme negatif borcu azaltır (+effect).
-- Müşteriden gelen tahsilat pozitif alacağı azaltır (-effect).
DROP TRIGGER IF EXISTS trg_accounting_fix_payment_effect;
CREATE TRIGGER trg_accounting_fix_payment_effect
AFTER INSERT ON current_account_movements
WHEN UPPER(COALESCE(NEW.source_type, '')) = 'PAYMENT'
BEGIN
  UPDATE current_account_movements
     SET effect = CASE
           WHEN UPPER(COALESCE(NEW.movement_type, '')) IN ('ODEME', 'ÖDEME')
                AND EXISTS (
                  SELECT 1 FROM companies c
                   WHERE c.id = NEW.company_id
                     AND COALESCE(c.supplier_debt_tracking, 0) = 1
                ) THEN ABS(COALESCE(NEW.amount, 0))
           WHEN UPPER(COALESCE(NEW.movement_type, '')) IN ('TAHSILAT', 'TAHSİLAT')
                AND EXISTS (
                  SELECT 1 FROM companies c
                   WHERE c.id = NEW.company_id
                     AND COALESCE(c.customer_receivable_tracking, 0) = 1
                ) THEN -ABS(COALESCE(NEW.amount, 0))
           ELSE NEW.effect
         END
   WHERE id = NEW.id;
END;

-- Firma bakiyesi her durumda gerçek movement effect toplamına eşit olsun.
DROP TRIGGER IF EXISTS trg_company_balance_recalculate;
CREATE TRIGGER trg_company_balance_recalculate
AFTER UPDATE OF current_balance ON companies
WHEN ABS(
  COALESCE(NEW.current_balance, 0) -
  COALESCE((
    SELECT SUM(COALESCE(effect, 0))
      FROM current_account_movements m
     WHERE m.company_id = NEW.id
       AND m.main_company_slug = NEW.main_company_slug
  ), 0)
) > 0.0001
BEGIN
  UPDATE companies
     SET current_balance = COALESCE((
       SELECT SUM(COALESCE(effect, 0))
         FROM current_account_movements m
        WHERE m.company_id = NEW.id
          AND m.main_company_slug = NEW.main_company_slug
     ), 0)
   WHERE id = NEW.id;
END;

-- KDV takibi kapalı veya varsayılan kayıt türü gayri resmî ise KDV kaydı tutulmaz.
DROP TRIGGER IF EXISTS trg_vat_respect_company_profile;
CREATE TRIGGER trg_vat_respect_company_profile
AFTER INSERT ON vat_records
WHEN EXISTS (
  SELECT 1
    FROM companies c
   WHERE c.id = COALESCE(NEW.company_id, NEW.firm_id)
     AND (
       COALESCE(c.vat_tracking_enabled, 1) = 0
       OR UPPER(COALESCE(c.default_record_type, 'RESMI')) LIKE '%GAYRI%'
       OR UPPER(COALESCE(c.default_record_type, 'RESMI')) LIKE '%UNOFFICIAL%'
     )
)
BEGIN
  DELETE FROM vat_records WHERE id = NEW.id;
END;

-- Firma gider kategorisi belgeye otomatik taşınır; kar/zarar raporu bunu kullanır.
DROP TRIGGER IF EXISTS trg_document_company_expense_category_insert;
CREATE TRIGGER trg_document_company_expense_category_insert
AFTER INSERT ON documents
WHEN COALESCE(NEW.company_id, '') <> ''
 AND EXISTS (
   SELECT 1 FROM companies c
    WHERE c.id = NEW.company_id
      AND COALESCE(TRIM(c.expense_category), '') <> ''
 )
BEGIN
  UPDATE documents
     SET metadata = json_set(
       CASE WHEN json_valid(metadata) THEN metadata ELSE '{}' END,
       '$.reportCategory', (
         SELECT expense_category FROM companies WHERE id = NEW.company_id LIMIT 1
       )
     )
   WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS trg_document_company_expense_category_update;
CREATE TRIGGER trg_document_company_expense_category_update
AFTER UPDATE OF company_id ON documents
WHEN COALESCE(NEW.company_id, '') <> ''
 AND EXISTS (
   SELECT 1 FROM companies c
    WHERE c.id = NEW.company_id
      AND COALESCE(TRIM(c.expense_category), '') <> ''
 )
BEGIN
  UPDATE documents
     SET metadata = json_set(
       CASE WHEN json_valid(metadata) THEN metadata ELSE '{}' END,
       '$.reportCategory', (
         SELECT expense_category FROM companies WHERE id = NEW.company_id LIMIT 1
       )
     )
   WHERE id = NEW.id;
END;

-- Yeni İşNet/muhasebe belgesi firmasız geldiyse önce VKN, sonra kayıtlı alias ile otomatik eşleştir.
DROP TRIGGER IF EXISTS trg_document_auto_match_company_insert;
CREATE TRIGGER trg_document_auto_match_company_insert
AFTER INSERT ON documents
WHEN COALESCE(NEW.company_id, '') = ''
BEGIN
  UPDATE documents
     SET company_id = COALESCE(
       (
         SELECT c.id
           FROM companies c
          WHERE c.main_company_slug = NEW.main_company_slug
            AND c.deleted_at IS NULL
            AND COALESCE(c.tax_no, '') <> ''
            AND REPLACE(REPLACE(REPLACE(COALESCE(c.tax_no, ''), ' ', ''), '-', ''), '.', '') =
                REPLACE(REPLACE(REPLACE(COALESCE(
                  json_extract(CASE WHEN json_valid(NEW.metadata) THEN NEW.metadata ELSE '{}' END, '$.taxNo'),
                  json_extract(CASE WHEN json_valid(NEW.metadata) THEN NEW.metadata ELSE '{}' END, '$.supplierTaxNo'),
                  json_extract(CASE WHEN json_valid(NEW.metadata) THEN NEW.metadata ELSE '{}' END, '$.vkn'),
                  json_extract(CASE WHEN json_valid(NEW.raw) THEN NEW.raw ELSE '{}' END, '$.taxNo'),
                  json_extract(CASE WHEN json_valid(NEW.raw) THEN NEW.raw ELSE '{}' END, '$.supplierTaxNo'),
                  json_extract(CASE WHEN json_valid(NEW.raw) THEN NEW.raw ELSE '{}' END, '$.vkn'),
                  ''
                ), ' ', ''), '-', ''), '.', '')
          LIMIT 1
       ),
       (
         SELECT a.company_id
           FROM company_aliases a
          WHERE a.main_company_slug = NEW.main_company_slug
            AND a.deleted_at IS NULL
            AND a.is_active = 1
            AND UPPER(TRIM(a.raw_name)) = UPPER(TRIM(COALESCE(
              json_extract(CASE WHEN json_valid(NEW.metadata) THEN NEW.metadata ELSE '{}' END, '$.companyName'),
              json_extract(CASE WHEN json_valid(NEW.metadata) THEN NEW.metadata ELSE '{}' END, '$.supplierName'),
              json_extract(CASE WHEN json_valid(NEW.metadata) THEN NEW.metadata ELSE '{}' END, '$.firma'),
              json_extract(CASE WHEN json_valid(NEW.raw) THEN NEW.raw ELSE '{}' END, '$.companyName'),
              json_extract(CASE WHEN json_valid(NEW.raw) THEN NEW.raw ELSE '{}' END, '$.supplierName'),
              json_extract(CASE WHEN json_valid(NEW.raw) THEN NEW.raw ELSE '{}' END, '$.firma'),
              ''
            )))
          LIMIT 1
       )
     ),
         firm_match_status = CASE
           WHEN company_id IS NOT NULL AND company_id <> '' THEN firm_match_status
           ELSE CASE WHEN COALESCE(
             (
               SELECT c.id FROM companies c
                WHERE c.main_company_slug = NEW.main_company_slug
                  AND c.deleted_at IS NULL
                  AND COALESCE(c.tax_no, '') <> ''
                  AND REPLACE(REPLACE(REPLACE(COALESCE(c.tax_no, ''), ' ', ''), '-', ''), '.', '') =
                      REPLACE(REPLACE(REPLACE(COALESCE(
                        json_extract(CASE WHEN json_valid(NEW.metadata) THEN NEW.metadata ELSE '{}' END, '$.taxNo'),
                        json_extract(CASE WHEN json_valid(NEW.metadata) THEN NEW.metadata ELSE '{}' END, '$.supplierTaxNo'),
                        json_extract(CASE WHEN json_valid(NEW.metadata) THEN NEW.metadata ELSE '{}' END, '$.vkn'),
                        json_extract(CASE WHEN json_valid(NEW.raw) THEN NEW.raw ELSE '{}' END, '$.taxNo'),
                        json_extract(CASE WHEN json_valid(NEW.raw) THEN NEW.raw ELSE '{}' END, '$.supplierTaxNo'),
                        json_extract(CASE WHEN json_valid(NEW.raw) THEN NEW.raw ELSE '{}' END, '$.vkn'),
                        ''
                      ), ' ', ''), '-', ''), '.', '')
                LIMIT 1
             ),
             (
               SELECT a.company_id FROM company_aliases a
                WHERE a.main_company_slug = NEW.main_company_slug
                  AND a.deleted_at IS NULL
                  AND a.is_active = 1
                  AND UPPER(TRIM(a.raw_name)) = UPPER(TRIM(COALESCE(
                    json_extract(CASE WHEN json_valid(NEW.metadata) THEN NEW.metadata ELSE '{}' END, '$.companyName'),
                    json_extract(CASE WHEN json_valid(NEW.metadata) THEN NEW.metadata ELSE '{}' END, '$.supplierName'),
                    json_extract(CASE WHEN json_valid(NEW.metadata) THEN NEW.metadata ELSE '{}' END, '$.firma'),
                    json_extract(CASE WHEN json_valid(NEW.raw) THEN NEW.raw ELSE '{}' END, '$.companyName'),
                    json_extract(CASE WHEN json_valid(NEW.raw) THEN NEW.raw ELSE '{}' END, '$.supplierName'),
                    json_extract(CASE WHEN json_valid(NEW.raw) THEN NEW.raw ELSE '{}' END, '$.firma'),
                    ''
                  )))
                LIMIT 1
             ),
             ''
           ) <> '' THEN 'MATCHED' ELSE COALESCE(firm_match_status, 'PENDING') END
         END
   WHERE id = NEW.id
     AND main_company_slug = NEW.main_company_slug;
END;
