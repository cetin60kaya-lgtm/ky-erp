# KY ERP Copilot Repository Instructions

Always read the root `AGENTS.md` first. Also read `DOCS/KY_ERP_CHAT_GITHUB_CLOUDFLARE_ANA_KURAL_2026-09-27.md` before repo/code work. These instructions are Copilot-specific and apply in this repository.

## Repository identity

- Production source branch: `codex/model-uretim-kontrol-merkezi-final`.
- Do **not** assume a OneDrive, Google Drive or other cloud-synced repository path.
- Resolve the real local repository with `git rev-parse --show-toplevel` only when local-machine work is actually required.
- Expected remote: `https://github.com/cetin60kaya-lgtm/ky-erp.git`.
- Frontend: `APP/app/ky-erp-frontend`.
- Cloudflare Worker API: `APP/cloud/ky-erp-api`.
- Local NestJS/SQLite backend is legacy/reference unless the user explicitly asks for local mode.
- **Only user-facing live app URL: `https://kyerp.net/`.**
- Live API origin: `https://api.kyerp.net`; backend-only.
- `https://app.kyerp.net` is not canonical and must not be reintroduced unless the user explicitly requests a new domain decision.

## Chat → GitHub → Cloudflare default

- Remote Desktop is not the default for repository/code work. Prefer direct GitHub file/branch/commit/PR operations from the connected AI/chat environment.
- A normal `yap / düzelt / bitir / uygula / hallet / toparla` request is standing authorization to carry the repo task through implementation, tests, GitHub write/PR/merge when appropriate, Cloudflare canonical deployment and read-only live smoke. Do not repeatedly ask `commit edeyim mi`, `PR açayım mı`, `merge edeyim mi`, or `canlıya alayım mı`.
- Stop before write/deploy when the user says `önce yorumla`, `önce bak`, `önizleme ver`, `onay vereyim`, `canlıya alma`, or equivalent.
- Low-risk isolated/reversible changes may use the fast path after current production HEAD is verified.
- Auth/security/shared API/Worker/large refactor/multi-file changes should use a fresh branch + PR; if diff/checks are clean, merge without another user prompt.
- Production frontend automatic deployment has a single path: **Cloudflare Git Integration**. Do not add a second automatic GitHub Actions Pages deploy.
- `production-live-smoke.yml` is read-only verification and must never deploy.
- Manual deploy workflows are emergency fallback only.
- Remote Desktop is reserved for local-only work such as Windows, Photoshop/Illustrator, PDKS desktop, local folders/devices/hardware, binary files not present in GitHub, or mandatory local integration tests.

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
8. Production migrations, destructive data writes, DNS/domain deletion, secret rotation, billing changes and real external/resmî sends remain explicit safety-gate operations with backup/readiness and user approval where required.
9. For normal reversible repo/code work, do not request a second approval for commit/PR/merge/deploy unless the user explicitly requested a review-only or no-deploy stage.
10. Frontend changes: lint + tests + production build where applicable. Worker changes: typecheck + unit tests + local integration smoke/dry-run where applicable.

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

State the root cause, files changed, tests run, GitHub commit/PR/merge status, deploy status, live verification status and final commit SHA.
