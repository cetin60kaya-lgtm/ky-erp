-- KY ERP authentication security policy + owner recovery
-- Existing users preserve MFA behavior through ANY_MFA and 8 hour session defaults.

ALTER TABLE auth_user_security ADD COLUMN login_policy TEXT NOT NULL DEFAULT 'ANY_MFA';
ALTER TABLE auth_user_security ADD COLUMN session_seconds INTEGER NOT NULL DEFAULT 28800;
ALTER TABLE auth_user_security ADD COLUMN recovery_phone TEXT;
ALTER TABLE auth_user_security ADD COLUMN recovery_phone_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_user_security ADD COLUMN owner_recovery_enabled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE auth_login_challenges ADD COLUMN policy_snapshot TEXT;
ALTER TABLE auth_login_challenges ADD COLUMN session_seconds_snapshot INTEGER;
ALTER TABLE auth_login_challenges ADD COLUMN google_verified_at TEXT;
ALTER TABLE auth_login_challenges ADD COLUMN microsoft_verified_at TEXT;

CREATE TABLE IF NOT EXISTS auth_owner_recovery_questions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  answer_hash TEXT NOT NULL,
  answer_salt TEXT NOT NULL,
  answer_iterations INTEGER NOT NULL DEFAULT 180000,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, position)
);

CREATE INDEX IF NOT EXISTS idx_auth_owner_recovery_questions_user
  ON auth_owner_recovery_questions(user_id, position);

CREATE TABLE IF NOT EXISTS auth_owner_recovery_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  channel TEXT NOT NULL,
  destination_masked TEXT,
  challenge_token_hash TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  otp_salt TEXT NOT NULL,
  question_ids TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  answer_attempt_count INTEGER NOT NULL DEFAULT 0,
  send_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  locked_until TEXT,
  verified_at TEXT,
  consumed_at TEXT,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_owner_recovery_challenges_user
  ON auth_owner_recovery_challenges(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_owner_recovery_challenges_active
  ON auth_owner_recovery_challenges(user_id, consumed_at, expires_at);

-- Application owner is never allowed to fall back to password-only login.
UPDATE auth_user_security
   SET login_policy='ANY_MFA',
       session_seconds=CASE
         WHEN session_seconds < 1800 THEN 1800
         WHEN session_seconds > 28800 THEN 28800
         ELSE session_seconds
       END,
       updated_at=CURRENT_TIMESTAMP
 WHERE user_id IN (
   SELECT u.id
     FROM auth_users u
    WHERE UPPER(COALESCE((SELECT role_override FROM auth_user_security s WHERE s.user_id=u.id), u.role, '')) IN ('SUPER_ADMIN','ADMIN')
 );
