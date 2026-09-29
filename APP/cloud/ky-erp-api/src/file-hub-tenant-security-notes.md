# KY File Hub tenant security final

- Non-owner File Hub reads must stay within the authenticated user's own tenant.
- Cross-tenant header/query selection is rejected.
- Public KY File Agent authentication is tenant-scoped through `file_hub_agent_credentials`.
- Existing legacy `FILE_HUB_AGENT_KEY` remains a compatibility fallback only for canonical tenant `mecit-hakan` until that tenant rotates to its own credential.
- Once a tenant credential exists, a wrong key never falls back to the legacy global key.
- Raw agent secrets are returned only on owner-triggered rotation and are stored only as SHA-256 hashes.
- No D1 reset/drop is introduced by migration 0039.
