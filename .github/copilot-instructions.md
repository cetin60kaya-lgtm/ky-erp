# KY ERP Copilot Repository Instructions

Always read the root `AGENTS.md` first. These instructions are Copilot-specific and apply in this repository.

## Repository identity

- Production source branch: `codex/model-uretim-kontrol-merkezi-final`.
- Do **not** assume a OneDrive, Google Drive or other cloud-synced repository path.
- Resolve the real local repository with `git rev-parse --show-toplevel` before scripts, builds, deploys or destructive operations.
- Expected remote: `https://github.com/cetin60kaya-lgtm/ky-erp.git`.
- Frontend: `APP/app/ky-erp-frontend`.
- Cloudflare Worker API: `APP/cloud/ky-erp-api`.
- Local NestJS/SQLite backend is legacy/reference unless the user explicitly asks for local mode.
- **Only user-facing live app URL: `https://kyerp.net/`.**
- Live API origin: `https://api.kyerp.net`; backend-only.
- `https://app.kyerp.net` is not canonical unless the user explicitly asks to reactivate it.

## Canonical storage rule

KY ERP application modules are provider-neutral. No module may hardcode OneDrive, Google Drive, a drive letter or a company-specific Windows path as its permanent storage contract.

- Shared storage core: `File Hub`.
- Supported V1 providers: `GOOGLE_DRIVE`, `ONEDRIVE`, `SHAREPOINT`, `LOCAL_FOLDER`, `NAS`.
- Google Drive Desktop, OneDrive/SharePoint sync folders, local folders and NAS are watched through KY File Agent when `sync_mode=AGENT`.
- Provider connection is defined once in **Depolama > Bağlantılar**.
- Module/file-purpose target is defined in **Depolama > Bölüm / Dosya Atamaları**.
- Resolution order: exact module+purpose binding -> company primary storage -> no target/error.
- R2 is preview/cache/staging unless a specific workflow explicitly requires otherwise. Heavy/original business files remain in the selected provider.
- Desen must resolve `MODEL_IMAGE`, `MODEL_SOURCE`, `PLACEMENT`, `OUTGOING_DESIGN` through File Hub. Do not restore a separate Desen-only Google/OneDrive path system.
- Muhasebe/İşNet documents use File Hub bindings such as `INVOICE`, `DELIVERY_NOTE`, `E_DOCUMENT`.
- İK, Boyahane, İmalat, DTF and Stok must use the same File Hub contract rather than creating provider-specific storage code.
- OneDrive remains an optional supported provider; it is not the default or a repository/runtime requirement.
- Future direct Google Drive API / Microsoft Graph adapters must preserve the same `file_hub_connections` and `file_hub_bindings` contract.

## Working rules

1. Inspect current implementation before editing.
2. Find the shared root cause instead of adding module-by-module path patches.
3. Preserve real data and business behavior unless the user explicitly requests a rule change.
4. Never commit secrets, passwords, MFA secrets, recovery codes, API tokens or real `.env` files.
5. Never reset/recreate production D1 or SQLite data.
6. Never run production INSERT/UPDATE/DELETE merely to test UI behavior.
7. Do not auto-retry mutation requests.
8. Production migrations require explicit user approval plus backup/readiness checks.
9. Do not deploy merely because source edits are complete. Live release requires explicit user request.
10. Frontend changes: lint + tests + production build. Worker changes: typecheck + unit tests + local integration smoke + dry-run.

## Auth and data invariants

- Auth contract: `canonical-v3`.
- Flow: `/api/auth/login` -> optional `/api/auth/mfa/verify` -> `/api/auth/me`.
- Owner/admin MFA must not be bypassed.
- PASSWORD_ONLY session: 28800 seconds; MFA/owner/admin session: 36000 seconds.
- Temporary network/5xx errors must not erase a valid local session.
- Production UI must not silently replace missing live data with demo data.
- Canonical tenant slug: `mecit-hakan`; id: `main-mecit-hakan`.
- Tenant aliases may be normalized on read; do not bulk rewrite live data just to fix filtering.

## Completion report

State the root cause, files changed, tests run, deploy status, live verification status and final commit SHA.
