import { apiGet, apiPatch, apiPost } from "../utils/api";

const COMPANY_REQUIRED_MESSAGE =
  "Ana firma seçmeden personel verileri görüntülenemez.";

function requireCompany(params = {}) {
  const mainCompanySlug = String(
    params.mainCompanySlug || params.slug || "",
  ).trim();
  if (!mainCompanySlug) throw new Error(COMPANY_REQUIRED_MESSAGE);
  return params;
}

function unwrap(payload, fallback = null) {
  if (payload && typeof payload === "object" && payload.ok === true) {
    return payload?.data ?? fallback;
  }
  // TODO: Personel endpointleri tamamen { ok, data, message } formatına
  // taşınınca doğrudan array/object cevap desteği kaldırılacak.
  return payload ?? fallback;
}

export async function fetchDailyCards(params = {}) {
  return unwrap(await apiGet("/personel/daily/cards", requireCompany(params)), []);
}

export async function saveDailyEntry(payload) {
  // TODO: Günlük yevmiye kaydı backend activity log helper ile loglanacak.
  return unwrap(await apiPost("/personel/daily/entry/save", requireCompany(payload)));
}

export async function fetchWeeklySummary(params = {}) {
  return unwrap(
    await apiGet("/personel/daily/weekly-summary", requireCompany(params)),
    { rows: [], toplamlar: {} },
  );
}

export async function markWeeklyPaid(payload) {
  // TODO: Haftalık ödeme işaretleme backend activity log helper ile loglanacak.
  return unwrap(
    await apiPost("/personel/daily/weekly-summary/mark-paid", requireCompany(payload)),
  );
}

export async function createWeeklySlip(payload) {
  // TODO: Ödeme fişi oluşturma backend activity log helper ile loglanacak.
  return unwrap(
    await apiPost("/personel/daily/weekly-summary/create-slip", requireCompany(payload)),
  );
}

export async function fetchPaymentHistory(params = {}) {
  return unwrap(
    await apiGet("/personel/daily/payments/history", requireCompany(params)),
    [],
  );
}

export async function fetchPersonelCards(params = {}) {
  return fetchDailyCards(params);
}

export async function savePersonelCard(payload) {
  // TODO: Personel kartı oluşturma/güncelleme backend activity log helper ile loglanacak.
  if (payload?.id) {
    return unwrap(
      await apiPatch(
        `/personel/daily/cards/${encodeURIComponent(payload?.id)}`,
        requireCompany(payload),
      ),
    );
  }
  return unwrap(await apiPost("/personel/daily/cards", requireCompany(payload)));
}

export async function bulkImportPersonelCards(payload) {
  return unwrap(
    await apiPost("/personel/daily/cards/bulk-import", requireCompany(payload)),
  );
}

export async function fetchHrOverview(params = {}) {
  return unwrap(await apiGet("/personel/hr/overview", requireCompany(params)), null);
}

export async function fetchHrMonthly(params = {}) {
  return unwrap(await apiGet("/personel/hr/monthly", requireCompany(params)), []);
}

export async function saveHrMonthly(payload) {
  if (payload?.id) {
    return unwrap(
      await apiPatch(
        `/personel/hr/monthly/${encodeURIComponent(payload?.id)}`,
        requireCompany(payload),
      ),
    );
  }
  return unwrap(await apiPost("/personel/hr/monthly", requireCompany(payload)));
}

export async function fetchOvertimeLeave(params = {}) {
  return unwrap(
    await apiGet("/personel/hr/overtime-leave", requireCompany(params)),
    { overtime: [], leave: [] },
  );
}

export async function saveOvertimeLeave(payload) {
  // TODO: Mesai/izin kaydı backend activity log helper ile loglanacak.
  const resource = payload?.izinTuru ? "leave" : "overtime";
  if (payload?.id) {
    return unwrap(
      await apiPatch(
        `/personel/hr/${resource}/${encodeURIComponent(payload?.id)}`,
        requireCompany(payload),
      ),
    );
  }
  return unwrap(await apiPost(`/personel/hr/${resource}`, requireCompany(payload)));
}

export async function fetchLeaveSummary(params = {}) {
  return unwrap(await apiGet("/personel/hr/leave-summary", requireCompany(params)), null);
}

export async function calculatePayroll(payload) {
  return unwrap(await apiPost("/personel/hr/payroll/calculate", requireCompany(payload)));
}

export async function savePayroll(payload) {
  // TODO: Bordro kaydı backend activity log helper ile loglanacak.
  return unwrap(await apiPost("/personel/hr/payroll/save", requireCompany(payload)));
}

export async function calculatePaymentControl(payload) {
  return unwrap(
    await apiPost("/personel/hr/payment-control/calculate", requireCompany(payload)),
  );
}

export async function savePaymentControl(payload) {
  return unwrap(
    await apiPost("/personel/hr/payment-control/save", requireCompany(payload)),
  );
}

export async function createPaymentControlSlip(payload) {
  return unwrap(
    await apiPost("/personel/hr/payment-control/create-slip", requireCompany(payload)),
  );
}
