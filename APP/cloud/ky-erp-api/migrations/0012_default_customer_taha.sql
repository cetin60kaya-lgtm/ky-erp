-- KY ERP Desen + İmalat varsayılan müşteri kuralı.
-- Kullanıcı kararı: mevcut Desen modelleri ve mevcut üretim modelleri TAHA GİYİM'e bağlanır.
-- Bundan sonra firma boş gelen Desen/İmalat modeli otomatik TAHA olur.
-- Kullanıcı başka bir müşteri seçerse bu seçim korunur; trigger yalnız firma tamamen boşken devreye girer.

PRAGMA defer_foreign_keys = true;

-- 1) Mevcut Desen Havuzunun tamamını TAHA GİYİM'e bağla.
UPDATE json_store
   SET data = json_set(
     CASE WHEN json_valid(data) THEN data ELSE '{}' END,
     '$.companyId', (
       SELECT id
         FROM companies
        WHERE main_company_slug = 'mecit-hakan'
          AND deleted_at IS NULL
          AND name LIKE 'TAHA%'
        ORDER BY CASE WHEN name LIKE 'TAHA GİYİM%' THEN 0 ELSE 1 END, name
        LIMIT 1
     ),
     '$.companyName', (
       SELECT name
         FROM companies
        WHERE main_company_slug = 'mecit-hakan'
          AND deleted_at IS NULL
          AND name LIKE 'TAHA%'
        ORDER BY CASE WHEN name LIKE 'TAHA GİYİM%' THEN 0 ELSE 1 END, name
        LIMIT 1
     )
   ),
       updated_at = CURRENT_TIMESTAMP
 WHERE scope = 'DESEN_WORKFLOW_MODEL'
   AND main_company_slug = 'mecit-hakan'
   AND EXISTS (
     SELECT 1 FROM companies
      WHERE main_company_slug = 'mecit-hakan'
        AND deleted_at IS NULL
        AND name LIKE 'TAHA%'
   );

-- 2) Şu anda üretimde açılmış model varsa onu da TAHA'ya bağla.
UPDATE model_records
   SET company_id = (
         SELECT id FROM companies
          WHERE main_company_slug = 'mecit-hakan'
            AND deleted_at IS NULL
            AND name LIKE 'TAHA%'
          ORDER BY CASE WHEN name LIKE 'TAHA GİYİM%' THEN 0 ELSE 1 END, name
          LIMIT 1
       ),
       customer_id = (
         SELECT id FROM companies
          WHERE main_company_slug = 'mecit-hakan'
            AND deleted_at IS NULL
            AND name LIKE 'TAHA%'
          ORDER BY CASE WHEN name LIKE 'TAHA GİYİM%' THEN 0 ELSE 1 END, name
          LIMIT 1
       ),
       customer_name = (
         SELECT name FROM companies
          WHERE main_company_slug = 'mecit-hakan'
            AND deleted_at IS NULL
            AND name LIKE 'TAHA%'
          ORDER BY CASE WHEN name LIKE 'TAHA GİYİM%' THEN 0 ELSE 1 END, name
          LIMIT 1
       ),
       updated_at = CURRENT_TIMESTAMP
 WHERE main_company_slug = 'mecit-hakan'
   AND deleted_at IS NULL
   AND EXISTS (
     SELECT 1 FROM companies
      WHERE main_company_slug = 'mecit-hakan'
        AND deleted_at IS NULL
        AND name LIKE 'TAHA%'
   );

-- 3) UXP / klasör köprüsü / manuel Desen kaydı firma göndermediyse otomatik TAHA ata.
DROP TRIGGER IF EXISTS trg_desen_model_default_taha_insert;
CREATE TRIGGER trg_desen_model_default_taha_insert
AFTER INSERT ON json_store
WHEN NEW.scope = 'DESEN_WORKFLOW_MODEL'
 AND NEW.main_company_slug = 'mecit-hakan'
 AND COALESCE(json_extract(NEW.data, '$.companyId'), '') = ''
 AND COALESCE(json_extract(NEW.data, '$.companyName'), '') = ''
BEGIN
  UPDATE json_store
     SET data = json_set(
       CASE WHEN json_valid(NEW.data) THEN NEW.data ELSE '{}' END,
       '$.companyId', (
         SELECT id FROM companies
          WHERE main_company_slug = 'mecit-hakan'
            AND deleted_at IS NULL
            AND name LIKE 'TAHA%'
          ORDER BY CASE WHEN name LIKE 'TAHA GİYİM%' THEN 0 ELSE 1 END, name
          LIMIT 1
       ),
       '$.companyName', (
         SELECT name FROM companies
          WHERE main_company_slug = 'mecit-hakan'
            AND deleted_at IS NULL
            AND name LIKE 'TAHA%'
          ORDER BY CASE WHEN name LIKE 'TAHA GİYİM%' THEN 0 ELSE 1 END, name
          LIMIT 1
       )
     ),
         updated_at = CURRENT_TIMESTAMP
   WHERE id = NEW.id
     AND EXISTS (
       SELECT 1 FROM companies
        WHERE main_company_slug = 'mecit-hakan'
          AND deleted_at IS NULL
          AND name LIKE 'TAHA%'
     );
END;

