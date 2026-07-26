CREATE UNIQUE INDEX IF NOT EXISTS "companies_main_company_slug_active_tax_no_key"
ON "companies" ("main_company_slug", "tax_no")
WHERE "deleted_at" IS NULL
  AND "tax_no" IS NOT NULL
  AND TRIM("tax_no") <> '';
