-- KY ERP 0028
-- İşNet kayıtları çoklu firma mimarisinde global/NULL tenant ile oluşturulamaz.
-- 0027 legacy NULL kayıtları önce mecit-hakan tenantına bağlar; bu migration
-- gelecekte yeni NULL/boş İşNet satırı oluşmasını D1 seviyesinde engeller.

DROP TRIGGER IF EXISTS trg_isnet_json_store_tenant_insert;
CREATE TRIGGER trg_isnet_json_store_tenant_insert
BEFORE INSERT ON json_store
WHEN NEW.scope LIKE 'ISNET_%'
 AND (NEW.main_company_slug IS NULL OR TRIM(NEW.main_company_slug) = '')
BEGIN
  SELECT RAISE(ABORT, 'ISNET_TENANT_REQUIRED');
END;

DROP TRIGGER IF EXISTS trg_isnet_json_store_tenant_update;
CREATE TRIGGER trg_isnet_json_store_tenant_update
BEFORE UPDATE OF scope, main_company_slug ON json_store
WHEN NEW.scope LIKE 'ISNET_%'
 AND (NEW.main_company_slug IS NULL OR TRIM(NEW.main_company_slug) = '')
BEGIN
  SELECT RAISE(ABORT, 'ISNET_TENANT_REQUIRED');
END;
