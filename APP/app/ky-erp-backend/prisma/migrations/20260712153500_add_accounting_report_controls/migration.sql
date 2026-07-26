-- Existing accounting source records are intentionally untouched.
ALTER TABLE "muhasebe_rapor_manuel_kalemler" ADD COLUMN "belge_no" TEXT;
ALTER TABLE "muhasebe_rapor_manuel_kalemler" ADD COLUMN "resmi_tip" TEXT NOT NULL DEFAULT 'GAYRI_RESMI';
ALTER TABLE "muhasebe_rapor_manuel_kalemler" ADD COLUMN "kdv_orani" DECIMAL NOT NULL DEFAULT 0;
ALTER TABLE "muhasebe_rapor_manuel_kalemler" ADD COLUMN "rapora_dahil" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "muhasebe_rapor_manuel_kalemler" ADD COLUMN "odeme_sekli" TEXT;
ALTER TABLE "muhasebe_rapor_manuel_kalemler" ADD COLUMN "not" TEXT;
ALTER TABLE "muhasebe_rapor_manuel_kalemler" ADD COLUMN "cariye_ekle" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "muhasebe_rapor_manuel_kalemler" ADD COLUMN "cari_hareket_id" TEXT;

CREATE TABLE "muhasebe_rapor_kayit_ayarlari" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "main_company_slug" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "report_included" BOOLEAN,
    "report_category_id" TEXT,
    "report_amount" DECIMAL,
    "report_description" TEXT,
    "report_official_type" TEXT,
    "report_vat_amount" DECIMAL,
    "report_vat_included" BOOLEAN,
    "report_expense_status" TEXT,
    "report_note" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "muhasebe_rapor_kayit_ayarlari_main_company_slug_source_type_source_id_key"
ON "muhasebe_rapor_kayit_ayarlari"("main_company_slug", "source_type", "source_id");
CREATE INDEX "muhasebe_rapor_kayit_ayarlari_main_company_slug_report_included_idx"
ON "muhasebe_rapor_kayit_ayarlari"("main_company_slug", "report_included");
CREATE INDEX "muhasebe_rapor_kayit_ayarlari_report_category_id_idx"
ON "muhasebe_rapor_kayit_ayarlari"("report_category_id");
