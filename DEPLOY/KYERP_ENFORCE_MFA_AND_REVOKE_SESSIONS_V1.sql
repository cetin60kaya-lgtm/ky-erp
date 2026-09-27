-- KY ERP GLOBAL MFA ENFORCEMENT V1
-- Idempotent security transition. No business data is deleted.
-- Technical role/module codes are normalized before the MFA cutover.

UPDATE auth_users
   SET role = REPLACE(UPPER(TRIM(COALESCE(role,''))), 'İ', 'I')
 WHERE role IS NOT NULL
   AND role <> REPLACE(UPPER(TRIM(COALESCE(role,''))), 'İ', 'I');

UPDATE auth_user_security
   SET role_override = CASE
         WHEN TRIM(COALESCE(role_override,'')) = '' THEN NULL
         ELSE REPLACE(UPPER(TRIM(role_override)), 'İ', 'I')
       END,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
 WHERE role_override IS NOT NULL
   AND COALESCE(role_override,'') <> CASE
         WHEN TRIM(COALESCE(role_override,'')) = '' THEN ''
         ELSE REPLACE(UPPER(TRIM(role_override)), 'İ', 'I')
       END;

UPDATE auth_user_module_permissions
   SET module_key = REPLACE(UPPER(TRIM(COALESCE(module_key,''))), 'İ', 'I')
 WHERE module_key IS NOT NULL
   AND module_key <> REPLACE(UPPER(TRIM(COALESCE(module_key,''))), 'İ', 'I');

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
