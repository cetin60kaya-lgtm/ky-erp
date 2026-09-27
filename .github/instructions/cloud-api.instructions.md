---
applyTo: "APP/cloud/ky-erp-api/**/*.{ts,js,json,jsonc,sql}"
---

# KY ERP Cloudflare Worker API Instructions

- This directory is the live Cloudflare Worker API for `https://api.kyerp.net`.
- Preserve D1 compatibility and route registration order.
- Authentication has one canonical public flow. Do not create overlapping login routers.
- Do not execute schema DDL on normal request/login paths. Schema changes belong in migrations.
- Audit/logging failures should not turn an otherwise valid login into a 500 unless the audit is itself security-critical.
- Include a request id in unexpected server-error diagnostics without exposing secrets.
- CORS must continue allowing `https://kyerp.net`, `https://www.kyerp.net`, and `https://app.kyerp.net` with required Authorization/content/tenant headers.
- All non-public ERP routes must continue enforcing authenticated session checks.
- Preserve canonical company/tenant behavior and read compatibility for historical aliases.
- Production DB writes, migrations, repair scripts and destructive SQL require explicit user approval. Read-only inspection is preferred for diagnostics.
- Do not insert fake production data for smoke tests.
- When changing routes, confirm frontend path/method/request/response compatibility.
- Before direct deploy, run typecheck, tests, build/dry-run. Deploy with Wrangler only when Cloudflare authorization is available.
