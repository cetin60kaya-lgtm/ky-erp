# KY ERP Copilot Repository Instructions

Use the root `AGENTS.md` as the shared project contract. These instructions are Copilot-specific and always apply in this repository.

## Repository identity

- Production source branch: `codex/model-uretim-kontrol-merkezi-final`.
- Canonical Windows repo root: `D:\onedrive-Hkn\OneDrive\KY-ERP-MERKEZ`.
- Live app: `https://kyerp.net` and `https://app.kyerp.net`.
- Live API: `https://api.kyerp.net`.
- Frontend: `APP/app/ky-erp-frontend`.
- Cloudflare Worker API: `APP/cloud/ky-erp-api`.
- Local legacy backend exists for reference; do not assume it is the live production backend.

## How to work

1. Inspect the current implementation before editing. Do not invent a replacement architecture when a working flow already exists.
2. Identify the exact root cause, then fix the shared failure mode instead of duplicating patches across modules.
3. Preserve real data and existing business behavior unless the user explicitly requests a rule change.
4. Do not claim a fix is live until deployment and live asset/API verification are complete.
5. When a task spans frontend and API, verify both sides of the contract: path, method, params, tenant identity, auth headers and response shape.
6. Prefer shared utilities over repeated one-off patches when the same failure mode affects multiple modules.

## Safety

- Never commit secrets, passwords, MFA secrets, recovery codes, API tokens or real `.env` files.
- Never run production INSERT/UPDATE/DELETE just to test UI behavior.
- Never reset or recreate production D1/SQLite data.
- Never auto-retry mutation requests.
- Never trigger GitHub Actions just to deploy when it is unavailable/quota-blocked; use the repository's direct Wrangler deploy only when local Cloudflare authorization is available and tests pass.
- Production migrations require explicit user approval plus backup/readiness checks.

## Auth invariants

- Auth contract version: `canonical-v3`.
- Read-only handshake: `GET /api/auth/status`.
- Canonical flow: `/api/auth/login` → optional `/api/auth/mfa/verify` → `/api/auth/me`.
- `/api/auth/v2/*` fallback is removed and must not be reintroduced.
- Owner/admin accounts must continue to require MFA; a database `PASSWORD_ONLY` value must never bypass owner/admin MFA.
- Effective PASSWORD_ONLY session lifetime is exactly 8 hours (`28800` seconds).
- Effective Google, Microsoft, ANY_MFA, BOTH_MFA and owner/admin MFA session lifetime is exactly 10 hours (`36000` seconds).
- Session lifetime is absolute from successful authentication, not tied to midnight or browser close.
- After MFA succeeds, the same browser profile reuses the valid stored JWT/session until its real server expiry; closing and reopening the browser must not ask for MFA again during that valid session.
- Logout, real expiry, session revocation, password reset, MFA reset/re-enrollment or a new browser requires authentication again.
- Temporary network/5xx errors must not erase a still-valid local session.
- 401/403 may clear invalid sessions.
- Do not reintroduce runtime DDL into login requests.
- Do not add automatic POST retry or duplicate login challenge creation.
- Do not normalize or trim the password value in the frontend; only the username/e-mail identity may be normalized.
- Browser login/MFA/recovery POSTs must not depend on unnecessary custom headers or avoidable preflight.

## Data-loading invariants

- Main lists must survive failure of unrelated helper/summary endpoints.
- Distinguish loading, true empty result, authorization failure and transient API error.
- Canonical company: `mecit-hakan`; canonical id: `main-mecit-hakan`.
- Normalize historical company aliases on read; do not bulk rewrite live data merely to make filtering work.
- Production UI must not silently substitute demo data for missing live data.

## Mandatory validation before reporting completion

Frontend changes: run lint, tests and production build.
Worker changes: run typecheck, unit tests, local auth integration smoke and build/dry-run.
For live deployment use the canonical launcher at repo root:

`KY ERP CANLIYA YUKLE.bat`

It must verify:
- API health 200.
- `GET /api/auth/status` returns `canonical-v3`, password 28800, MFA 36000.
- canonical auth route reachability without real credentials.
- CORS from `https://kyerp.net`.
- new frontend asset hash on both `kyerp.net` and `app.kyerp.net`.
- Worker/Pages deploy success.

Final report should state: root cause, files changed, tests, deploy status, live verification and commit SHA.
