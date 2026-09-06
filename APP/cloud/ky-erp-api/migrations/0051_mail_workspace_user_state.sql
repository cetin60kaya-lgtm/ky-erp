-- KY ERP Mail Workspace UX
-- Additive-only. Production'da yalnız full D1 backup + targeted migration kapısından sonra uygulanır.

CREATE TABLE IF NOT EXISTS mail_message_user_state (
  id TEXT PRIMARY KEY,
  main_company_slug TEXT NOT NULL,
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  is_pinned INTEGER NOT NULL DEFAULT 0 CHECK(is_pinned IN (0,1)),
  pinned_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(main_company_slug,user_id,message_id),
  FOREIGN KEY(message_id) REFERENCES mail_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mail_message_user_state_pinned
  ON mail_message_user_state(main_company_slug,user_id,is_pinned,pinned_at);
