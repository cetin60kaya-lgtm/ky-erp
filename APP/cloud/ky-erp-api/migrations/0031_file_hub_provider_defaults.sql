-- File Hub provider tercihi firma bazlidir. Bu migration belirli bir Google Drive/OneDrive
-- baglantisi olusturmaz; yalniz ortak amac kodlarini dokumante eden metadata kaydini tutar.
-- Gercek storage connection ve klasor mapping Yönetim > Dosya Merkezi ekranindan firma bazinda tanimlanir.

INSERT OR IGNORE INTO json_store
  (id, scope, main_company_slug, file_name, data, created_at, updated_at)
VALUES
  ('file-hub-purpose-catalog-v1', 'FILE_HUB_SYSTEM', NULL, 'PURPOSE_CATALOG',
   '{"version":1,"purposes":["MODEL_IMAGE","MODEL_SOURCE","PLACEMENT","OUTGOING_DESIGN","RIP_PDF","INVOICE","E_DOCUMENT","PERSONNEL_DOCUMENT","RECIPE","QUALITY","GENERIC"],"providerNeutral":true}',
   datetime('now'), datetime('now'));
