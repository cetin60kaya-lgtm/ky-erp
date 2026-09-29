-- KY ERP Muhasebe tam temiz başlangıç - Ağustos 2026.
-- Amaç: Muhasebe ekranındaki eski firma/cari/belge/çek verilerini temizlemek,
-- Ağustos kayıtlarını kullanıcı yeniden girdikçe firmaları tekrar görünür yapmak.
-- Desen / İmalat firma bağlantıları bozulmasın diye companies kayıtları fiziksel olarak silinmez.

PRAGMA defer_foreign_keys = true;

-- 1) Muhasebe belge ve hareket verilerini tamamen sıfırla.
DELETE FROM document_files WHERE main_company_slug = 'mecit-hakan';
DELETE FROM invoice_items WHERE main_company_slug = 'mecit-hakan';
DELETE FROM documents WHERE main_company_slug = 'mecit-hakan';

DELETE FROM customer_dispatch_lines WHERE main_company_slug = 'mecit-hakan';
DELETE FROM document_intake_matches
 WHERE document_intake_id IN (
   SELECT id FROM document_intakes WHERE main_company_slug = 'mecit-hakan'
 );
DELETE FROM document_intake_lines
 WHERE document_intake_id IN (
   SELECT id FROM document_intakes WHERE main_company_slug = 'mecit-hakan'
 );
DELETE FROM document_intakes WHERE main_company_slug = 'mecit-hakan';

DELETE FROM current_account_movements WHERE main_company_slug = 'mecit-hakan';
DELETE FROM cari_movements WHERE main_company_id IN ('mecit-hakan', 'main-mecit-hakan');
DELETE FROM vat_records WHERE main_company_slug = 'mecit-hakan';
DELETE FROM payments WHERE main_company_slug = 'mecit-hakan';
DELETE FROM checks WHERE main_company_slug = 'mecit-hakan';
DELETE FROM sales_invoice_states WHERE main_company_slug = 'mecit-hakan';
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

-- JSON tabanlı Muhasebe hareketleri de sıfırlanır. Ayar/şablon/ürün aliasları korunur.
DELETE FROM json_store
 WHERE main_company_slug = 'mecit-hakan'
   AND scope IN (
     'MUHASEBE_CHEQUE',
     'MUHASEBE_CARD',
     'MUHASEBE_PAYMENT',
     'MUHASEBE_MANUAL_EXPENSE',
     'MUHASEBE_FIXED_EXPENSE',
     'MUHASEBE_MAIL_TRACKING'
   );

-- 2) Eski firma kartlarını Muhasebe görünümünde başlangıç dışı işaretle.
-- Fiziksel kayıtlar Desen/İmalat bağlantıları için korunur.
UPDATE companies
   SET opening_balance = 0,
       current_balance = 0,
       note = CASE
         WHEN instr(COALESCE(note, ''), '[[ACC_RESET_2026_08]]') > 0 THEN note
         WHEN COALESCE(TRIM(note), '') = '' THEN '[[ACC_RESET_2026_08]]'
         ELSE note || char(10) || '[[ACC_RESET_2026_08]]'
       END,
       updated_at = CURRENT_TIMESTAMP
 WHERE main_company_slug = 'mecit-hakan'
   AND deleted_at IS NULL;

-- 3) Ağustos'tan itibaren yeni belge/cari hareket geldiğinde mevcut firma tekrar aktif muhasebe listesine çıkar.
DROP TRIGGER IF EXISTS trg_accounting_reactivate_company_from_document;
CREATE TRIGGER trg_accounting_reactivate_company_from_document
AFTER INSERT ON documents
WHEN NEW.main_company_slug = 'mecit-hakan'
 AND COALESCE(NEW.company_id, '') <> ''
BEGIN
  UPDATE companies
     SET note = NULLIF(TRIM(REPLACE(COALESCE(note, ''), '[[ACC_RESET_2026_08]]', '')), ''),
         opening_balance = 0,
         updated_at = CURRENT_TIMESTAMP
   WHERE id = NEW.company_id
     AND main_company_slug = 'mecit-hakan';
END;

DROP TRIGGER IF EXISTS trg_accounting_reactivate_company_from_movement;
CREATE TRIGGER trg_accounting_reactivate_company_from_movement
AFTER INSERT ON current_account_movements
WHEN NEW.main_company_slug = 'mecit-hakan'
 AND COALESCE(NEW.company_id, '') <> ''
BEGIN
  UPDATE companies
     SET note = NULLIF(TRIM(REPLACE(COALESCE(note, ''), '[[ACC_RESET_2026_08]]', '')), ''),
         opening_balance = 0,
         updated_at = CURRENT_TIMESTAMP
   WHERE id = NEW.company_id
     AND main_company_slug = 'mecit-hakan';
END;

PRAGMA defer_foreign_keys = false;
