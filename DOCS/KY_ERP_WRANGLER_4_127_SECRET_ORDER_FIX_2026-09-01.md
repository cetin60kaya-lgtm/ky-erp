# KY ERP - Wrangler 4.127+ Resend Secret Deployment Order

Date: 2026-09-01
Branch: `codex/model-uretim-kontrol-merkezi-final`

## Problem observed

With Wrangler 4.127.1, `wrangler secret put RESEND_API_KEY` failed with:

`Secret edit failed. You attempted to modify a secret, but the latest version of your Worker isn't currently deployed.`

No D1 cutover, Pages deploy or MFA session cutover had started when this failure occurred.

## Canonical fix

For KY ERP production and Resend repair flows, use this order:

1. Verify clean production source and Cloudflare session.
2. Run Worker package install, tests, typecheck and dry-run.
3. Deploy the tested latest Worker source with standard `wrangler deploy` so the latest version becomes the active deployment.
4. Run standard `wrangler secret put RESEND_API_KEY`.
5. Verify `RESEND_API_KEY` with `wrangler secret list`.
6. Run a real Resend provider acceptance test and require a provider message ID.
7. Continue canonical Worker + Pages production deploy.
8. Apply targeted MFA/session/IsNet/Auth D1 cutover and guard scripts.
9. Re-verify D1 guards, old session revocation, Worker secret, `/api/health` and `/api/auth/status`.

`wrangler versions secret put` is not the canonical KY ERP production path because by itself it creates a version without guaranteeing that version is the active deployment. If gradual deployment is ever intentionally introduced, version creation and `wrangler versions deploy` must be managed as one explicit release operation.

## Console rule

Final Windows BAT/PowerShell launchers use UTF-8 console setup plus ASCII-only user-facing status text. Raw Wrangler output is captured into the Desktop log where possible instead of flooding CMD with broken Unicode glyphs.

## Files

- `KY ERP FINAL TUR CANLIYA AL.bat`
- `DEPLOY/KYERP_FINAL_ROUND_RELEASE_20260901_V3.ps1`
- `DEPLOY/KYERP_RESEND_ACTIVE_SECRET_REPAIR.ps1`
- `DEPLOY/KYERP_RESEND_ACTIVE_SECRET_REPAIR.bat`
- `APP/cloud/ky-erp-api/src/final-round-security-contract.test.ts`

## Safety

- D1 reset: forbidden.
- `git reset --hard`: forbidden.
- `git clean`: forbidden.
- Resend API key must never be pasted into chat or stored in repository/plaintext project files.
- Final release is successful only after `KY ERP FINAL ROUND RELEASE BASARILI` is printed.
