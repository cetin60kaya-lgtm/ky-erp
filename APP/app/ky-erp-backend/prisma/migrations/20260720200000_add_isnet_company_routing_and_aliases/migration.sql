-- Geriye dönük ve veri silmeden İŞNET yönlendirme alanları.
ALTER TABLE "companies" ADD COLUMN "company_type" TEXT NOT NULL DEFAULT 'SUPPLIER';
ALTER TABLE "document_intake_lines" ADD COLUMN "order_no" TEXT;
ALTER TABLE "document_intake_lines" ADD COLUMN "product_code" TEXT;
ALTER TABLE "document_intake_lines" ADD COLUMN "color" TEXT;
ALTER TABLE "document_intake_lines" ADD COLUMN "region" TEXT;
ALTER TABLE "document_intake_lines" ADD COLUMN "match_confidence" DECIMAL;
ALTER TABLE "document_intake_lines" ADD COLUMN "match_status" TEXT;
ALTER TABLE "document_intake_lines" ADD COLUMN "match_candidates_json" JSON;
ALTER TABLE "isnet_document_states" ADD COLUMN "uuid" TEXT;
ALTER TABLE "isnet_document_states" ADD COLUMN "issuer_tax_no" TEXT;
ALTER TABLE "isnet_document_states" ADD COLUMN "receiver_tax_no" TEXT;
ALTER TABLE "isnet_document_states" ADD COLUMN "company_id" TEXT;
ALTER TABLE "isnet_document_states" ADD COLUMN "company_type" TEXT;
ALTER TABLE "isnet_document_states" ADD COLUMN "document_class" TEXT;
ALTER TABLE "isnet_document_states" ADD COLUMN "pdf_status" TEXT;
ALTER TABLE "isnet_document_states" ADD COLUMN "xml_status" TEXT;

UPDATE "companies"
SET "company_type" = CASE
  WHEN upper("name") IN ('TAHA GİYİM', 'REN FASHION', 'MİND TEKSTİL') THEN 'CUSTOMER'
  WHEN upper(coalesce("firma_turu", '')) IN ('BOTH', 'HEM MÜŞTERİ HEM TEDARİKÇİ') THEN 'BOTH'
  WHEN upper(coalesce("firma_turu", '')) IN ('CUSTOMER', 'MÜŞTERİ', 'MUSTERI') THEN 'CUSTOMER'
  ELSE 'SUPPLIER'
END;

CREATE TABLE "isnet_model_aliases" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "main_company_slug" TEXT NOT NULL,
  "company_id" TEXT,
  "raw_text" TEXT NOT NULL,
  "normalized_text" TEXT NOT NULL,
  "order_no" TEXT,
  "product_code" TEXT,
  "model_id" TEXT NOT NULL,
  "confidence" DECIMAL NOT NULL DEFAULT 100,
  "approved" BOOLEAN NOT NULL DEFAULT 0,
  "approved_by" TEXT,
  "approved_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" DATETIME,
  "usage_count" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "isnet_model_aliases_company_text_idx" ON "isnet_model_aliases"("main_company_slug", "company_id", "normalized_text");
CREATE INDEX "isnet_model_aliases_model_idx" ON "isnet_model_aliases"("main_company_slug", "model_id");
