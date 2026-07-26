-- Prisma's SQLite connector expects nullable JSON fields to use the same JSONB
-- declaration as the other document-intake JSON columns. Preserve valid legacy
-- content while correcting the column affinity.
ALTER TABLE "document_intake_lines"
  RENAME COLUMN "match_candidates_json" TO "match_candidates_json_legacy";

ALTER TABLE "document_intake_lines"
  ADD COLUMN "match_candidates_json" JSONB;

UPDATE "document_intake_lines"
SET "match_candidates_json" = CASE
  WHEN json_valid("match_candidates_json_legacy") = 1
    THEN "match_candidates_json_legacy"
  ELSE json_quote("match_candidates_json_legacy")
END
WHERE "match_candidates_json_legacy" IS NOT NULL;

ALTER TABLE "document_intake_lines"
  DROP COLUMN "match_candidates_json_legacy";
