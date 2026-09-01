-- KY ERP 0027
-- Legacy tek-firma doneminde main_company_slug NULL kalan IsNet verilerini
-- mevcut Hakan Emprime tenantina baglar. Yeni coklu firma mimarisinde IsNet
-- kayitlari global/NULL olamaz; diger firmalar kendi saglayici/tenant kaydini kullanir.

UPDATE json_store
   SET main_company_slug = 'mecit-hakan',
       updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
 WHERE main_company_slug IS NULL
   AND scope LIKE 'ISNET_%';
