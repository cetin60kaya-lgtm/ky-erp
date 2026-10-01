# KYERP PDKS Agent Rules

Canonical workspace root:
`D:\Googledrive\KYERP-PDKS-MASAUSTU`

Canonical source repository:
`D:\Googledrive\KYERP-PDKS-MASAUSTU\01_KAYNAK\ky-erp`

PDKS source module:
`D:\Googledrive\KYERP-PDKS-MASAUSTU\01_KAYNAK\ky-erp\APP\desktop\kyerp-pdks-current`

Rules:
1. Do not create or use a second PDKS working tree outside the canonical root.
2. Keep the current 6.4 UI layout; fix behavior/stability instead of redesigning it.
3. Main shell/menu/toolbar must have one owner; remove overlapping runtime enhancement layers.
4. No UI flicker, repeated full rebuilds, or timer-driven Controls.Clear/recreate loops.
5. Hedef PDKS is the terminal/reference source; do not auto-delete physical device logs.
6. TNF canonical format is `KartNo,Saat,GGAAYY,1,001`.
7. Live card archive retention is at least 365 days; deduplicate imports.
8. Back up before migration, bulk card edits, TNF correction, and major DB changes.
9. Build outputs go to `06_BUILD`; test evidence to `08_TEST`; release ZIPs to `07_RELEASE`.
10. Preserve old releases; archive superseded accepted revisions under `99_ARSIV`.
11. Use Remote Desktop only for necessary local checks/actions; prefer the shared Drive workspace for files.
12. One computer at a time may make source/data changes in this shared workspace.
13. GitHub remote is mandatory as the shared code mirror: `https://github.com/cetin60kaya-lgtm/ky-erp.git`.
14. Active PDKS branch is `codex/kyerp-pdks-full-app-prep`; do not work on a different branch unless explicitly requested.
15. After each logical, tested revision run `git diff --check`, then commit with a meaningful message and push the active branch.
16. Do not depend on Remote Desktop for source availability; the Drive clone and GitHub branch must both stay usable.
17. Never commit company DATA/TNF/live records, credentials, licenses, private runtime files, or proprietary third-party binaries to GitHub.
18. Before pushing, verify `git status`, current branch, and that no private/runtime data is staged.
19. Use `PDKS_DENETIM.ps1` as the standard local verification gate; it runs restore/build/contract/shell/UI audit/V4 smoke and writes evidence under `08_TEST`.
20. `tools/UiAudit` is the canonical GUI/UI audit utility; its screenshots and logs must stay under the shared workspace `08_TEST` tree.
21. For difficult multi-file analysis/refactors, VS Code/Codex may be used against this canonical source tree, but it must not create another working copy.
22. Historical legacy source is archived outside the active source tree under workspace `02_REFERANS`; do not restore it into active build paths without an explicit need.
