ALTER TABLE "dyehouse_models" ADD COLUMN "model_card_id" TEXT;
ALTER TABLE "dyehouse_models" ADD COLUMN "design_id" TEXT;
ALTER TABLE "dyehouse_models" ADD COLUMN "company_id" TEXT;
ALTER TABLE "dyehouse_models" ADD COLUMN "order_id" TEXT;
ALTER TABLE "dyehouse_models" ADD COLUMN "order_no" TEXT;
ALTER TABLE "dyehouse_models" ADD COLUMN "print_region" TEXT;
ALTER TABLE "dyehouse_models" ADD COLUMN "planned_quantity" DECIMAL NOT NULL DEFAULT 0;
ALTER TABLE "dyehouse_models" ADD COLUMN "channel_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "dyehouse_models" ADD COLUMN "unique_color_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "dyehouse_models" ADD COLUMN "mold_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "dyehouse_models" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "dyehouse_models" ADD COLUMN "started_at" DATETIME;
ALTER TABLE "dyehouse_models" ADD COLUMN "completed_at" DATETIME;

ALTER TABLE "dyehouse_colors" ADD COLUMN "registered_color_id" TEXT;
ALTER TABLE "dyehouse_colors" ADD COLUMN "source_channel_key" TEXT;
ALTER TABLE "dyehouse_colors" ADD COLUMN "pantone" TEXT;
ALTER TABLE "dyehouse_colors" ADD COLUMN "paint_type" TEXT;
ALTER TABLE "dyehouse_colors" ADD COLUMN "recipe_id" TEXT;
ALTER TABLE "dyehouse_colors" ADD COLUMN "print_region" TEXT;
ALTER TABLE "dyehouse_colors" ADD COLUMN "planned_kg" DECIMAL NOT NULL DEFAULT 0;
ALTER TABLE "dyehouse_colors" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'WAITING';
ALTER TABLE "dyehouse_colors" ADD COLUMN "completed_at" DATETIME;
ALTER TABLE "dyehouse_colors" ADD COLUMN "deleted_at" DATETIME;

ALTER TABLE "model_dye_expenses" ADD COLUMN "source_production_id" TEXT;
ALTER TABLE "model_dye_expenses" ADD COLUMN "production_item_id" TEXT;
ALTER TABLE "model_dye_expenses" ADD COLUMN "estimated_cost" DECIMAL NOT NULL DEFAULT 0;
ALTER TABLE "model_dye_expenses" ADD COLUMN "snapshot" JSONB;

CREATE TABLE "dye_productions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "main_company_slug" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "job_color_id" TEXT NOT NULL,
  "color_id" TEXT,
  "recipe_id" TEXT,
  "pantone_snapshot" TEXT,
  "color_name_snapshot" TEXT NOT NULL,
  "paint_type_snapshot" TEXT NOT NULL,
  "version_snapshot" TEXT NOT NULL,
  "reference_total_gram" DECIMAL NOT NULL DEFAULT 0,
  "multiplier" DECIMAL NOT NULL DEFAULT 1,
  "production_total_gram" DECIMAL NOT NULL DEFAULT 0,
  "production_total_kg" DECIMAL NOT NULL DEFAULT 0,
  "job_type" TEXT NOT NULL DEFAULT 'PRODUCTION',
  "model_snapshot" TEXT NOT NULL,
  "company_snapshot" TEXT,
  "order_snapshot" TEXT,
  "print_region_snapshot" TEXT,
  "recipe_snapshot" JSONB NOT NULL,
  "created_by" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "dye_production_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "production_id" TEXT NOT NULL,
  "product_id" TEXT,
  "product_name_snapshot" TEXT NOT NULL,
  "reference_gram" DECIMAL NOT NULL DEFAULT 0,
  "percentage" DECIMAL NOT NULL DEFAULT 0,
  "production_gram" DECIMAL NOT NULL DEFAULT 0,
  "production_kg" DECIMAL NOT NULL DEFAULT 0,
  "lot_id" TEXT NOT NULL,
  "lot_no_snapshot" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "dyehouse_models_main_company_slug_status_idx" ON "dyehouse_models"("main_company_slug", "status");
CREATE INDEX "dyehouse_models_identity_idx" ON "dyehouse_models"("model_card_id", "company_id", "order_no", "print_region", "design_id");
CREATE INDEX "dyehouse_colors_main_company_slug_dyehouse_model_id_idx" ON "dyehouse_colors"("main_company_slug", "dyehouse_model_id");
CREATE UNIQUE INDEX "dyehouse_colors_job_source_key" ON "dyehouse_colors"("main_company_slug", "dyehouse_model_id", "source_channel_key");
CREATE INDEX "model_dye_expenses_company_production_idx" ON "model_dye_expenses"("main_company_slug", "source_production_id");
CREATE UNIQUE INDEX "dye_productions_company_request_key" ON "dye_productions"("main_company_slug", "request_id");
CREATE INDEX "dye_productions_company_job_idx" ON "dye_productions"("main_company_slug", "job_id");
CREATE INDEX "dye_productions_company_color_created_idx" ON "dye_productions"("main_company_slug", "color_id", "created_at");
CREATE INDEX "dye_production_items_production_id_idx" ON "dye_production_items"("production_id");
CREATE INDEX "dye_production_items_lot_id_idx" ON "dye_production_items"("lot_id");
