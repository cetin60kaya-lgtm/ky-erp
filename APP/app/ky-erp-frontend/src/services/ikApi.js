import { apiGet, apiPatch, apiPost, apiUpload } from "../utils/api";
import { apiDelete } from "../utils/api";

export { fetchErpModuleData, runErpApprovedAction } from "./erpApi";

const dailyRevisionCache = new Map();
const DAILY_COMPANY_ALIASES = new Set([
  "",
  "mecit-hakan",
  "main-mecit-hakan",
  "mecit-hakan-gursu",
  "hakan-baski",
  "main-hakan",
  "main-hakan-baski",
  "hkn-baski",
]);

function dailyText(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function canonicalDailyCompany(value) {
  const normalized = dailyText(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  return DAILY_COMPANY_ALIASES.has(normalized) ? "mecit-hakan" : normalized;
}

function dailyRevisionKey(companyId, employeeId, workDate) {
  return `${canonicalDailyCompany(companyId)}|${dailyText(employeeId)}|${dailyText(workDate).slice(0, 10)}`;
}

function dailyCompanyFrom(value = {}) {
  return canonicalDailyCompany(
    value?.mainCompanyId ||
      value?.mainCompanySlug ||
      value?.main_company_id ||
      value?.main_company_slug ||
      "mecit-hakan",
  );
}

function rememberDailyRevisions(payload, companyId) {
  const source = payload?.data ?? payload?.items ?? payload;
  const rows = Array.isArray(source)
    ? source
    : Array.isArray(source?.rows)
      ? source.rows
      : [];
  const company = canonicalDailyCompany(companyId || "mecit-hakan");
  rows.forEach((row) => {
    const employeeId = dailyText(
      row?.employeeId || row?.personId || row?.personelId || row?.employee_id,
    );
    const workDate = dailyText(
      row?.workDate || row?.date || row?.selectedDate || row?.work_date,
    ).slice(0, 10);
    const updatedAt = dailyText(row?.updatedAt || row?.updated_at);
    if (employeeId && workDate && updatedAt) {
      dailyRevisionCache.set(
        dailyRevisionKey(company, employeeId, workDate),
        updatedAt,
      );
    }
  });
}

function withDailyRowRevision(row = {}, companyId = "mecit-hakan") {
  if (row?.expectedUpdatedAt || row?.expected_updated_at) return row;
  const employeeId = dailyText(
    row?.employeeId || row?.personId || row?.personelId || row?.employee_id,
  );
  const workDate = dailyText(
    row?.workDate || row?.date || row?.selectedDate || row?.work_date,
  ).slice(0, 10);
  if (!employeeId || !workDate) return row;
  const expectedUpdatedAt = dailyRevisionCache.get(
    dailyRevisionKey(companyId, employeeId, workDate),
  );
  return expectedUpdatedAt ? { ...row, expectedUpdatedAt } : row;
}

function unwrap(payload) {
  return payload &&
    typeof payload === "object" &&
    payload.ok === true &&
    Object.prototype.hasOwnProperty.call(payload, "data")
    ? payload?.data
    : payload;
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
  return unwrap(await apiGet("/ik/monthly-employees", params));
}

export async function getAylikIzinler(params = {}) {
  return unwrap(await apiGet("/ik/leaves", params));
}

export async function getAylikMesailer(params = {}) {
  return unwrap(await apiGet("/ik/monthly-adjustments", params));
}

export async function getAylikLoglar(params = {}) {
  return unwrap(await apiGet("/ik/monthly-audit-logs", params));
}

export async function getResmiTatiller(params = {}) {
  return unwrap(await apiGet("/ik/official-holidays", params));
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
  return unwrap(await apiGet("/ik/documents", params));
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
  return unwrap(await apiGet("/ik/daily-employees", params));
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
  return unwrap(await apiGet("/ik/skills", params));
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
  const result = unwrap(await apiGet("/ik/daily-attendance", params));
  rememberDailyRevisions(result, dailyCompanyFrom(params));
  return result;
}

export async function saveGunlukPuantaj(payload = {}) {
  const companyId = dailyCompanyFrom(payload);
  const nextPayload = Array.isArray(payload?.rows)
    ? {
        ...payload,
        rows: payload.rows.map((row) => withDailyRowRevision(row, companyId)),
      }
    : payload;
  const result = unwrap(await apiPost("/ik/daily-attendance/save-range", nextPayload));
  rememberDailyRevisions(result, companyId);
  return result;
}

export async function getGunlukDurum(params = {}) {
  return getGunlukPuantaj(params);
}

export async function saveGunlukDurum(payload = {}) {
  return saveGunlukPuantaj(payload);
}

export async function getGunlukPersonelGunKayitlari(params = {}) {
  const result = unwrap(await apiGet("/ik/gunluk-personel/gun-kayitlari", params));
  rememberDailyRevisions(result, dailyCompanyFrom(params));
  return result;
}

export async function getGunlukPersonelOzet(params = {}) {
  return unwrap(await apiGet("/ik/gunluk-personel/ozet", params));
}

export async function saveGunlukPersonelGunKayitlari(payload = {}) {
  const companyId = dailyCompanyFrom(payload);
  const workDate = dailyText(payload?.date || payload?.selectedDate).slice(0, 10);
  const nextPayload = Array.isArray(payload?.personnelEntries)
    ? {
        ...payload,
        personnelEntries: payload.personnelEntries.map((entry) =>
          withDailyRowRevision(
            {
              ...entry,
              employeeId: entry?.employeeId || entry?.personelId,
              workDate,
            },
            companyId,
          ),
        ),
      }
    : payload;
  const result = unwrap(await apiPost("/ik/gunluk-personel/gun-kayitlari", nextPayload));
  rememberDailyRevisions(result, companyId);
  return result;
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
  const companyId = dailyCompanyFrom(payload);
  const nextPayload = Array.isArray(payload?.rows)
    ? {
        ...payload,
        rows: payload.rows.map((row) => withDailyRowRevision(row, companyId)),
      }
    : payload;
  const result = unwrap(await apiPost("/ik/gunluk-personel/excel-apply", nextPayload));
  rememberDailyRevisions(result, companyId);
  return result;
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
