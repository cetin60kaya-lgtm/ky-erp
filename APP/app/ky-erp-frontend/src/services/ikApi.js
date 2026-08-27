import { apiGet, apiPatch, apiPost, apiUpload } from "../utils/api";
import { apiDelete } from "../utils/api";

export { fetchErpModuleData, runErpApprovedAction } from "./erpApi";

function unwrap(payload) {
  return payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload?.data
    : payload;
}

// İK ana ekranı çok sayıda bağımsız listeyi aynı anda yükler. Yardımcı bir
// listenin geçici olarak hata vermesi Günlük Personel Havuzu gibi çalışan bir
// kaynağı boşaltmamalıdır. Başarılı son listeyi bellek içinde tutar; 401/403
// ise gerçek oturum/yetki hatası olduğu için aynen yukarı taşınır.
const stableIkListCache = new Map();

function stableListKey(path, params = {}) {
  const query = Object.entries(params || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");
  return `${path}?${query}`;
}

async function stableIkList(path, params = {}) {
  const key = stableListKey(path, params);
  try {
    const value = unwrap(await apiGet(path, params));
    const rows = Array.isArray(value) ? value : [];
    stableIkListCache.set(key, rows);
    return rows;
  } catch (error) {
    const status = Number(error?.status || 0);
    if (status === 401 || status === 403) throw error;
    const cached = stableIkListCache.get(key);
    if (Array.isArray(cached)) return cached;
    console.warn(
      `[KY ERP][IK] ${path} okunamadı; diğer İK listeleri çalışmaya devam ediyor.`,
      error?.message || error,
    );
    return [];
  }
}

export async function getIkPersonel(params = {}) {
  return unwrap(await apiGet("/ik/personel", params));
}

export async function createIkPersonel(payload = {}) {
  return unwrap(await apiPost("/ik/personel", payload));
}

export async function updateIkPersonel(id, payload = {}) {
  return unwrap(
    await apiPatch(`/ik/personel/${encodeURIComponent(id)}`, payload),
  );
}

export async function getGunlukGiris(params = {}) {
  return unwrap(await apiGet("/ik/gunluk/giris", params));
}

export async function saveGunlukGiris(payload = {}) {
  return unwrap(await apiPost("/ik/gunluk/giris", payload));
}

export async function getGunlukOdeme(params = {}) {
  return unwrap(await apiGet("/ik/gunluk/odeme", params));
}

export async function hesaplaGunlukOdeme(payload = {}) {
  return unwrap(await apiPost("/ik/gunluk/odeme-hesapla", payload));
}

export async function getAylikPersonel(params = {}) {
  return stableIkList("/ik/monthly-employees", params);
}

export async function getAylikIzinler(params = {}) {
  return stableIkList("/ik/leaves", params);
}

export async function getAylikMesailer(params = {}) {
  return stableIkList("/ik/monthly-adjustments", params);
}

export async function getAylikLoglar(params = {}) {
  return stableIkList("/ik/monthly-audit-logs", params);
}

export async function getResmiTatiller(params = {}) {
  return stableIkList("/ik/official-holidays", params);
}

export async function saveResmiTatil(payload = {}) {
  return unwrap(await apiPost("/ik/official-holidays", payload));
}

export async function updateResmiTatil(id, payload = {}) {
  return unwrap(
    await apiPatch(`/ik/official-holidays/${encodeURIComponent(id)}`, payload),
  );
}

export async function getAylikEvraklar(params = {}) {
  return stableIkList("/ik/documents", params);
}

export async function saveAylikEvrak(payload = {}) {
  return unwrap(await apiPost("/ik/documents", payload));
}

export async function deleteAylikEvrak(id) {
  return unwrap(await apiDelete(`/ik/documents/${encodeURIComponent(id)}`));
}

export async function createAylikPersonel(payload = {}) {
  return unwrap(await apiPost("/ik/monthly-employees", payload));
}

export async function updateAylikPersonel(id, payload = {}) {
  return unwrap(
    await apiPatch(`/ik/monthly-employees/${encodeURIComponent(id)}`, payload),
  );
}

export async function updateAylikIzinBakiyeleri(payload = {}) {
  return unwrap(await apiPost("/ik/monthly-employees/leave-balances", payload));
}

export async function deleteAylikPersonel(id) {
  return unwrap(await apiDelete(`/ik/monthly-employees/${encodeURIComponent(id)}`));
}

export async function saveAylikSozlesme(employeeId, payload = {}) {
  return unwrap(
    await apiPost(
      `/ik/monthly-employees/${encodeURIComponent(employeeId)}/salary-contracts`,
      payload,
    ),
  );
}

export async function getAylikSozlesmeler(employeeId) {
  return unwrap(
    await apiGet(
      `/ik/monthly-employees/${encodeURIComponent(employeeId)}/salary-contracts`,
    ),
  );
}

export async function saveAylikMesai(payload = {}) {
  return unwrap(await apiPost("/ik/monthly-adjustments", payload));
}

export async function updateAylikMesai(id, payload = {}) {
  return unwrap(
    await apiPatch(`/ik/monthly-adjustments/${encodeURIComponent(id)}`, payload),
  );
}

export async function deleteAylikMesai(id) {
  return unwrap(await apiDelete(`/ik/monthly-adjustments/${encodeURIComponent(id)}`));
}

export async function saveAylikIzin(payload = {}) {
  return unwrap(await apiPost("/ik/leaves", payload));
}

export async function updateAylikIzin(id, payload = {}) {
  return unwrap(await apiPatch(`/ik/leaves/${encodeURIComponent(id)}`, payload));
}

export async function deleteAylikIzin(id) {
  return unwrap(await apiDelete(`/ik/leaves/${encodeURIComponent(id)}`));
}

export async function getGunlukPersonel(params = {}) {
  return stableIkList("/ik/daily-employees", params);
}

export async function createGunlukPersonel(payload = {}) {
  return unwrap(await apiPost("/ik/daily-employees", payload));
}

export async function updateGunlukPersonel(id, payload = {}) {
  return unwrap(
    await apiPatch(`/ik/daily-employees/${encodeURIComponent(id)}`, payload),
  );
}

export async function deleteGunlukPersonel(id, payload = {}) {
  return unwrap(
    await apiDelete(`/ik/daily-employees/${encodeURIComponent(id)}`, payload),
  );
}

export async function uploadGunlukPersonelExcel(file, params = {}) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") form.append(key, value);
  });
  return unwrap(await apiUpload("/ik/daily-employees/excel-upload", form));
}

