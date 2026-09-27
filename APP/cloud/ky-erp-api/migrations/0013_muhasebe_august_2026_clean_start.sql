-- KY ERP Muhasebe 2026 Ağustos temiz başlangıç.
-- Firma kartları korunur; muhasebe hareketlerinde yalnız 2026-08-01 <= tarih < 2026-09-01 kalır.
-- İK, Desen, Boyahane ve İmalat tablolarına dokunulmaz.

PRAGMA defer_foreign_keys = true;

-- Firma türlerini tek sözlüğe çek: MUSTERI / SUPPLIER / BOTH.
UPDATE companies
   SET type = 'SUPPLIER',
       firma_turu = 'SUPPLIER',
       updated_at = CURRENT_TIMESTAMP
 WHERE main_company_slug = 'mecit-hakan'
   AND UPPER(TRIM(type)) = 'SATICI';

UPDATE companies
   SET firma_turu = CASE UPPER(TRIM(type))
     WHEN 'MUSTERI' THEN 'CUSTOMER'
     WHEN 'SUPPLIER' THEN 'SUPPLIER'
     WHEN 'BOTH' THEN 'BOTH'
     ELSE firma_turu
   END,
       updated_at = CURRENT_TIMESTAMP
 WHERE main_company_slug = 'mecit-hakan';

-- Eski akışlardan tekrar SATICI gelirse otomatik SUPPLIER'a normalize et.
DROP TRIGGER IF EXISTS trg_companies_normalize_satici_insert;
CREATE TRIGGER trg_companies_normalize_satici_insert
AFTER INSERT ON companies
WHEN NEW.main_company_slug = 'mecit-hakan'
 AND UPPER(TRIM(COALESCE(NEW.type, ''))) = 'SATICI'
BEGIN
  UPDATE companies
     SET type = 'SUPPLIER', firma_turu = 'SUPPLIER', updated_at = CURRENT_TIMESTAMP
   WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS trg_companies_normalize_satici_update;
CREATE TRIGGER trg_companies_normalize_satici_update
AFTER UPDATE OF type ON companies
WHEN NEW.main_company_slug = 'mecit-hakan'
 AND UPPER(TRIM(COALESCE(NEW.type, ''))) = 'SATICI'
BEGIN
  UPDATE companies
     SET type = 'SUPPLIER', firma_turu = 'SUPPLIER', updated_at = CURRENT_TIMESTAMP
   WHERE id = NEW.id;
END;

-- Ana belge kayıtlarında Ağustos dışı çocukları önce temizle.
DELETE FROM document_files
 WHERE main_company_slug = 'mecit-hakan'
   AND document_id IN (
     SELECT id FROM documents
      WHERE main_company_slug = 'mecit-hakan'
        AND NOT (
          (typeof(date) IN ('integer','real') AND CAST(date AS INTEGER) >= 1785542400000 AND CAST(date AS INTEGER) < 1788220800000)
          OR (typeof(date) = 'text' AND substr(date, 1, 10) >= '2026-08-01' AND substr(date, 1, 10) < '2026-09-01')
        )
   );

DELETE FROM invoice_items
 WHERE main_company_slug = 'mecit-hakan'
   AND document_id IN (
     SELECT id FROM documents
      WHERE main_company_slug = 'mecit-hakan'
        AND NOT (
          (typeof(date) IN ('integer','real') AND CAST(date AS INTEGER) >= 1785542400000 AND CAST(date AS INTEGER) < 1788220800000)
          OR (typeof(date) = 'text' AND substr(date, 1, 10) >= '2026-08-01' AND substr(date, 1, 10) < '2026-09-01')
        )
   );

DELETE FROM documents
 WHERE main_company_slug = 'mecit-hakan'
   AND NOT (
     (typeof(date) IN ('integer','real') AND CAST(date AS INTEGER) >= 1785542400000 AND CAST(date AS INTEGER) < 1788220800000)
     OR (typeof(date) = 'text' AND substr(date, 1, 10) >= '2026-08-01' AND substr(date, 1, 10) < '2026-09-01')
   );

-- İşNet / belge alım havuzu: yalnız Ağustos kayıtları kalsın.
DELETE FROM customer_dispatch_lines
 WHERE main_company_slug = 'mecit-hakan'
   AND NOT (
     (typeof(created_at) IN ('integer','real') AND CAST(created_at AS INTEGER) >= 1785542400000 AND CAST(created_at AS INTEGER) < 1788220800000)
     OR (typeof(created_at) = 'text' AND substr(created_at, 1, 10) >= '2026-08-01' AND substr(created_at, 1, 10) < '2026-09-01')
   );

DELETE FROM document_intake_matches
 WHERE document_intake_id IN (
   SELECT id FROM document_intakes
    WHERE main_company_slug = 'mecit-hakan'
      AND NOT (
        (typeof(issue_date) IN ('integer','real') AND CAST(issue_date AS INTEGER) >= 1785542400000 AND CAST(issue_date AS INTEGER) < 1788220800000)
        OR (typeof(issue_date) = 'text' AND substr(issue_date, 1, 10) >= '2026-08-01' AND substr(issue_date, 1, 10) < '2026-09-01')
      )
 );

DELETE FROM document_intake_lines
 WHERE document_intake_id IN (
   SELECT id FROM document_intakes
    WHERE main_company_slug = 'mecit-hakan'
      AND NOT (
        (typeof(issue_date) IN ('integer','real') AND CAST(issue_date AS INTEGER) >= 1785542400000 AND CAST(issue_date AS INTEGER) < 1788220800000)
        OR (typeof(issue_date) = 'text' AND substr(issue_date, 1, 10) >= '2026-08-01' AND substr(issue_date, 1, 10) < '2026-09-01')
      )
 );

