-- KY ERP FINAL ROUND SECURITY CUTOVER V1 - 2026-09-01
-- İş verisini silmez. Teknik auth kodlarını canonical yapar, parola-only politikasını
-- MFA tabanına yükseltir ve bu final geçişte mevcut aktif oturumları yalnız bir kez kapatır.

UPDATE auth_users
   SET role = REPLACE(UPPER(TRIM(COALESCE(role,''))), 'İ', 'I')
 WHERE role IS NOT NULL
   AND role <> REPLACE(UPPER(TRIM(COALESCE(role,''))), 'İ', 'I');

UPDATE auth_user_security
   SET role_override = CASE
         WHEN TRIM(COALESCE(role_override,'')) = '' THEN NULL
         ELSE REPLACE(UPPER(TRIM(role_override)), 'İ', 'I')
       END,
       login_policy = CASE
         WHEN REPLACE(UPPER(TRIM(COALESCE(login_policy,''))), 'İ', 'I') IN ('GOOGLE','MICROSOFT','ANY_MFA','BOTH_MFA')
           THEN REPLACE(UPPER(TRIM(login_policy)), 'İ', 'I')
         ELSE 'ANY_MFA'
       END,
       session_seconds = 36000,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');

UPDATE auth_user_module_permissions
   SET module_key = REPLACE(UPPER(TRIM(COALESCE(module_key,''))), 'İ', 'I')
 WHERE module_key IS NOT NULL
   AND module_key <> REPLACE(UPPER(TRIM(COALESCE(module_key,''))), 'İ', 'I');

UPDATE auth_sessions
   SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       revoked_by = COALESCE(revoked_by,user_id)
 WHERE revoked_at IS NULL
   AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
   AND NOT EXISTS (
     SELECT 1 FROM auth_system_secrets
      WHERE secret_key='FINAL_SECURITY_MAIL_ISNET_CUTOVER_20260901_V1'
   );

INSERT OR IGNORE INTO auth_system_secrets(secret_key,secret_value,created_at,updated_at)
VALUES (
  'FINAL_SECURITY_MAIL_ISNET_CUTOVER_20260901_V1',
  'MFA_REQUIRED_SESSIONS_REVOKED_AND_TENANT_HARDENED',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
);