DROP TRIGGER IF EXISTS trg_desen_model_default_taha_update;
CREATE TRIGGER trg_desen_model_default_taha_update
AFTER UPDATE OF data ON json_store
WHEN NEW.scope = 'DESEN_WORKFLOW_MODEL'
 AND NEW.main_company_slug = 'mecit-hakan'
 AND COALESCE(json_extract(NEW.data, '$.companyId'), '') = ''
 AND COALESCE(json_extract(NEW.data, '$.companyName'), '') = ''
BEGIN
  UPDATE json_store
     SET data = json_set(
       CASE WHEN json_valid(NEW.data) THEN NEW.data ELSE '{}' END,
       '$.companyId', (
         SELECT id FROM companies
          WHERE main_company_slug = 'mecit-hakan'
            AND deleted_at IS NULL
            AND name LIKE 'TAHA%'
          ORDER BY CASE WHEN name LIKE 'TAHA GİYİM%' THEN 0 ELSE 1 END, name
          LIMIT 1
       ),
       '$.companyName', (
         SELECT name FROM companies
          WHERE main_company_slug = 'mecit-hakan'
            AND deleted_at IS NULL
            AND name LIKE 'TAHA%'
          ORDER BY CASE WHEN name LIKE 'TAHA GİYİM%' THEN 0 ELSE 1 END, name
          LIMIT 1
       )
     ),
         updated_at = CURRENT_TIMESTAMP
   WHERE id = NEW.id
     AND EXISTS (
       SELECT 1 FROM companies
        WHERE main_company_slug = 'mecit-hakan'
          AND deleted_at IS NULL
          AND name LIKE 'TAHA%'
     );
END;

-- 4) Manuel İmalat modeli herhangi bir istemciden firmasız gelirse otomatik TAHA ata.
DROP TRIGGER IF EXISTS trg_production_model_default_taha_insert;
CREATE TRIGGER trg_production_model_default_taha_insert
AFTER INSERT ON model_records
WHEN NEW.main_company_slug = 'mecit-hakan'
 AND COALESCE(NEW.company_id, '') = ''
 AND COALESCE(NEW.customer_id, '') = ''
 AND COALESCE(NEW.customer_name, '') = ''
BEGIN
  UPDATE model_records
     SET company_id = (
           SELECT id FROM companies
            WHERE main_company_slug = 'mecit-hakan'
              AND deleted_at IS NULL
              AND name LIKE 'TAHA%'
            ORDER BY CASE WHEN name LIKE 'TAHA GİYİM%' THEN 0 ELSE 1 END, name
            LIMIT 1
         ),
         customer_id = (
           SELECT id FROM companies
            WHERE main_company_slug = 'mecit-hakan'
              AND deleted_at IS NULL
              AND name LIKE 'TAHA%'
            ORDER BY CASE WHEN name LIKE 'TAHA GİYİM%' THEN 0 ELSE 1 END, name
            LIMIT 1
         ),
         customer_name = (
           SELECT name FROM companies
            WHERE main_company_slug = 'mecit-hakan'
              AND deleted_at IS NULL
              AND name LIKE 'TAHA%'
            ORDER BY CASE WHEN name LIKE 'TAHA GİYİM%' THEN 0 ELSE 1 END, name
            LIMIT 1
         ),
         updated_at = CURRENT_TIMESTAMP
   WHERE id = NEW.id
     AND EXISTS (
       SELECT 1 FROM companies
        WHERE main_company_slug = 'mecit-hakan'
          AND deleted_at IS NULL
          AND name LIKE 'TAHA%'
     );
END;

DROP TRIGGER IF EXISTS trg_production_model_default_taha_update;
CREATE TRIGGER trg_production_model_default_taha_update
AFTER UPDATE OF company_id, customer_id, customer_name ON model_records
WHEN NEW.main_company_slug = 'mecit-hakan'
 AND COALESCE(NEW.company_id, '') = ''
 AND COALESCE(NEW.customer_id, '') = ''
 AND COALESCE(NEW.customer_name, '') = ''
BEGIN
  UPDATE model_records
     SET company_id = (
           SELECT id FROM companies
            WHERE main_company_slug = 'mecit-hakan'
              AND deleted_at IS NULL
              AND name LIKE 'TAHA%'
            ORDER BY CASE WHEN name LIKE 'TAHA GİYİM%' THEN 0 ELSE 1 END, name
            LIMIT 1
         ),
         customer_id = (
           SELECT id FROM companies
            WHERE main_company_slug = 'mecit-hakan'
              AND deleted_at IS NULL
              AND name LIKE 'TAHA%'
            ORDER BY CASE WHEN name LIKE 'TAHA GİYİM%' THEN 0 ELSE 1 END, name
            LIMIT 1
         ),
         customer_name = (
           SELECT name FROM companies
            WHERE main_company_slug = 'mecit-hakan'
              AND deleted_at IS NULL
              AND name LIKE 'TAHA%'
            ORDER BY CASE WHEN name LIKE 'TAHA GİYİM%' THEN 0 ELSE 1 END, name
            LIMIT 1
         ),
         updated_at = CURRENT_TIMESTAMP
   WHERE id = NEW.id
     AND EXISTS (
       SELECT 1 FROM companies
        WHERE main_company_slug = 'mecit-hakan'
          AND deleted_at IS NULL
          AND name LIKE 'TAHA%'
     );
END;

PRAGMA defer_foreign_keys = false;
