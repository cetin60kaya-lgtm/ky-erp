-- Bir PRIMARY konum kaybolursa ayni mantiksal dosyanin kullanilabilir diger konumunu PRIMARY yap.
-- Boylece Google Drive -> OneDrive/ikinci konum gecisinde FileAsset ve ERP iliskileri bozulmaz.

CREATE TRIGGER IF NOT EXISTS trg_file_hub_primary_location_failover
AFTER UPDATE OF is_available ON file_hub_locations
WHEN OLD.is_available = 1
 AND NEW.is_available = 0
 AND NEW.location_role = 'PRIMARY'
BEGIN
  UPDATE file_hub_locations
     SET location_role = 'MIRROR',
         updated_at = datetime('now')
   WHERE id = NEW.id
     AND EXISTS (
       SELECT 1
         FROM file_hub_locations x
        WHERE x.main_company_slug = NEW.main_company_slug
          AND x.file_asset_id = NEW.file_asset_id
          AND x.id <> NEW.id
          AND x.is_available = 1
     );

  UPDATE file_hub_locations
     SET location_role = 'PRIMARY',
         updated_at = datetime('now')
   WHERE id = (
       SELECT x.id
         FROM file_hub_locations x
        WHERE x.main_company_slug = NEW.main_company_slug
          AND x.file_asset_id = NEW.file_asset_id
          AND x.id <> NEW.id
          AND x.is_available = 1
        ORDER BY x.last_seen_at DESC
        LIMIT 1
   );
END;
