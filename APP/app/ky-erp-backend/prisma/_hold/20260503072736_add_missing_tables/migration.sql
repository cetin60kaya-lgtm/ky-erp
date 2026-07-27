-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "payment_type" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'OUT',
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "bank_name" TEXT,
    "account_name" TEXT,
    "description" TEXT,
    "document_no" TEXT,
    "source_type" TEXT NOT NULL DEFAULT 'PAYMENT',
    "current_account_movement_id" TEXT,
    "legacy_id" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checks" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "company_id" TEXT,
    "check_no" TEXT NOT NULL,
    "bank_name" TEXT,
    "branch_name" TEXT,
    "due_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'bekliyor',
    "direction" TEXT NOT NULL DEFAULT 'IN',
    "description" TEXT,
    "reminder_date" TIMESTAMP(3),
    "current_account_movement_id" TEXT,
    "legacy_id" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_cards" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "bank_name" TEXT,
    "card_name" TEXT NOT NULL,
    "last_four_digits" TEXT,
    "period" TEXT,
    "total_debt" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "minimum_payment" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "due_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "legacy_id" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_card_movements" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "credit_card_id" TEXT NOT NULL,
    "movement_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "description" TEXT,
    "usage_purpose" TEXT,
    "company_id" TEXT,
    "document_id" TEXT,
    "current_account_movement_id" TEXT,
    "legacy_id" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_card_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_contacts" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "company_id" TEXT,
    "company_name" TEXT,
    "department" TEXT,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "legacy_id" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_send_logs" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "document_id" TEXT,
    "to_email" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_send_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "product_id" TEXT,
    "line_no" INTEGER,
    "product_name" TEXT,
    "normalized_product_name" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "unit_price" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "lot_no" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_carry_forwards" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "period_month" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vat_carry_forwards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_records" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "model_code" TEXT,
    "order_no" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_document_links" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_document_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_production_links" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "production_record_id" TEXT NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_production_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_images" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "thumbnail_path" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_shift_defaults" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machine_shift_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_records" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "model_id" TEXT,
    "model_name" TEXT,
    "order_no" TEXT,
    "ground_color" TEXT,
    "machine_name" TEXT,
    "total_quantity" INTEGER NOT NULL DEFAULT 0,
    "machinist" TEXT,
    "assistant" TEXT,
    "serimci" TEXT,
    "fikse_temperature" TEXT,
    "fikse_speed" TEXT,
    "print_area" TEXT,
    "fabric_defect" TEXT,
    "print_defect" TEXT,
    "shift" TEXT,
    "production_date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_size_items" (
    "id" TEXT NOT NULL,
    "production_record_id" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_size_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnel" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_wage_entries" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "shift" TEXT NOT NULL,
    "note" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_wage_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_wage_entry_people" (
    "id" TEXT NOT NULL,
    "daily_wage_entry_id" TEXT NOT NULL,
    "personnel_id" TEXT NOT NULL,
    "hours" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_wage_entry_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_payment_slips" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_payment_slips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_hr_records" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "personnel_id" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_hr_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_leave_records" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "personnel_id" TEXT,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "overtime_leave_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_records" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "personnel_id" TEXT,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_control_records" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "month" TEXT,
    "amount" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_control_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_records" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "design_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_files" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "design_record_id" TEXT,
    "file_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_model_links" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "design_record_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "design_model_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "layout_records" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "layout_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mold_layout_records" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mold_layout_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dyehouse_models" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "model_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dyehouse_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dyehouse_colors" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "dyehouse_model_id" TEXT,
    "color_name" TEXT NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dyehouse_colors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dyehouse_grammage_records" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "dyehouse_model_id" TEXT,
    "grammage" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dyehouse_grammage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dyehouse_recipe_items" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "dyehouse_model_id" TEXT,
    "product_id" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dyehouse_recipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_material_lots" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "product_id" TEXT,
    "lot_no" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_material_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot_consumptions" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "lot_id" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "description" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_records" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_files" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "audit_record_id" TEXT,
    "file_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_physical_locations" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "audit_record_id" TEXT NOT NULL,
    "has_physical_copy" BOOLEAN NOT NULL DEFAULT false,
    "folder_color" TEXT,
    "folder_no" TEXT,
    "shelf" TEXT,
    "file_order" TEXT,
    "original_place" TEXT,
    "archive_status" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_physical_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_categories" (
    "id" TEXT NOT NULL,
    "main_company_slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_main_company_slug_idx" ON "payments"("main_company_slug");
CREATE INDEX "payments_main_company_slug_company_id_idx" ON "payments"("main_company_slug", "company_id");
CREATE INDEX "payments_main_company_slug_payment_date_idx" ON "payments"("main_company_slug", "payment_date");
CREATE UNIQUE INDEX "payments_main_company_slug_legacy_id_key" ON "payments"("main_company_slug", "legacy_id");

-- CreateIndex
CREATE INDEX "checks_main_company_slug_idx" ON "checks"("main_company_slug");
CREATE INDEX "checks_main_company_slug_status_idx" ON "checks"("main_company_slug", "status");
CREATE INDEX "checks_main_company_slug_due_date_idx" ON "checks"("main_company_slug", "due_date");
CREATE UNIQUE INDEX "checks_main_company_slug_legacy_id_key" ON "checks"("main_company_slug", "legacy_id");

-- CreateIndex
CREATE INDEX "credit_cards_main_company_slug_idx" ON "credit_cards"("main_company_slug");
CREATE INDEX "credit_cards_main_company_slug_is_active_idx" ON "credit_cards"("main_company_slug", "is_active");
CREATE UNIQUE INDEX "credit_cards_main_company_slug_legacy_id_key" ON "credit_cards"("main_company_slug", "legacy_id");

-- CreateIndex
CREATE INDEX "credit_card_movements_main_company_slug_idx" ON "credit_card_movements"("main_company_slug");
CREATE INDEX "credit_card_movements_main_company_slug_credit_card_id_idx" ON "credit_card_movements"("main_company_slug", "credit_card_id");
CREATE INDEX "credit_card_movements_main_company_slug_movement_date_idx" ON "credit_card_movements"("main_company_slug", "movement_date");
CREATE UNIQUE INDEX "credit_card_movements_main_company_slug_legacy_id_key" ON "credit_card_movements"("main_company_slug", "legacy_id");

-- CreateIndex
CREATE INDEX "mail_contacts_main_company_slug_idx" ON "mail_contacts"("main_company_slug");
CREATE INDEX "mail_contacts_main_company_slug_email_idx" ON "mail_contacts"("main_company_slug", "email");
CREATE UNIQUE INDEX "mail_contacts_main_company_slug_legacy_id_key" ON "mail_contacts"("main_company_slug", "legacy_id");

-- CreateIndex
CREATE INDEX "mail_send_logs_main_company_slug_idx" ON "mail_send_logs"("main_company_slug");
CREATE INDEX "mail_send_logs_main_company_slug_created_at_idx" ON "mail_send_logs"("main_company_slug", "created_at");

-- CreateIndex
CREATE INDEX "invoice_items_main_company_slug_idx" ON "invoice_items"("main_company_slug");
CREATE INDEX "invoice_items_main_company_slug_document_id_idx" ON "invoice_items"("main_company_slug", "document_id");

-- CreateIndex
CREATE INDEX "vat_carry_forwards_main_company_slug_idx" ON "vat_carry_forwards"("main_company_slug");
CREATE UNIQUE INDEX "vat_carry_forwards_main_company_slug_period_month_key" ON "vat_carry_forwards"("main_company_slug", "period_month");

-- CreateIndex
CREATE INDEX "model_records_main_company_slug_idx" ON "model_records"("main_company_slug");
CREATE INDEX "model_records_main_company_slug_status_idx" ON "model_records"("main_company_slug", "status");

-- CreateIndex
CREATE INDEX "model_document_links_main_company_slug_idx" ON "model_document_links"("main_company_slug");
CREATE UNIQUE INDEX "model_document_links_main_company_slug_model_id_document_id_key" ON "model_document_links"("main_company_slug", "model_id", "document_id");

-- CreateIndex
CREATE INDEX "model_production_links_main_company_slug_idx" ON "model_production_links"("main_company_slug");
CREATE UNIQUE INDEX "model_production_links_main_company_slug_model_id_production_record_id_key" ON "model_production_links"("main_company_slug", "model_id", "production_record_id");

-- CreateIndex
CREATE INDEX "model_images_main_company_slug_idx" ON "model_images"("main_company_slug");
CREATE INDEX "model_images_main_company_slug_model_id_idx" ON "model_images"("main_company_slug", "model_id");

-- CreateIndex
CREATE INDEX "machines_main_company_slug_idx" ON "machines"("main_company_slug");
CREATE UNIQUE INDEX "machines_main_company_slug_name_key" ON "machines"("main_company_slug", "name");

-- CreateIndex
CREATE INDEX "machine_shift_defaults_main_company_slug_idx" ON "machine_shift_defaults"("main_company_slug");

-- CreateIndex
CREATE INDEX "production_records_main_company_slug_idx" ON "production_records"("main_company_slug");
CREATE INDEX "production_records_main_company_slug_production_date_idx" ON "production_records"("main_company_slug", "production_date");

-- CreateIndex
CREATE INDEX "production_size_items_production_record_id_idx" ON "production_size_items"("production_record_id");

-- CreateIndex
CREATE INDEX "personnel_main_company_slug_idx" ON "personnel"("main_company_slug");

-- CreateIndex
CREATE INDEX "daily_wage_entries_main_company_slug_idx" ON "daily_wage_entries"("main_company_slug");
CREATE INDEX "daily_wage_entries_main_company_slug_entry_date_idx" ON "daily_wage_entries"("main_company_slug", "entry_date");

-- CreateIndex
CREATE INDEX "daily_wage_entry_people_daily_wage_entry_id_idx" ON "daily_wage_entry_people"("daily_wage_entry_id");
CREATE UNIQUE INDEX "daily_wage_entry_people_daily_wage_entry_id_personnel_id_key" ON "daily_wage_entry_people"("daily_wage_entry_id", "personnel_id");

-- CreateIndex
CREATE INDEX "weekly_payment_slips_main_company_slug_idx" ON "weekly_payment_slips"("main_company_slug");

-- CreateIndex
CREATE INDEX "monthly_hr_records_main_company_slug_idx" ON "monthly_hr_records"("main_company_slug");
CREATE INDEX "monthly_hr_records_main_company_slug_month_idx" ON "monthly_hr_records"("main_company_slug", "month");

-- CreateIndex
CREATE INDEX "overtime_leave_records_main_company_slug_idx" ON "overtime_leave_records"("main_company_slug");

-- CreateIndex
CREATE INDEX "payroll_records_main_company_slug_idx" ON "payroll_records"("main_company_slug");

-- CreateIndex
CREATE INDEX "payment_control_records_main_company_slug_idx" ON "payment_control_records"("main_company_slug");

-- CreateIndex
CREATE INDEX "design_records_main_company_slug_idx" ON "design_records"("main_company_slug");

-- CreateIndex
CREATE INDEX "design_files_main_company_slug_idx" ON "design_files"("main_company_slug");

-- CreateIndex
CREATE INDEX "design_model_links_main_company_slug_idx" ON "design_model_links"("main_company_slug");

-- CreateIndex
CREATE INDEX "layout_records_main_company_slug_idx" ON "layout_records"("main_company_slug");

-- CreateIndex
CREATE INDEX "mold_layout_records_main_company_slug_idx" ON "mold_layout_records"("main_company_slug");

-- CreateIndex
CREATE INDEX "dyehouse_models_main_company_slug_idx" ON "dyehouse_models"("main_company_slug");

-- CreateIndex
CREATE INDEX "dyehouse_colors_main_company_slug_idx" ON "dyehouse_colors"("main_company_slug");

-- CreateIndex
CREATE INDEX "dyehouse_grammage_records_main_company_slug_idx" ON "dyehouse_grammage_records"("main_company_slug");

-- CreateIndex
CREATE INDEX "dyehouse_recipe_items_main_company_slug_idx" ON "dyehouse_recipe_items"("main_company_slug");

-- CreateIndex
CREATE INDEX "raw_material_lots_main_company_slug_idx" ON "raw_material_lots"("main_company_slug");
CREATE UNIQUE INDEX "raw_material_lots_main_company_slug_lot_no_key" ON "raw_material_lots"("main_company_slug", "lot_no");

-- CreateIndex
CREATE INDEX "lot_consumptions_main_company_slug_idx" ON "lot_consumptions"("main_company_slug");
CREATE INDEX "lot_consumptions_main_company_slug_lot_id_idx" ON "lot_consumptions"("main_company_slug", "lot_id");

-- CreateIndex
CREATE INDEX "audit_records_main_company_slug_idx" ON "audit_records"("main_company_slug");

-- CreateIndex
CREATE INDEX "audit_files_main_company_slug_idx" ON "audit_files"("main_company_slug");

-- CreateIndex
CREATE INDEX "audit_physical_locations_main_company_slug_idx" ON "audit_physical_locations"("main_company_slug");
CREATE UNIQUE INDEX "audit_physical_locations_main_company_slug_audit_record_id_key" ON "audit_physical_locations"("main_company_slug", "audit_record_id");

-- CreateIndex
CREATE INDEX "audit_categories_main_company_slug_idx" ON "audit_categories"("main_company_slug");
CREATE UNIQUE INDEX "audit_categories_main_company_slug_name_key" ON "audit_categories"("main_company_slug", "name");
