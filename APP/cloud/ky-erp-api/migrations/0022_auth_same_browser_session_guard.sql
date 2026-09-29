-- KY ERP auth session stability guard
--
-- Purpose:
-- - A browser profile receives a persistent BROWSER:<uuid> device_label from the frontend.
-- - A new successful login for the same user + same browser profile supersedes the
--   previous still-active session instead of leaving multiple active rows.
-- - Different computers, browser profiles and devices remain independent.
-- - Existing active sessions are NOT modified when this migration is applied.
--   The trigger runs only for future INSERT operations.

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_device_active
  ON auth_sessions (user_id, device_label, revoked_at, expires_at);

CREATE TRIGGER IF NOT EXISTS trg_auth_sessions_replace_same_browser
BEFORE INSERT ON auth_sessions
WHEN NEW.device_label IS NOT NULL
  AND NEW.device_label LIKE 'BROWSER:%'
BEGIN
  -- Keep a security-history record before superseding the older token(s).
  INSERT INTO auth_security_audit
    (id, actor_user_id, target_user_id, main_company_slug, action, session_id, ip_address, detail, created_at)
  SELECT
    lower(hex(randomblob(16))),
    NEW.user_id,
    s.user_id,
    s.main_company_slug,
    'SESSION_REPLACED_SAME_BROWSER',
    s.id,
    NEW.ip_address,
    '{"reason":"SAME_BROWSER_REPLACED","replacement":"NEW_LOGIN_SAME_BROWSER"}',
    NEW.created_at
  FROM auth_sessions s
  WHERE s.user_id = NEW.user_id
    AND s.device_label = NEW.device_label
    AND s.revoked_at IS NULL
    AND s.expires_at > NEW.created_at;

  UPDATE auth_sessions
     SET revoked_at = NEW.created_at,
         revoked_by = NEW.user_id
   WHERE user_id = NEW.user_id
     AND device_label = NEW.device_label
     AND revoked_at IS NULL
     AND expires_at > NEW.created_at;
END;