export async function getIkSkills(params = {}) {
  return stableIkList("/ik/skills", params);
}

export async function createIkSkill(payload = {}) {
  return unwrap(await apiPost("/ik/skills", payload));
}

export async function updateIkSkill(id, payload = {}) {
  return unwrap(await apiPatch(`/ik/skills/${encodeURIComponent(id)}`, payload));
}

export async function getIkSkillDuplicates(params = {}) {
  return unwrap(await apiGet("/ik/skills/duplicates", params));
}

export async function mergeIkSkills(payload = {}) {
  return unwrap(await apiPost("/ik/skills/merge", payload));
}

export async function getGunlukPuantaj(params = {}) {
  return stableIkList("/ik/daily-attendance", params);
}

export async function saveGunlukPuantaj(payload = {}) {
  return unwrap(await apiPost("/ik/daily-attendance/save-range", payload));
}

export async function getGunlukDurum(params = {}) {
  return getGunlukPuantaj(params);
}

export async function saveGunlukDurum(payload = {}) {
  return saveGunlukPuantaj(payload);
}

export async function getGunlukPersonelGunKayitlari(params = {}) {
  return unwrap(await apiGet("/ik/gunluk-personel/gun-kayitlari", params));
}

export async function getGunlukPersonelOzet(params = {}) {
  return unwrap(await apiGet("/ik/gunluk-personel/ozet", params));
}

export async function saveGunlukPersonelGunKayitlari(payload = {}) {
  return unwrap(await apiPost("/ik/gunluk-personel/gun-kayitlari", payload));
}

export async function getGunlukPersonelListe(params = {}) {
  return unwrap(await apiGet("/ik/gunluk-personel/liste", params));
}

export async function saveGunlukPersonelListe(payload = {}) {
  return unwrap(await apiPost("/ik/gunluk-personel/liste", payload));
}

export async function uploadGunlukPersonelGirisExcel(file, params = {}) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") form.append(key, value);
  });
  return unwrap(await apiUpload("/ik/gunluk-personel/excel-upload", form));
}

