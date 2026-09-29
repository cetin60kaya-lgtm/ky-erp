-- KY ERP İmalat/Üretim temiz başlangıç migrationı.
-- Yalnız üretim merkezine ait kayıtları temizler.
-- Desen, Boyahane, İK, Muhasebe, İşNet belgeleri ve firma kayıtlarına dokunmaz.
-- Production release iş akışı migrationlardan önce D1 tam yedeği alır.

PRAGMA defer_foreign_keys = true;

DELETE FROM model_production_links
 WHERE main_company_slug = 'mecit-hakan';

DELETE FROM production_records
 WHERE main_company_slug = 'mecit-hakan';

DELETE FROM machine_shift_defaults
 WHERE main_company_slug = 'mecit-hakan';

DELETE FROM model_print_regions
 WHERE main_company_slug = 'mecit-hakan';

DELETE FROM model_document_links
 WHERE main_company_slug = 'mecit-hakan'
   AND model_id IN (
     SELECT id
       FROM model_records
      WHERE main_company_slug = 'mecit-hakan'
   );

DELETE FROM model_records
 WHERE main_company_slug = 'mecit-hakan';

DELETE FROM json_store
 WHERE main_company_slug = 'mecit-hakan'
   AND scope IN (
     'PRODUCTION_CENTER_ENTRY',
     'PRODUCTION_CENTER_MODEL',
     'PRODUCTION_CENTER_REQUEST',
     'PRODUCTION_MACHINE',
     'uretim.kayitlar',
     'URETIM_ENTRY',
     'uretim.makinalar',
     'IMALAT_MACHINE'
   );

PRAGMA defer_foreign_keys = false;
