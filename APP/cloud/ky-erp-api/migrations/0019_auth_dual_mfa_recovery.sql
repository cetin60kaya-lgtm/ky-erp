-- KY ERP çift Authenticator + kurtarma kodu güvenlik yükseltmesi.
-- Google ve Microsoft TOTP kayıtları birbirinden bağımsız tutulur.
-- Eski mfa_secret/mfa_enabled alanları veri kaybı olmadan yalnız geçiş için korunur;
-- ilk başarılı eski MFA doğrulamasından sonra kullanıcı iki sağlayıcıyı ayrı ayrı kurar.

ALTER TABLE auth_user_security ADD COLUMN google_mfa_secret TEXT;
ALTER TABLE auth_user_security ADD COLUMN google_mfa_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_user_security ADD COLUMN microsoft_mfa_secret TEXT;
ALTER TABLE auth_user_security ADD COLUMN microsoft_mfa_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_user_security ADD COLUMN recovery_codes_acknowledged INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS auth_recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  used_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_recovery_codes_hash
  ON auth_recovery_codes (code_hash);
CREATE INDEX IF NOT EXISTS idx_auth_recovery_codes_user
  ON auth_recovery_codes (user_id, used_at, created_at);
