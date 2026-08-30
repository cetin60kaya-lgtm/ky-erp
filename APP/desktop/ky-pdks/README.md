# KY PDKS Desktop

This directory is the implementation root for the installable Windows PDKS client.

## Product rules

- Distributed as a normal Windows setup executable, not a copied loose folder.
- Visible app starts only when the user opens it.
- Card reader agent is installed with setup and may run as a Windows service.
- Same KY ERP account/permissions are used; no independent password database.
- Previously activated devices can continue attendance operations offline.
- Local attendance events are written before cloud sync.
- Open local SQLite database is stored under `C:\ProgramData\KY ERP\PDKS`, not OneDrive.
- Consistent backup snapshots may be copied to OneDrive.
- Raw terminal events are append-only; corrections are separate audited records.

## Target components

```text
ky-pdks-ui        Tauri desktop application
ky-pdks-agent     Windows service / terminal adapter host
ky-pdks-core      local SQLite + sync domain
installer         signed Windows setup
```

## Initial adapter contract

Every terminal adapter must produce the same normalized event:

```json
{
  "eventId": "uuid",
  "deviceId": "device-uuid",
  "cardNo": "00004",
  "occurredAt": "2026-08-30T08:28:00+03:00",
  "direction": "AUTO",
  "source": "TERMINAL"
}
```

The core resolves `cardNo -> employeeId` from the cached ERP directory and stores the raw event locally. Unknown cards are retained in an unresolved queue; they are never silently discarded.

## Setup/activation flow

1. Install KY PDKS.
2. Sign in with KY ERP account.
3. Select authorized company.
4. Activate this Windows device.
5. Configure terminal adapter.
6. Run local test punch.
7. Start agent service.

Device activation is revocable from ERP Management.

## First development step

The ERP web PDKS workspace initially consumes the existing `ik-personnel-control` API. Device/sync endpoints are added only after the local event and activation schema is finalized.
