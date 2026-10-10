# PC PDKS — isolated integration handoff (10 Oct 2026)

This is the PC PDKS Windows product. The parent GitHub repository is a **source donor**, not the intended final product identity.

## Branch and included modules

`feature/pc-pdks-final-integration-20261010` was created from the Unified 49-tab desktop base. The 48 source/test/setup files newly introduced across five development branches were carried over WITHOUT overwriting shared changed files. Original five branches and original production source remain unchanged.

- Terminal/fleet: Hedef FP_CLOCK read-only x86 helper, fleet, printer preparation
- Personnel: Personel 360, card history, Cloud contract
- Attendance: source-evidence and timesheet bundle
- Payroll: D1-backed projection, CSV/A4 report helpers
- Management: Windows diagnostics, packaging scripts, backup helpers

**This is a collected source branch, NOT a compiled, merged, production-certified release.** UI and API entry points from parallel PRs remain to be reconciled and tested. A file being present does NOT mean it is wired to the application.

## Remaining integration conflicts

Common files still have different changes on parallel branches:
`PdksUnifiedApp.jsx`, `TerminalSetupPanel.jsx`, `tabBindings.js`,
`readService.js`, `useUnifiedPdksData.js`, `productModel.js`,
`productData.js`, `pdksUnified.css`, `Program.cs`, and Cloud PDKS routes.
Integrate intentionally, run Vite + Cloud typecheck + Windows/.NET tests, then test real Hedef terminal. Never bulk-overwrite these files from one PR.

## Critical data protection

- Never add or commit `*.FDB`, `*.GDB`, `*.TNF`, terminal `RAW`, live `pdks.db`,
  private personnel JSON, export archives, payment documents, authentication tokens, or passwords.
- A **private GitHub repo is for code and non-personal fixture data**, not operational payroll or identity dumps. Use an encrypted, access-controlled database/backup outside Git.
- Physical terminal write/delete and live ERP D1/FDB/TNF writes are disabled pending authorized verification.

## Final repo and deliverable

Desired new repo: `cetin60kaya-lgtm/pc-pdks` with GitHub visibility **Private**,
no imported parent history. After joint UI/Cloud/Windows integration, extract the
complete Windows runtime and its required frontend/Agent modules into that repo,
and create a reproducible installer there. The original KY ERP repository must not
be replaced or force-pushed.

Do not claim a private repo or production EXE exists until created and verified.
