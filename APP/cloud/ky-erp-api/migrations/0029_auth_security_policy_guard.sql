-- KY ERP 0029
-- Final auth defense-in-depth guard.
-- Runtime compatibility kodu ne gönderirse göndersin D1 yalnız canonical teknik kod
-- ve MFA tabanlı login policy kabul eder. Parola-only artık DB seviyesinde de kapalıdır.

DROP TRIGGER IF EXISTS trg_auth_users_role_canonical_insert;
CREATE TRIGGER trg_auth_users_role_canonical_insert
BEFORE INSERT ON auth_users
WHEN NEW.role IS NOT NULL
 AND NEW.role <> REPLACE(UPPER(TRIM(COALESCE(NEW.role,''))), 'İ', 'I')
BEGIN
  SELECT RAISE(ABORT, 'AUTH_ROLE_NOT_CANONICAL');
END;

DROP TRIGGER IF EXISTS trg_auth_users_role_canonical_update;
CREATE TRIGGER trg_auth_users_role_canonical_update
BEFORE UPDATE OF role ON auth_users
WHEN NEW.role IS NOT NULL
 AND NEW.role <> REPLACE(UPPER(TRIM(COALESCE(NEW.role,''))), 'İ', 'I')
BEGIN
  SELECT RAISE(ABORT, 'AUTH_ROLE_NOT_CANONICAL');
END;

DROP TRIGGER IF EXISTS trg_auth_security_mfa_insert;
CREATE TRIGGER trg_auth_security_mfa_insert
BEFORE INSERT ON auth_user_security
WHEN REPLACE(UPPER(TRIM(COALESCE(NEW.login_policy,''))), 'İ', 'I') NOT IN ('GOOGLE','MICROSOFT','ANY_MFA','BOTH_MFA')
   OR COALESCE(NEW.session_seconds,0) <> 36000
   OR (
        NEW.role_override IS NOT NULL
        AND TRIM(COALESCE(NEW.role_override,'')) <> ''
        AND NEW.role_override <> REPLACE(UPPER(TRIM(NEW.role_override)), 'İ', 'I')
      )
BEGIN
  SELECT RAISE(ABORT, 'AUTH_MFA_POLICY_REQUIRED');
END;

DROP TRIGGER IF EXISTS trg_auth_security_mfa_update;
CREATE TRIGGER trg_auth_security_mfa_update
BEFORE UPDATE ON auth_user_security
WHEN REPLACE(UPPER(TRIM(COALESCE(NEW.login_policy,''))), 'İ', 'I') NOT IN ('GOOGLE','MICROSOFT','ANY_MFA','BOTH_MFA')
   OR COALESCE(NEW.session_seconds,0) <> 36000
   OR (
        NEW.role_override IS NOT NULL
        AND TRIM(COALESCE(NEW.role_override,'')) <> ''
        AND NEW.role_override <> REPLACE(UPPER(TRIM(NEW.role_override)), 'İ', 'I')
      )
BEGIN
  SELECT RAISE(ABORT, 'AUTH_MFA_POLICY_REQUIRED');
END;

DROP TRIGGER IF EXISTS trg_auth_module_key_canonical_insert;
CREATE TRIGGER trg_auth_module_key_canonical_insert
BEFORE INSERT ON auth_user_module_permissions
WHEN NEW.module_key IS NOT NULL
 AND NEW.module_key <> REPLACE(UPPER(TRIM(COALESCE(NEW.module_key,''))), 'İ', 'I')
BEGIN
  SELECT RAISE(ABORT, 'AUTH_MODULE_KEY_NOT_CANONICAL');
END;

DROP TRIGGER IF EXISTS trg_auth_module_key_canonical_update;
CREATE TRIGGER trg_auth_module_key_canonical_update
BEFORE UPDATE OF module_key ON auth_user_module_permissions
WHEN NEW.module_key IS NOT NULL
 AND NEW.module_key <> REPLACE(UPPER(TRIM(COALESCE(NEW.module_key,''))), 'İ', 'I')
BEGIN
  SELECT RAISE(ABORT, 'AUTH_MODULE_KEY_NOT_CANONICAL');
END;
