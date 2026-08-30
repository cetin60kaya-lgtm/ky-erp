# KY ERP PDKS — Local + ERP Architecture

Status: implementation source for `codex/pdks-local-desktop-core`.

## Goal

KY ERP gets a dedicated **PDKS** module while keeping **IK** as the personnel master. The same PDKS core is used by:

1. KY ERP web module.
2. Installable Windows desktop app (`KY PDKS`).
3. Background card-reader agent installed with the desktop setup.

The desktop app must continue to record and manage attendance when the internet is unavailable.

## Current IK source to reuse

Do not create a second employee master.

Current production code already has the correct starting point:

- `hr_monthly_employees` — employee master.
- `ik_person_card_settings` — card number, exit date, active/passive, phone and payroll flags.
- `ik_time_clock_events` — raw card/time events.
- `ik_attendance_day_overrides` — manual day corrections/overrides.
- `ik_employee_change_history` — personnel change audit history.
- `ik_leave_plans` + `hr_leave_records_v2` — leave information used by attendance evaluation.
- `ik_card_export_batches` + `ik_card_export_items` — card export trace.

Existing `ik-personnel-control.ts` already calculates a person/month attendance view using time events, official holidays, leave, hire/exit dates and manual overrides. PDKS must build on this rather than duplicate it.

## Module boundary

### IK owns

- Person identity / personnel code.
- Department and title.
- SGK status.
- Salary, road allowance and payment plan.
- Hire and exit dates.
- Leave entitlement and personnel documents.

### PDKS owns

- Card/terminal identities.
- Raw card punches.
- Work calendar and shift rules.
- Missing punch, late arrival and early exit evaluation.
- Daily attendance result.
- Manual attendance corrections with audit trail.
- Terminal/device status.
- Offline queue and synchronization status.
- PDKS reports.

A person is created once in IK and referenced by PDKS through `employee_id`.

## Planned ERP PDKS navigation

- Genel Bakış
- Canlı Kart
- Giriş / Çıkış
- Eksik Kartlar
- Puantaj
- Çalışma Takvimi
- Terminal
- Raporlar
- Ayarlar

The employee card remains under IK. It can show PDKS summary and link to the PDKS detail, but PDKS operational work is not mixed into salary/payroll forms.

## Windows desktop product

Target product: `KY-PDKS-Setup-x.y.z.exe`.

Install layout (logical):

```text
C:\Program Files\KY ERP\KY PDKS\
  KY PDKS.exe
  KY PDKS Agent.exe

C:\ProgramData\KY ERP\PDKS\
  Data\pdks-local.db
  Backups\
  Logs\
  Import\
```

The visible desktop app starts only when the user opens it. The card-reader agent may run as a Windows service so card punches are not lost when the UI is closed.

## Authentication and activation

There is no separate PDKS username/password database.

1. User signs in with the KY ERP account.
2. User selects/receives the active company.
3. Setup activates the current Windows device against the ERP account.
4. Server issues a revocable device identity.
5. Desktop stores only protected device/session material, never the ERP password.
6. ERP Management can revoke or deactivate a PDKS device.

Offline login is allowed only for a previously activated device and cached approved user session/profile. Internet loss must not stop card reading.

## Local-first attendance rule

Raw terminal events are written locally first.

```text
Terminal -> KY PDKS Agent -> local event ledger -> sync queue -> KY ERP API/D1
```

The user never waits for cloud confirmation before a punch is accepted locally.

Each raw event gets a stable client-generated UUID. Cloud synchronization is idempotent by event UUID and also protects against duplicate `(company, card, date, time, source)` records.

Raw events are append-only. Corrections do not overwrite the raw terminal event; they create an audited correction/override record.

## Local database responsibilities

Local SQLite is a working database, not a OneDrive-synced open file.

It contains at minimum:

- cached employee/card directory,
- terminal configuration,
- raw attendance events,
- local day overrides,
- sync outbox/inbox state,
- activated device identity,
- audit metadata,
- application settings.

SQLite uses transactions + WAL. Automatic consistent backup snapshots may be copied to OneDrive, but the open database itself is not kept inside a sync folder.

## Synchronization

### Local -> cloud

- raw card event,
- manual attendance correction,
- terminal status,
- desktop-generated PDKS operational action.

### Cloud -> local

- employee/card master changes,
- hire/exit status,
- leave periods,
- official holidays,
- shift/calendar rules,
- user permissions,
- device revocation.

Every sync record has a stable ID, revision/update time and origin. Repeating the same request must not create a second punch.

## Conflict rules

- Raw punch: append-only; duplicates collapse by stable event identity.
- Person/card master: ERP is authoritative, local cache follows ERP.
- Manual attendance correction: latest accepted audited revision is shown; raw event remains untouched.
- Device revoked: new cloud writes stop after revocation is learned; locally queued punches remain preserved for administrator recovery.

## First implementation milestones

### Phase 1 — reuse existing IK attendance core

- Add PDKS web module shell.
- Reuse `ik-personnel-control` person/card/time-event endpoints.
- Expose daily/monthly attendance without duplicating person data.
- Separate operational PDKS navigation from IK payroll screens.

### Phase 2 — device and sync API

- PDKS device activation/revocation tables.
- Sync push/pull endpoints.
- Idempotent event ingestion.
- Terminal heartbeat/status.

### Phase 3 — Windows desktop

- Tauri Windows desktop UI using the same PDKS concepts.
- Local SQLite.
- Windows service/agent for terminal reading.
- Offline queue.
- ERP account activation.

### Phase 4 — setup and migration

- Signed Windows installer.
- Version/update channel.
- Hedef PDKS import adapter for historical data.
- Final data reconciliation before Hedef is archived as reference only.

## Data safety

No production data reset is required for this project. Existing IK relational data is reused. New PDKS schema changes must be additive migrations and must pass D1 backup/schema audit before any production release.
