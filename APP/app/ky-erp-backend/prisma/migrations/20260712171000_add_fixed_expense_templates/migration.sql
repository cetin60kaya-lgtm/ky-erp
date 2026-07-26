ALTER TABLE "muhasebe_rapor_manuel_kalemler" ADD COLUMN "sabit_sablon_id" TEXT;
ALTER TABLE "muhasebe_rapor_manuel_kalemler" ADD COLUMN "tahakkuk_ayi" TEXT;

CREATE UNIQUE INDEX "muhasebe_rapor_manuel_kalemler_sabit_sablon_id_tahakkuk_ayi_key"
ON "muhasebe_rapor_manuel_kalemler"("sabit_sablon_id", "tahakkuk_ayi");

CREATE TABLE "muhasebe_sabit_gider_sablonlari" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "main_company_slug" TEXT NOT NULL,
  "ad" TEXT NOT NULL,
  "kategori_id" TEXT,
  "firma_id" TEXT,
  "tutar" DECIMAL NOT NULL DEFAULT 0,
  "resmi_tip" TEXT NOT NULL DEFAULT 'GAYRI_RESMI',
  "kdv_orani" DECIMAL NOT NULL DEFAULT 0,
  "baslangic_ayi" TEXT NOT NULL,
  "bitis_ayi" TEXT,
  "her_ay_otomatik" BOOLEAN NOT NULL DEFAULT true,
  "cariye_ekle" BOOLEAN NOT NULL DEFAULT false,
  "aktif_mi" BOOLEAN NOT NULL DEFAULT true,
  "aciklama" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "deleted_at" DATETIME
);
CREATE INDEX "muhasebe_sabit_gider_sablonlari_main_company_slug_aktif_mi_idx"
ON "muhasebe_sabit_gider_sablonlari"("main_company_slug", "aktif_mi");
CREATE INDEX "muhasebe_sabit_gider_sablonlari_kategori_id_idx"
ON "muhasebe_sabit_gider_sablonlari"("kategori_id");
