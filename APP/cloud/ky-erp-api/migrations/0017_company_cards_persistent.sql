-- KY ERP firma kartlari kalici ana rehberdir.
-- Muhasebe temiz baslangici firma kartlarini gizlemez; yalniz hareket/belge/bakiye sifirlanir.

PRAGMA defer_foreign_keys = true;

-- 0014 temiz baslangic isaretini tum aktif firma kartlarindan kaldir.
UPDATE companies
   SET note = NULLIF(
         TRIM(
           REPLACE(
             REPLACE(COALESCE(note, ''), '[[ACC_RESET_2026_08]]', ''),
             char(10) || char(10),
             char(10)
           )
         ),
         ''
       ),
       opening_balance = COALESCE(opening_balance, 0),
       current_balance = COALESCE(current_balance, 0),
       updated_at = CURRENT_TIMESTAMP
 WHERE main_company_slug = 'mecit-hakan'
   AND deleted_at IS NULL;

-- Firma kartlari artik belge/hareket gelince 'yeniden aktiflesme' mantigina ihtiyaç duymaz.
DROP TRIGGER IF EXISTS trg_accounting_reactivate_company_from_document;
DROP TRIGGER IF EXISTS trg_accounting_reactivate_company_from_movement;

PRAGMA defer_foreign_keys = false;
