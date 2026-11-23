-- ISOLATED QA D1 ONLY. Do not execute on ky-erp-db / production.
CREATE TABLE IF NOT EXISTS qa_sessions (
 session_hash TEXT PRIMARY KEY,
 iv TEXT NOT NULL,
 ciphertext TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 client_tag TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS qa_login_attempts (
 ip_hash TEXT PRIMARY KEY,
 tries INTEGER NOT NULL,
 window_start INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qa_sessions_expiry ON qa_sessions(expires_at);