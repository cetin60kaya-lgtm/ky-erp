-- Additive performance index: same tenant/connection/provider identity, not unique.
-- Apply only after verified private backup and explicit production approval.
CREATE INDEX IF NOT EXISTS idx_file_hub_locations_provider_identity ON file_hub_locations(main_company_slug,storage_connection_id,provider_file_id);
