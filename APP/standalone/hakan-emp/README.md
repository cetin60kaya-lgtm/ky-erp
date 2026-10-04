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

Portable output: `dist\HAKAN-EMP-1.3.0.exe`.

## Current workflow

- Manufacturing: serial production entry, model continuation/repeat protection, ground colour, shift/machine/operator, defects.
- Current accounts: multiple companies, invoices, collections, opening balance, active/passive company cards.
- Cheques: month-separated Excel-like view, receipt/image details, A4 landscape print and CSV export.
- Notes: Patron ↔ Muhasebe notes, priority, pinning, active/passive/completed states.
- Payment reminders: current-account company or free-person reminder.
- Settings: company, production, machine/operator, cheque, sync and backup.
