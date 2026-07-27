-- Additive Desen workflow migration. Existing Desen, Boyahane and Storage data is preserved.

ALTER TABLE "design_files" ADD COLUMN "model_id" TEXT;
ALTER TABLE "design_files" ADD COLUMN "operation_id" TEXT;
ALTER TABLE "design_files" ADD COLUMN "file_role" TEXT;
ALTER TABLE "design_files" ADD COLUMN "original_file_name" TEXT;
ALTER TABLE "design_files" ADD COLUMN "stored_file_name" TEXT;
ALTER TABLE "design_files" ADD COLUMN "storage_path" TEXT;
ALTER TABLE "design_files" ADD COLUMN "file_hash" TEXT;
ALTER TABLE "design_files" ADD COLUMN "file_size" INTEGER;
ALTER TABLE "design_files" ADD COLUMN "source_type" TEXT;
ALTER TABLE "design_files" ADD COLUMN "source_external_id" TEXT;
ALTER TABLE "design_files" ADD COLUMN "preview_path" TEXT;
ALTER TABLE "design_files" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "design_files" ADD COLUMN "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "design_files_model_id_idx" ON "design_files"("model_id");
CREATE INDEX "design_files_operation_id_idx" ON "design_files"("operation_id");
CREATE INDEX "design_files_file_hash_idx" ON "design_files"("file_hash");

CREATE TABLE "design_models" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "main_company_slug" TEXT NOT NULL,
  "company_id" TEXT,
  "model_code" TEXT,
  "model_name" TEXT NOT NULL,
  "design_name" TEXT,
  "ground_color" TEXT,
  "main_image_file_id" TEXT,
  "source_type" TEXT NOT NULL DEFAULT 'MANUAL_UPLOAD',
  "source_external_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'NEW_ARRIVAL',
  "notes" TEXT,
  "metadata" JSONB,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE INDEX "design_models_main_company_slug_idx" ON "design_models"("main_company_slug");
CREATE INDEX "design_models_company_id_idx" ON "design_models"("company_id");
CREATE INDEX "design_models_model_name_idx" ON "design_models"("model_name");
CREATE INDEX "design_models_status_idx" ON "design_models"("status");
CREATE UNIQUE INDEX "design_models_main_company_slug_source_type_source_external_id_key" ON "design_models"("main_company_slug", "source_type", "source_external_id");

CREATE TABLE "design_model_operations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "model_id" TEXT NOT NULL,
  "print_area_code" TEXT NOT NULL,
  "print_area_name" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "mold_type" TEXT,
  "mold_width" REAL,
  "mold_height" REAL,
  "model_image_file_id" TEXT,
  "channel_image_file_id" TEXT,
  "placement_file_id" TEXT,
  "placement_status" TEXT NOT NULL DEFAULT 'WAITING',
  "dyehouse_status" TEXT NOT NULL DEFAULT 'WAITING',
  "production_ready" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "metadata" JSONB,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "design_model_operations_model_id_print_area_code_key" ON "design_model_operations"("model_id", "print_area_code");
CREATE INDEX "design_model_operations_model_id_idx" ON "design_model_operations"("model_id");
CREATE INDEX "design_model_operations_placement_status_idx" ON "design_model_operations"("placement_status");
CREATE INDEX "design_model_operations_dyehouse_status_idx" ON "design_model_operations"("dyehouse_status");

CREATE TABLE "design_operation_channels" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "operation_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "raw_name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "channel_type" TEXT NOT NULL DEFAULT 'OTHER',
  "color_code" TEXT,
  "color_group_id" TEXT,
  "registered_color_id" TEXT,
  "included" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "design_operation_channels_operation_id_sequence_key" ON "design_operation_channels"("operation_id", "sequence");
CREATE INDEX "design_operation_channels_operation_id_idx" ON "design_operation_channels"("operation_id");
CREATE INDEX "design_operation_channels_color_group_id_idx" ON "design_operation_channels"("color_group_id");

CREATE TABLE "design_color_groups" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "operation_id" TEXT NOT NULL,
  "group_key" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "color_code" TEXT,
  "registered_color_id" TEXT,
  "mold_count" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'UNRESOLVED',
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "design_color_groups_operation_id_group_key_key" ON "design_color_groups"("operation_id", "group_key");
CREATE INDEX "design_color_groups_operation_id_idx" ON "design_color_groups"("operation_id");
CREATE INDEX "design_color_groups_registered_color_id_idx" ON "design_color_groups"("registered_color_id");

CREATE TABLE "design_import_queue" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "main_company_slug" TEXT NOT NULL,
  "source_type" TEXT NOT NULL DEFAULT 'FOLDER_SCAN',
  "source_external_id" TEXT,
  "original_path" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "file_hash" TEXT,
  "file_size" INTEGER NOT NULL DEFAULT 0,
  "modified_at" DATETIME,
  "mime_type" TEXT,
  "suggested_model_name" TEXT,
  "suggested_role" TEXT,
  "group_key" TEXT,
  "status" TEXT NOT NULL DEFAULT 'READY',
  "error_message" TEXT,
  "metadata" JSONB,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL,
  "processed_at" DATETIME
);

CREATE UNIQUE INDEX "design_import_queue_main_company_slug_original_path_key" ON "design_import_queue"("main_company_slug", "original_path");
CREATE INDEX "design_import_queue_main_company_slug_idx" ON "design_import_queue"("main_company_slug");
CREATE INDEX "design_import_queue_file_hash_idx" ON "design_import_queue"("file_hash");
CREATE INDEX "design_import_queue_group_key_idx" ON "design_import_queue"("group_key");
CREATE INDEX "design_import_queue_status_idx" ON "design_import_queue"("status");

CREATE TABLE "design_action_logs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "model_id" TEXT,
  "operation_id" TEXT,
  "file_id" TEXT,
  "user_id" TEXT,
  "action" TEXT NOT NULL,
  "old_value_json" JSONB,
  "new_value_json" JSONB,
  "description" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "design_action_logs_model_id_idx" ON "design_action_logs"("model_id");
CREATE INDEX "design_action_logs_operation_id_idx" ON "design_action_logs"("operation_id");
CREATE INDEX "design_action_logs_file_id_idx" ON "design_action_logs"("file_id");
