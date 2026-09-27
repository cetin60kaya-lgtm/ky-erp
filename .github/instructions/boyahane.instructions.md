---
applyTo: "APP/app/ky-erp-frontend/src/**/*boyahane*,APP/app/ky-erp-frontend/src/**/*Boyahane*,APP/cloud/ky-erp-api/src/boyahane-*.ts"
---

# KY ERP Boyahane Instructions

- Production Boyahane screens must use live data, never demo fallback to hide API or tenant failures.
- Registered colors, products, lots, recipes, stock movements, jobs and productions must preserve their real relationships.
- Lot tracking is product-centric. Do not invent a separate model lot master.
- Records arriving without a lot number remain visible as `Lot Bekleyenler`; do not silently discard them.
- Product/lot quantities and history must not be recalculated by destructive bulk repair unless explicitly approved.
- Tenant/company alias differences must be handled by canonical read compatibility rather than bulk rewriting production records.
- If an optional summary or helper endpoint fails, the main registered-color/product/lot list should still render when its own endpoint succeeds.
- When registered colors show zero, first distinguish DB truly empty vs tenant filter vs endpoint/unwrap/cache/UI filtering.
- Preserve recipe history/versioning and model/production links.
- Test read behavior with real response shapes; never insert fake production data for smoke tests.
