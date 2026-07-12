-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "main_companies" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "main_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "legacy_id" TEXT,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SATICI',
    "tax_no" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "default_record_type" TEXT DEFAULT 'RESMI',
    "default_vat_rate" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "vat_included_mode" TEXT DEFAULT 'HARIC',
    "current_balance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_aliases" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "raw_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "current_account_movements" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "movement_type" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "document_no" TEXT,
    "description" TEXT,
    "debit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "effect" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "balance_after" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "legacy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "current_account_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "company_id" TEXT,
    "document_no" TEXT,
    "document_type" TEXT,
    "source_type" TEXT,
    "date" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_files" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "action_type" TEXT NOT NULL,
    "description" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "actor" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MuhasebeLog" (
    "id" SERIAL NOT NULL,
    "tarihSaat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modul" TEXT NOT NULL,
    "islemTipi" TEXT NOT NULL,
    "firma" TEXT NOT NULL,
    "belgeNo" TEXT,
    "modelAdi" TEXT,
    "aciklama" TEXT NOT NULL,

    CONSTRAINT "MuhasebeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirmaEsleme" (
    "id" SERIAL NOT NULL,
    "anaFirma" TEXT NOT NULL,
    "bagliFirma" TEXT NOT NULL,
    "tip" TEXT NOT NULL,

    CONSTRAINT "FirmaEsleme_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailKisi" (
    "id" SERIAL NOT NULL,
    "firma" TEXT NOT NULL,
    "departman" TEXT NOT NULL,
    "adSoyad" TEXT NOT NULL,
    "eposta" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "varsayilan" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MailKisi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KdvTakip" (
    "id" SERIAL NOT NULL,
    "firma" TEXT NOT NULL,
    "ay" TEXT NOT NULL,
    "yil" TEXT NOT NULL,
    "devredenKdv" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gelenKdv" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gidenKdv" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "KdvTakip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IrsaliyeFaturaKayit" (
    "id" SERIAL NOT NULL,
    "firma" TEXT NOT NULL,
    "irsaliyeNo" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "adet" INTEGER NOT NULL,
    "faturalananAdet" INTEGER NOT NULL DEFAULT 0,
    "kalanAdet" INTEGER NOT NULL DEFAULT 0,
    "durum" TEXT NOT NULL,

    CONSTRAINT "IrsaliyeFaturaKayit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "main_companies_slug_key" ON "main_companies"("slug");

-- CreateIndex
CREATE INDEX "users_main_company_slug_idx" ON "users"("main_company_slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_main_company_slug_email_key" ON "users"("main_company_slug", "email");

-- CreateIndex
CREATE INDEX "roles_main_company_slug_idx" ON "roles"("main_company_slug");

-- CreateIndex
CREATE UNIQUE INDEX "roles_main_company_slug_name_key" ON "roles"("main_company_slug", "name");

-- CreateIndex
CREATE INDEX "permissions_main_company_slug_idx" ON "permissions"("main_company_slug");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_main_company_slug_code_key" ON "permissions"("main_company_slug", "code");

-- CreateIndex
CREATE INDEX "companies_main_company_slug_idx" ON "companies"("main_company_slug");

-- CreateIndex
CREATE INDEX "companies_main_company_slug_normalized_name_idx" ON "companies"("main_company_slug", "normalized_name");

-- CreateIndex
CREATE INDEX "companies_main_company_slug_is_active_idx" ON "companies"("main_company_slug", "is_active");

-- CreateIndex
CREATE INDEX "companies_main_company_slug_updated_at_idx" ON "companies"("main_company_slug", "updated_at");

-- CreateIndex
CREATE INDEX "companies_main_company_slug_current_balance_idx" ON "companies"("main_company_slug", "current_balance");

-- CreateIndex
CREATE UNIQUE INDEX "companies_main_company_slug_legacy_id_key" ON "companies"("main_company_slug", "legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_main_company_slug_normalized_name_key" ON "companies"("main_company_slug", "normalized_name");

-- CreateIndex
CREATE INDEX "company_aliases_main_company_slug_idx" ON "company_aliases"("main_company_slug");

-- CreateIndex
CREATE INDEX "company_aliases_main_company_slug_normalized_name_idx" ON "company_aliases"("main_company_slug", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "company_aliases_main_company_slug_normalized_name_key" ON "company_aliases"("main_company_slug", "normalized_name");

-- CreateIndex
CREATE INDEX "current_account_movements_main_company_slug_idx" ON "current_account_movements"("main_company_slug");

-- CreateIndex
CREATE INDEX "current_account_movements_company_id_date_idx" ON "current_account_movements"("company_id", "date");

-- CreateIndex
CREATE INDEX "current_account_movements_main_company_slug_date_idx" ON "current_account_movements"("main_company_slug", "date");

-- CreateIndex
CREATE INDEX "documents_main_company_slug_idx" ON "documents"("main_company_slug");

-- CreateIndex
CREATE INDEX "documents_main_company_slug_date_idx" ON "documents"("main_company_slug", "date");

-- CreateIndex
CREATE INDEX "document_files_main_company_slug_idx" ON "document_files"("main_company_slug");

-- CreateIndex
CREATE INDEX "document_files_document_id_idx" ON "document_files"("document_id");

-- CreateIndex
CREATE INDEX "activity_logs_main_company_slug_idx" ON "activity_logs"("main_company_slug");

-- CreateIndex
CREATE INDEX "activity_logs_main_company_slug_created_at_idx" ON "activity_logs"("main_company_slug", "created_at");

-- CreateIndex
CREATE INDEX "jobs_main_company_slug_idx" ON "jobs"("main_company_slug");

-- CreateIndex
CREATE INDEX "jobs_main_company_slug_status_idx" ON "jobs"("main_company_slug", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_main_company_slug_fkey" FOREIGN KEY ("main_company_slug") REFERENCES "main_companies"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_main_company_slug_fkey" FOREIGN KEY ("main_company_slug") REFERENCES "main_companies"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_main_company_slug_fkey" FOREIGN KEY ("main_company_slug") REFERENCES "main_companies"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_main_company_slug_fkey" FOREIGN KEY ("main_company_slug") REFERENCES "main_companies"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_aliases" ADD CONSTRAINT "company_aliases_main_company_slug_fkey" FOREIGN KEY ("main_company_slug") REFERENCES "main_companies"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_aliases" ADD CONSTRAINT "company_aliases_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "current_account_movements" ADD CONSTRAINT "current_account_movements_main_company_slug_fkey" FOREIGN KEY ("main_company_slug") REFERENCES "main_companies"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "current_account_movements" ADD CONSTRAINT "current_account_movements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_main_company_slug_fkey" FOREIGN KEY ("main_company_slug") REFERENCES "main_companies"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_main_company_slug_fkey" FOREIGN KEY ("main_company_slug") REFERENCES "main_companies"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_main_company_slug_fkey" FOREIGN KEY ("main_company_slug") REFERENCES "main_companies"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_main_company_slug_fkey" FOREIGN KEY ("main_company_slug") REFERENCES "main_companies"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

