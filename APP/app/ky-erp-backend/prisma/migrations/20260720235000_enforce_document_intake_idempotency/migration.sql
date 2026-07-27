-- Bind every posted accounting document to exactly one intake record. This
-- database-level guard prevents double posting under concurrent API requests.
UPDATE "documents"
SET "target_record_id" = json_extract("raw", '$.documentIntakeId')
WHERE "target_module" = 'DOCUMENT_INTAKE'
  AND "target_record_id" IS NULL
  AND json_extract("raw", '$.documentIntakeId') IS NOT NULL;

CREATE UNIQUE INDEX "documents_main_company_slug_target_module_target_record_id_key"
ON "documents"("main_company_slug", "target_module", "target_record_id");