export async function applyGunlukPersonelGirisExcel(payload = {}) {
  return unwrap(await apiPost("/ik/gunluk-personel/excel-apply", payload));
}

export async function saveAylikDevamsizlik(payload = {}) {
  return unwrap(await apiPost("/ik/aylik/devamsizlik", payload));
}

export async function hesaplaBordro(payload = {}) {
  return unwrap(await apiPost("/ik/bordro/hesapla", payload));
}

export async function olusturBordro(payload = {}) {
  return unwrap(await apiPost("/ik/bordro/olustur", payload));
}

export async function getIkRaporlar(params = {}) {
  return unwrap(await apiGet("/ik/raporlar", params));
}

export async function getIkAdvancedMonth(params = {}) {
  return unwrap(await apiGet("/ik/advanced/month", params));
}

export async function getIkAdvancedQuickList(params = {}) {
  return unwrap(await apiGet("/ik/advanced/quick-list", params));
}

export async function getIkAdvancedPersonCalendar(employeeId, params = {}) {
  return unwrap(
    await apiGet(`/ik/advanced/person-calendar/${encodeURIComponent(employeeId)}`, params),
  );
}

export async function getIkAdvancedControlMatrix(params = {}) {
  return unwrap(await apiGet("/ik/advanced/control-matrix", params));
}

export async function getIkAdvancedExceptionHistory(params = {}) {
  return unwrap(await apiGet("/ik/advanced/exception-history", params));
}

export async function getIkAdvancedAuditLogs(params = {}) {
  return unwrap(await apiGet("/ik/advanced/audit-logs", params));
}

export async function getIkAdvancedPayroll(params = {}) {
  return unwrap(await apiGet("/ik/advanced/payroll", params));
}

export async function saveIkAdvancedPersonCard(employeeId, payload = {}) {
  return unwrap(
    await apiPost(`/ik/advanced/person-card/${encodeURIComponent(employeeId)}`, payload),
  );
}

export async function saveIkAdvancedAttendance(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/attendance", payload));
}

export async function saveIkAdvancedException(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/exception", payload));
}

export async function saveIkAdvancedLeave(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/leave", payload));
}

export async function getIkAdvancedLeaveCenter(params = {}) {
  return unwrap(await apiGet("/ik/advanced/leave-center", params));
}

export async function previewIkAdvancedLeave(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/leave/preview", payload));
}

export async function saveIkAdvancedLeavePolicy(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/leave/policy", payload));
}

export async function cancelIkAdvancedLeave(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/leave/cancel", payload));
}

export async function deleteIkAdvancedException(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/exception/delete", payload));
}

export async function previewIkAdvancedBulk(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/bulk-preview", payload));
}

export async function confirmIkAdvancedBulk(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/bulk-confirm", payload));
}

export async function saveIkAdvancedFinanceMovement(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/finance-movement", payload));
}

export async function updateIkAdvancedFinanceMovement(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/finance-movement/update", payload));
}

export async function deleteIkAdvancedFinanceMovement(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/finance-movement/delete", payload));
}

export async function saveIkAdvancedPayrollOverride(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/payroll/override", payload));
}

export async function saveIkAdvancedPayrollLines(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/payroll/save", payload));
}

export async function saveIkAdvancedSettlementDraft(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/settlement-draft", payload));
}

export async function uploadIkAdvancedDocument(file, params = {}) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") form.append(key, value);
  });
  return unwrap(await apiUpload("/ik/advanced/documents/upload", form));
}

export async function previewIkAdvancedSgk(file, params = {}) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") form.append(key, value);
  });
  return unwrap(await apiUpload("/ik/advanced/sgk/preview", form));
}

export async function confirmIkAdvancedSgk(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/sgk/confirm", payload));
}

export async function previewIkAdvancedCard(file, params = {}) {
  const form = new FormData();
  form.append("file", file);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") form.append(key, value);
  });
  return unwrap(await apiUpload("/ik/advanced/card/preview", form));
}

export async function confirmIkAdvancedCard(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/card/confirm", payload));
}

export async function runIkAdvancedCloseCheck(payload = {}) {
  return unwrap(await apiPost("/ik/advanced/close-check", payload));
}
