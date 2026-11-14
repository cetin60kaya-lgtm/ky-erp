// Pure validation shared by IsNet settings and isolated negative tests.
export const normalizeIsnetConnectionMode = (value: unknown) =>
  String(value ?? "").trim().toLowerCase() === "api" ? "api" : "portal";

type Row = Record<string, any>;
const text = (value: unknown) => String(value ?? "").trim();

export function checkedIsnetCompanySave(current: Row, submitted: Row, clock = Date.now()):
  | { ok: true; username: string; companyId: string; companyName: string; mode: string }
  | { ok: false; code: string; message: string } {
  const username = text(submitted.username);
  const companyId = text(submitted.companyId);
  const mode = normalizeIsnetConnectionMode(submitted.connectionMode);
  const testedAt = Date.parse(text(current.testedAt));
  const recent = Number.isFinite(testedAt) && testedAt <= clock && clock - testedAt < 10 * 60_000;
  if (!username || username !== text(current.username) ||
      mode !== text(current.connectionMode) || !recent ||
      !Array.isArray(current.companies) || !current.companies.length) {
    return { ok: false, code: "ISNET_RETEST_REQUIRED",
      message: "Önce İşNet bağlantısını doğrulayın. Doğrulama sonrası 10 dakika içinde yetkili firmayı kaydedebilirsiniz." };
  }
  const company = current.companies.find((row: Row) => text(row.id) === companyId);
  if (!companyId || !company) {
    return { ok: false, code: "ISNET_COMPANY_REQUIRED",
      message: "Bağlantı doğrulamasından gelen yetkili firmalardan birini seçin." };
  }
  return { ok: true, username, companyId,
    companyName: text(company.name || company.companyName), mode };
}
