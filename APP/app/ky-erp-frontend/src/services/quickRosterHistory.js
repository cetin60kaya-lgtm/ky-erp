/**
 * Hızlı giriş önerileri: geçmiş 14 günlük GERÇEK vardiya kayıtlarından,
 * sadece havuz dışında bulunan aktif kişiler. Sadece salt-okunur sıralama.
 */
function dayKey(value) {
  return String(value || "").slice(0, 10);
}
function addDays(key, delta) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + delta, 12);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
function worked(value) {
  return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

export function rankQuickRosterCandidates(people, attendance, date, shift) {
  const start14 = addDays(date, -14);
  const start7 = addDays(date, -7);
  if (!start14 || !start7 || !["day", "night"].includes(shift)) return [];
  const candidates = new Map((Array.isArray(people) ? people : [])
    .filter((p) => p?.id && p.active !== false).map((p) => [String(p.id), p]));
  const scores = new Map();
  const unique = new Set();
  for (const row of Array.isArray(attendance) ? attendance : []) {
    const id = String(row?.employeeId ?? row?.personId ?? row?.personelId ?? row?.employee_id ?? "");
    const workedDate = dayKey(row?.workDate ?? row?.date ?? row?.work_date);
    if (!candidates.has(id) || workedDate < start14 || workedDate >= date) continue;
    if (!worked(shift === "night" ? (row.nightShift ?? row.night ?? row.night_shift)
      : (row.dayShift ?? row.day ?? row.day_shift))) continue;
    const key = id + "|" + workedDate;
    if (unique.has(key)) continue;
    unique.add(key);
    const score = scores.get(id) || { last7: 0, last14: 0, lastDate: "" };
    score.last14++;
    if (workedDate >= start7) score.last7++;
    if (workedDate > score.lastDate) score.lastDate = workedDate;
    scores.set(id, score);
  }
  return [...candidates.entries()].map(([id, person]) => ({
    person, ...(scores.get(id) || { last7: 0, last14: 0, lastDate: "" }),
  })).sort((a, b) => b.last7 - a.last7 || b.last14 - a.last14 ||
    b.lastDate.localeCompare(a.lastDate) ||
    String(a.person.name || "").localeCompare(String(b.person.name || ""), "tr"));
}
