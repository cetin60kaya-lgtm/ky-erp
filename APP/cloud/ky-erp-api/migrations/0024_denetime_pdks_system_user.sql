-- KY ERP DENETIM / PDKS sabit sistem hesabi.
-- Hesap kaynakta hazir ve Kullanici Merkezi'nde gorunur gelir.
-- Ilk parola kriptografik olarak rastgele ve bilinmezdir; uygulama sahibi kullanmadan once
-- Kullanici Merkezi'nden yeni parola/MFA belirler. must_change_password=1 korunur.
-- DENETIM yetkisi sabittir: yalniz IK goruntuleme; yazma/onay/silme yoktur.

-- 0024 tek basina uygulanabilsin; mevcut 0020 kurulumuna dokunmaz.
CREATE TABLE IF NOT EXISTS ik_user_hr_scope (
  user_id TEXT PRIMARY KEY,
  main_company_id TEXT NOT NULL DEFAULT 'mecit-hakan',
  scope TEXT NOT NULL DEFAULT 'FULL',
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ik_user_hr_scope_company
  ON ik_user_hr_scope(main_company_id, scope);

INSERT INTO auth_users
  (id,username,password_hash,full_name,role,is_active,must_change_password,created_at,updated_at,email,backup_email,platform_role)
SELECT
  'system-denetim',
  'denetim',
  '$2b$12$xKGYPI/Uh61nsApDKalSp.9hKevLyaSv4tBaQlzhufK6xvtVRTdle',
  'DENETİM / PDKS',
  'DENETIM',
  1,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL,
  NULL,
  'USER'
WHERE NOT EXISTS (
  SELECT 1 FROM auth_users WHERE LOWER(TRIM(username))='denetim'
);

-- Daha once manuel acilmis denetim hesabi varsa kimligini/parolasini/aktiflik durumunu koru,
-- yalniz rol ve guvenlik kapsamini canonical DENETIM olarak sabitle.
UPDATE auth_users
   SET role='DENETIM',
       full_name=CASE WHEN TRIM(COALESCE(full_name,''))='' THEN 'DENETİM / PDKS' ELSE full_name END,
       updated_at=CURRENT_TIMESTAMP
 WHERE LOWER(TRIM(username))='denetim';

INSERT OR IGNORE INTO auth_user_security
  (user_id,email,main_company_slug,role_override,mfa_enabled,email_verified,approval_required,created_at,updated_at)
SELECT
  id,
  NULL,
  'mecit-hakan',
  NULL,
  0,
  0,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM auth_users
WHERE LOWER(TRIM(username))='denetim'
LIMIT 1;

UPDATE auth_user_security
   SET main_company_slug=COALESCE(NULLIF(TRIM(main_company_slug),''),'mecit-hakan'),
       role_override=NULL,
       approval_required=0,
       updated_at=CURRENT_TIMESTAMP
 WHERE user_id=(SELECT id FROM auth_users WHERE LOWER(TRIM(username))='denetim' LIMIT 1);

DELETE FROM auth_user_module_permissions
 WHERE user_id=(SELECT id FROM auth_users WHERE LOWER(TRIM(username))='denetim' LIMIT 1)
   AND UPPER(module_key)<>'IK';

INSERT INTO auth_user_module_permissions
  (id,user_id,module_key,can_view,can_create,can_update,can_delete,can_approve,created_at,updated_at)
SELECT
  'system-denetim-ik',
  id,
  'IK',
  1,0,0,0,0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM auth_users
WHERE LOWER(TRIM(username))='denetim'
LIMIT 1
ON CONFLICT(user_id,module_key) DO UPDATE SET
  can_view=1,
  can_create=0,
  can_update=0,
  can_delete=0,
  can_approve=0,
  updated_at=CURRENT_TIMESTAMP;

INSERT INTO ik_user_hr_scope
  (user_id,main_company_id,scope,updated_by,updated_at)
SELECT
  id,
  COALESCE((SELECT NULLIF(TRIM(main_company_slug),'') FROM auth_user_security s WHERE s.user_id=auth_users.id),'mecit-hakan'),
  'AUDIT',
  'SYSTEM',
  CURRENT_TIMESTAMP
FROM auth_users
WHERE LOWER(TRIM(username))='denetim'
LIMIT 1
ON CONFLICT(user_id) DO UPDATE SET
  main_company_id=excluded.main_company_id,
  scope='AUDIT',
  updated_by='SYSTEM',
  updated_at=CURRENT_TIMESTAMP;

-- Sistem hesabinin kimligi ve rolu yanlislikla degistirilemez.
-- Sifre, MFA, e-posta ve aktif/pasif durumu bu trigger tarafindan kilitlenmez.
CREATE TRIGGER IF NOT EXISTS trg_denetime_system_identity_guard
AFTER UPDATE OF username,role ON auth_users
WHEN OLD.id='system-denetim'
 AND (LOWER(TRIM(COALESCE(NEW.username,'')))<>'denetim' OR UPPER(TRIM(COALESCE(NEW.role,'')))<>'DENETIM')
BEGIN
  UPDATE auth_users
     SET username='denetim',
         role='DENETIM',
         updated_at=CURRENT_TIMESTAMP
   WHERE id='system-denetim';
END;
