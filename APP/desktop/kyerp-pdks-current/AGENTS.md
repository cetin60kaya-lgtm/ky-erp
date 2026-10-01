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
