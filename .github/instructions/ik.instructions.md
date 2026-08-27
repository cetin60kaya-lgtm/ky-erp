---
applyTo: "APP/app/ky-erp-frontend/src/**/*Ik*,APP/app/ky-erp-frontend/src/**/*ik*,APP/cloud/ky-erp-api/src/ik-*.ts"
---

# KY ERP İK Instructions

- Preserve the full existing `IkPage` daily-entry workspace and its approved actions.
- Daily Personel Havuzu is the full active daily-person pool.
- The selected work roster is not the same thing as the pool. It contains only explicitly saved roster members plus people with actual work records in the selected range.
- Never implement `empty roster => all active employees`.
- A worker who has worked must not disappear from the range roster automatically.
- Day and night attendance remain independent.
- Preserve wage, role/skill, direct/intermediary, notes, historical attendance, payroll and payment relationships.
- `daily-employees` must remain independently loadable even when leave, document, skill, holiday or summary endpoints fail.
- Never delete/re-import real personnel just to repair an empty UI.
- Keep Hızlı Giriş, Yeni Personel, Tümünü Seç, Seçimi Kaldır, Kayıtlı Seçimi Yükle, Günlük Kaydet, Haftalık Liste, Excel actions, day cards and totals unless explicitly changed by the user.
- Add regression tests for roster/pool separation and partial endpoint failure when modifying this area.