DELETE FROM document_intakes
 WHERE main_company_slug = 'mecit-hakan'
   AND NOT (
     (typeof(issue_date) IN ('integer','real') AND CAST(issue_date AS INTEGER) >= 1785542400000 AND CAST(issue_date AS INTEGER) < 1788220800000)
     OR (typeof(issue_date) = 'text' AND substr(issue_date, 1, 10) >= '2026-08-01' AND substr(issue_date, 1, 10) < '2026-09-01')
   );

-- Cari / KDV / ödeme hareketleri.
DELETE FROM current_account_movements
 WHERE main_company_slug = 'mecit-hakan'
   AND NOT (
     (typeof(movement_date) IN ('integer','real') AND CAST(movement_date AS INTEGER) >= 1785542400000 AND CAST(movement_date AS INTEGER) < 1788220800000)
     OR (typeof(movement_date) = 'text' AND substr(movement_date, 1, 10) >= '2026-08-01' AND substr(movement_date, 1, 10) < '2026-09-01')
   );

DELETE FROM cari_movements
 WHERE main_company_id IN ('mecit-hakan', 'main-mecit-hakan')
   AND NOT (
     (typeof(date) IN ('integer','real') AND CAST(date AS INTEGER) >= 1785542400000 AND CAST(date AS INTEGER) < 1788220800000)
     OR (typeof(date) = 'text' AND substr(date, 1, 10) >= '2026-08-01' AND substr(date, 1, 10) < '2026-09-01')
   );

DELETE FROM vat_records
 WHERE main_company_slug = 'mecit-hakan'
   AND NOT (
     (period_year = 2026 AND period_month = 8)
     OR (typeof(date) IN ('integer','real') AND CAST(date AS INTEGER) >= 1785542400000 AND CAST(date AS INTEGER) < 1788220800000)
     OR (typeof(date) = 'text' AND substr(date, 1, 10) >= '2026-08-01' AND substr(date, 1, 10) < '2026-09-01')
   );

DELETE FROM payments
 WHERE main_company_slug = 'mecit-hakan'
   AND NOT (
     (typeof(payment_date) IN ('integer','real') AND CAST(payment_date AS INTEGER) >= 1785542400000 AND CAST(payment_date AS INTEGER) < 1788220800000)
     OR (typeof(payment_date) = 'text' AND substr(payment_date, 1, 10) >= '2026-08-01' AND substr(payment_date, 1, 10) < '2026-09-01')
   );

DELETE FROM checks
 WHERE main_company_slug = 'mecit-hakan'
   AND NOT (
     (typeof(due_date) IN ('integer','real') AND CAST(due_date AS INTEGER) >= 1785542400000 AND CAST(due_date AS INTEGER) < 1788220800000)
     OR (typeof(due_date) = 'text' AND substr(due_date, 1, 10) >= '2026-08-01' AND substr(due_date, 1, 10) < '2026-09-01')
   );

DELETE FROM sales_invoice_states
 WHERE main_company_slug = 'mecit-hakan'
   AND NOT (
     (typeof(invoice_date) IN ('integer','real') AND CAST(invoice_date AS INTEGER) >= 1785542400000 AND CAST(invoice_date AS INTEGER) < 1788220800000)
     OR (typeof(invoice_date) = 'text' AND substr(invoice_date, 1, 10) >= '2026-08-01' AND substr(invoice_date, 1, 10) < '2026-09-01')
   );

-- Yardımcı muhasebe kayıtları temiz başlangıçta sıfırlanır.
DELETE FROM sales_invoice_history WHERE main_company_slug = 'mecit-hakan';
DELETE FROM sales_invoice_line_model_links WHERE main_company_slug = 'mecit-hakan';
DELETE FROM muhasebe_statement_compare_results WHERE main_company_slug = 'mecit-hakan';
DELETE FROM muhasebe_statement_imports WHERE main_company_slug = 'mecit-hakan';
DELETE FROM muhasebe_manual_customer_dispatches WHERE main_company_slug = 'mecit-hakan';
DELETE FROM muhasebe_mail_send_logs WHERE main_company_slug = 'mecit-hakan';
DELETE FROM muhasebe_supplier_invoice_lots WHERE main_company_slug = 'mecit-hakan';
DELETE FROM muhasebe_rapor_manuel_kalemler WHERE main_company_slug = 'mecit-hakan';
DELETE FROM payment_control_records WHERE main_company_slug = 'mecit-hakan';
DELETE FROM accounting_checks WHERE main_company_slug = 'mecit-hakan';
DELETE FROM accounting_payments WHERE main_company_slug = 'mecit-hakan';
DELETE FROM accounting_ledger_entries WHERE main_company_slug = 'mecit-hakan';
DELETE FROM accounting_invoices WHERE main_company_slug = 'mecit-hakan';
DELETE FROM accounting_documents WHERE main_company_slug = 'mecit-hakan';
DELETE FROM accounting_firms WHERE main_company_slug = 'mecit-hakan';
DELETE FROM cheque_payments WHERE main_company_slug = 'mecit-hakan';

-- Açılış ve eski bakiye taşınmaz; varsa Ağustos modern cari hareketlerinden yeniden hesaplanır.
UPDATE companies
   SET opening_balance = 0,
       current_balance = COALESCE((
         SELECT SUM(COALESCE(cam.effect, 0))
           FROM current_account_movements cam
          WHERE cam.main_company_slug = companies.main_company_slug
            AND cam.company_id = companies.id
       ), 0),
       updated_at = CURRENT_TIMESTAMP
 WHERE main_company_slug = 'mecit-hakan';

PRAGMA defer_foreign_keys = false;
