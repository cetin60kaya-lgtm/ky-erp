-- KY ERP GLOBAL MFA ENFORCEMENT V1
-- Idempotent security transition. No business data is deleted.

UPDATE auth_user_security
   SET login_policy = CASE
         WHEN UPPER(COALESCE(login_policy,'')) IN ('GOOGLE','MICROSOFT','ANY_MFA','BOTH_MFA')
           THEN UPPER(login_policy)
         ELSE 'ANY_MFA'
       END,
       session_seconds = 36000,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE UPPER(COALESCE(login_policy,'')) NOT IN ('GOOGLE','MICROSOFT','ANY_MFA','BOTH_MFA')
    OR COALESCE(session_seconds,0) <> 36000;

UPDATE auth_sessions
   SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       revoked_by = COALESCE(revoked_by,user_id)
 WHERE revoked_at IS NULL
   AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
   AND NOT EXISTS (
     SELECT 1
       FROM auth_system_secrets
      WHERE secret_key='GLOBAL_MFA_ENFORCED_V1'
   );

INSERT OR IGNORE INTO auth_system_secrets(secret_key,secret_value,created_at,updated_at)
VALUES (
  'GLOBAL_MFA_ENFORCED_V1',
  'MFA_REQUIRED_ACTIVE_SESSIONS_REVOKED',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);
