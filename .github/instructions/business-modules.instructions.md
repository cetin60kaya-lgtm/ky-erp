---
applyTo: "APP/app/ky-erp-frontend/src/**/*.{js,jsx,ts,tsx},APP/cloud/ky-erp-api/src/**/*.{ts,js}"
---

# KY ERP Business Module Instructions

These rules apply when work touches Muhasebe, İşNet, Desen or İmalat.

## Muhasebe
- Keep one shared firm/customer identity across cari, invoice, KDV, payment and check flows.
- Do not duplicate official document operations already owned by İşNet.
- Preserve financial totals and auditability. Never manufacture missing financial data.
- A dashboard/summary failure must not blank a working cari or invoice list.

## İşNet
- İşNet is the official document-operation center for incoming/outgoing documents, dispatch-to-invoice, PDF/XML and portal/API synchronization.
- Never send an official invoice/dispatch without explicit user approval.
- Never store İşNet credentials or tokens in source control or frontend code.
- API and portal fallback states must be reported separately and clearly.

## Desen
- Model master identity belongs to Desen and is shared by modules through canonical model identity.
- Do not create a second independent model card in another module.
- Model names are display/search values, not durable relationship keys.
- Preserve PSD/image/layout/storage relationships and do not put real production artwork archives into Git.

## İmalat
- Preserve model, machine, shift, operator, day/night, dispatch quantity and defect relationships.
- Net good quantity = gross production - print defect - fabric defect.
- For multi-operation models, completion is based on the minimum completed quantity across required operations rather than summing operations.
- Fast-entry paths must use the same validation and services as detailed entry.

Across all modules, independent reads should fail independently; do not make one optional API failure erase unrelated successfully loaded data.
