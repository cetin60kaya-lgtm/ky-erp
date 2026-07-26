-- Geri dönüş: önce ai_* tablolarını ayrı bir yedeğe aktarın; ardından bu
-- CREATE sırasının tersinde DROP TABLE uygulayın. Migration mevcut ERP
-- tablolarını değiştirmez veya veri silmez.
CREATE TABLE "ai_conversations" (
  "id" TEXT NOT NULL PRIMARY KEY, "user_id" TEXT NOT NULL,
  "main_company_slug" TEXT, "title" TEXT NOT NULL, "module_context" JSONB,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL, "deleted_at" DATETIME
);
CREATE TABLE "ai_messages" (
  "id" TEXT NOT NULL PRIMARY KEY, "conversation_id" TEXT NOT NULL,
  "role" TEXT NOT NULL, "content" TEXT NOT NULL, "tool_name" TEXT,
  "tool_payload" JSONB, "token_input" INTEGER NOT NULL DEFAULT 0,
  "token_output" INTEGER NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id")
    REFERENCES "ai_conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ai_pending_actions" (
  "id" TEXT NOT NULL PRIMARY KEY, "conversation_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL, "action_type" TEXT NOT NULL,
  "action_payload" JSONB NOT NULL, "confirmation_token_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "expires_at" DATETIME NOT NULL,
  "approved_at" DATETIME, "executed_at" DATETIME,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_pending_actions_conversation_id_fkey" FOREIGN KEY ("conversation_id")
    REFERENCES "ai_conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ai_audit_logs" (
  "id" TEXT NOT NULL PRIMARY KEY, "user_id" TEXT NOT NULL,
  "conversation_id" TEXT, "operation" TEXT NOT NULL, "module" TEXT,
  "record_type" TEXT, "record_id" TEXT, "before_data" JSONB,
  "after_data" JSONB, "success" BOOLEAN NOT NULL DEFAULT true,
  "error_message" TEXT, "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ai_usage_daily" (
  "id" TEXT NOT NULL PRIMARY KEY, "user_id" TEXT NOT NULL,
  "usage_date" TEXT NOT NULL, "request_count" INTEGER NOT NULL DEFAULT 0,
  "input_tokens" INTEGER NOT NULL DEFAULT 0, "output_tokens" INTEGER NOT NULL DEFAULT 0,
  "estimated_cost" DECIMAL NOT NULL DEFAULT 0,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" DATETIME NOT NULL
);
CREATE INDEX "ai_conversations_user_id_updated_at_idx" ON "ai_conversations"("user_id", "updated_at");
CREATE INDEX "ai_conversations_main_company_slug_idx" ON "ai_conversations"("main_company_slug");
CREATE INDEX "ai_messages_conversation_id_created_at_idx" ON "ai_messages"("conversation_id", "created_at");
CREATE INDEX "ai_pending_actions_user_id_status_idx" ON "ai_pending_actions"("user_id", "status");
CREATE INDEX "ai_pending_actions_conversation_id_status_idx" ON "ai_pending_actions"("conversation_id", "status");
CREATE INDEX "ai_audit_logs_user_id_created_at_idx" ON "ai_audit_logs"("user_id", "created_at");
CREATE INDEX "ai_audit_logs_conversation_id_idx" ON "ai_audit_logs"("conversation_id");
CREATE UNIQUE INDEX "ai_usage_daily_user_id_usage_date_key" ON "ai_usage_daily"("user_id", "usage_date");
CREATE INDEX "ai_usage_daily_usage_date_idx" ON "ai_usage_daily"("usage_date");
