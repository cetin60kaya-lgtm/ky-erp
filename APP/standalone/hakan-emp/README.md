# HAKAN EMP

Standalone desktop application for HAKAN EMP manufacturing, current account, cheque, notes and payment reminder workflows.

## Runtime

- Node.js built-in `node:sqlite`
- Electron desktop shell
- Local working database: `%APPDATA%\HAKAN EMP\data\IMALAT.db`
- Incremental OneDrive event sync under `OneDrive\HAKAN EMP\SYNC`
- Production data is **not** stored in this repository.

## Development

```powershell
cd "APP\standalone\hakan-emp"
npm install
npm run check
npm test
npm start
```

## Windows build

```powershell
cd "APP\standalone\hakan-emp"
npm run dist
```

Portable output: `dist\HAKAN-EMP-1.4.0.exe`.

## Current workflow

- Manufacturing: serial production entry, model continuation/repeat protection, ground colour, shift/machine/operator, defects.
- Current accounts: multiple companies, invoices, collections, opening balance, active/passive company cards.
- Cheques: month-separated Excel-like view, receipt/image details, A4 landscape print and CSV export.
- Notes: Patron ↔ Muhasebe notes, priority, pinning, active/passive/completed states.
- Payment reminders: current-account company or free-person reminder.
- Settings: company, production, machine/operator, cheque, sync and backup.

## Weekly manufacturing pool

- Active work lives in one manufacturing pool until dispatch and invoice quantities are fully balanced.
- Production slips are grouped automatically by their slip date into Monday-Sunday seven-day periods.
- Changing the selected week resets only the weekly production view; it never deletes or resets the active job's historical production.
- The same open model can receive new production slips in later weeks without reopening the model.
- When incoming/production/dispatch/invoice balance reaches completion, the job automatically leaves the active pool and appears under Completed.
- The model drawer is the single work center for new production, incoming quantity adjustment, dispatch, invoice, current account and internal notes.
- Historical data is preserved. No weekly rollover deletes prior records.
