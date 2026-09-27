-- Giden desen paketlerinde ayni klasorde/takimda bulunan modelleri cift yonlu iliskiye cevirir.
-- Boylece KY ERP Asistan bir modeli aradiginda paket arkadaslarini ek tarama yapmadan gorebilir.

CREATE TRIGGER IF NOT EXISTS trg_file_hub_outgoing_package_teammates
AFTER INSERT ON file_hub_relations
WHEN NEW.entity_type = 'OUTGOING_PACKAGE' AND NEW.relation_type = 'PACKAGE_MEMBER'
BEGIN
  -- Yeni dosyanin, pakette daha once bulunan modellerle takim iliskileri.
  INSERT OR IGNORE INTO file_hub_relations
    (id, main_company_slug, file_asset_id, entity_type, entity_id, relation_type,
     is_primary, confidence, source, metadata, created_at, updated_at)
  SELECT lower(hex(randomblob(16))), NEW.main_company_slug, NEW.file_asset_id,
         'MODEL_TEAMMATE', model_rel.entity_id, 'TEAMMATE',
         0, 1.0, 'AUTO_PACKAGE',
         json_object('packageId', NEW.entity_id), datetime('now'), datetime('now')
    FROM file_hub_relations package_rel
    JOIN file_hub_relations model_rel
      ON model_rel.main_company_slug = package_rel.main_company_slug
     AND model_rel.file_asset_id = package_rel.file_asset_id
     AND model_rel.entity_type = 'MODEL'
   WHERE package_rel.main_company_slug = NEW.main_company_slug
     AND package_rel.entity_type = 'OUTGOING_PACKAGE'
     AND package_rel.relation_type = 'PACKAGE_MEMBER'
     AND package_rel.entity_id = NEW.entity_id
     AND package_rel.file_asset_id <> NEW.file_asset_id;

  -- Paketteki eski dosyalarin, yeni gelen modelle takim iliskileri.
  INSERT OR IGNORE INTO file_hub_relations
    (id, main_company_slug, file_asset_id, entity_type, entity_id, relation_type,
     is_primary, confidence, source, metadata, created_at, updated_at)
  SELECT lower(hex(randomblob(16))), NEW.main_company_slug, package_rel.file_asset_id,
         'MODEL_TEAMMATE', current_model.entity_id, 'TEAMMATE',
         0, 1.0, 'AUTO_PACKAGE',
         json_object('packageId', NEW.entity_id), datetime('now'), datetime('now')
    FROM file_hub_relations package_rel
    JOIN file_hub_relations current_model
      ON current_model.main_company_slug = NEW.main_company_slug
     AND current_model.file_asset_id = NEW.file_asset_id
     AND current_model.entity_type = 'MODEL'
   WHERE package_rel.main_company_slug = NEW.main_company_slug
     AND package_rel.entity_type = 'OUTGOING_PACKAGE'
     AND package_rel.relation_type = 'PACKAGE_MEMBER'
     AND package_rel.entity_id = NEW.entity_id
     AND package_rel.file_asset_id <> NEW.file_asset_id;
END;
