/**
 * Period roster onboarding for Daily Operations.
 * The UI never marks a newly-added person as saved until a fresh server read confirms it.
 * This does not create a shift/attendance entry: the operator explicitly saves the chosen shift.
 */
export function dailyRosterIds(payload) {
  const raw = Array.isArray(payload?.employeeIds) ? payload.employeeIds
    : Array.isArray(payload) ? payload : null;
  if (!raw) throw new Error("Dönem personel listesi sunucudan doğrulanamadı.");
  return [...new Set(raw.map((id) => String(id || "").trim()).filter(Boolean))];
}

export async function persistDailyRosterMember({
  employeeId, mainCompanyId, startDate, endDate, localIds = [],
  readRoster, writeRoster, addRoster,
}) {
  const id = String(employeeId || "").trim();
  if (!id || !mainCompanyId || !startDate || !endDate)
    throw new Error("Personel veya tarih aralığı eksik; dönem kaydı yapılamadı.");
  const params = { mainCompanyId, startDate, endDate };
  // Tek POST: sunucu hedef üyeyi ekler ve D1'den tekrar okuyarak doğrular.
  // Önce GET + POST + tekrar GET zinciri yüksek gecikme oluşturuyordu.
  if (typeof addRoster === "function") {
    // Eski ve yeni Worker ile tek istekli, silmeyen ortak sözleşme.
    // Old Worker 'add' modunu bilmiyor: boş employeeIds bütün havuzu silebilirdi.
    const safeIds = [...new Set([...localIds.map(String).filter(Boolean), id])];
    const confirmed = dailyRosterIds(await addRoster({
      ...params, mode: "merge", employeeIds: safeIds,
    }));
    if (!confirmed.includes(id))
      throw new Error("Sunucu personelin dönem havuzuna kaydedildiğini doğrulamadı.");
    return new Set(confirmed);
  }
  const existing = dailyRosterIds(await readRoster(params));
  const requested = [...new Set([...existing, ...localIds].map((value) => String(value || "").trim()).filter(Boolean))];
  if (!requested.includes(id)) requested.push(id);
  const saved = dailyRosterIds(await writeRoster({ ...params, employeeIds: requested, mode: "merge" }));
  if (!saved.includes(id))
    throw new Error("Sunucu personelin dönem listesine eklendiğini bildirmedi.");
  const confirmed = dailyRosterIds(await readRoster(params));
  if (!confirmed.includes(id))
    throw new Error("Personel kartı oluşturuldu, ancak dönem listesi tekrar okununca personel bulunamadı.");
  return new Set(confirmed);
}
