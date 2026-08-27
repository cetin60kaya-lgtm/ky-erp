# KY ERP Copilot Repository Instructions

Use the root `AGENTS.md` as the shared project contract. These instructions are Copilot-specific and always apply in this repository.

## Repository identity

- Production source branch: `codex/model-uretim-kontrol-merkezi-final`.
- Live app: `https://kyerp.net`.
- Live API: `https://api.kyerp.net`.
- Frontend: `APP/app/ky-erp-frontend`.
- Cloudflare Worker API: `APP/cloud/ky-erp-api`.
- Local legacy backend exists for reference; do not assume it is the live production backend.

## How to work

1. Inspect the current implementation before editing. Do not invent a replacement architecture when a working flow already exists.
2. Identify the exact root cause, then make the smallest production-safe fix.
3. Preserve real data and existing business behavior unless the user explicitly requests a rule change.
4. Do not claim a fix is live until deployment and live asset/API verification are complete.
5. When a task spans frontend and API, verify both sides of the contract: path, method, params, tenant identity, auth headers and response shape.
6. Prefer shared utilities over repeated one-off patches when the same failure mode affects multiple modules.

## Safety

- Never commit secrets, passwords, MFA secrets, recovery codes, API tokens or real `.env` files.
- Never run production INSERT/UPDATE/DELETE just to test UI behavior.
- Never reset or recreate production D1/SQLite data.
- Never auto-retry mutation requests.
- Never trigger GitHub Actions just to deploy when quota is exhausted; use direct Wrangler deploy only when local Cloudflare authorization is available and tests pass.
- Production migrations require explicit user approval plus backup/readiness checks.

## Auth invariants

- Canonical flow: `/api/auth/login` → optional `/api/auth/mfa/verify` → `/api/auth/me`.
- Keep owner/admin MFA enforcement and hard session expiry.
- Temporary network/5xx errors must not erase a still-valid local session.
- 401/403 may clear invalid sessions.
- Do not reintroduce runtime DDL into login requests.
- Do not add automatic POST retry or duplicate login challenge creation.

## Data-loading invariants

- Main lists must survive failure of unrelated helper/summary endpoints.
- Distinguish loading, true empty result, authorization failure and transient API error.
- Canonical company: `mecit-hakan`; canonical id: `main-mecit-hakan`.
- Normalize historical company aliases on read; do not bulk rewrite live data merely to make filtering work.
- Production UI must not silently substitute demo data for missing live data.

## Mandatory validation before reporting completion

Frontend changes: run lint, tests and production build when available.
Worker changes: run typecheck, tests and build/dry-run when available.
For live deployment tasks also verify:
- API health 200.
- CORS from `https://kyerp.net`.
- expected auth status behavior without exposing credentials.
- new frontend asset hash on `kyerp.net`.
- deployment IDs when direct Cloudflare deploy is performed.

Final report should state: root cause, files changed, tests, deploy status, live verification and commit SHA.
