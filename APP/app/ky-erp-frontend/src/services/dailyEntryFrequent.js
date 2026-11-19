/**
 * Günlük Operasyon sık kullanılanlar: yalnız gerçek çalışma kayıtları.
 * Bu veri hiçbir zaman vardiya kaydı oluşturmaz; sadece ekran sıralamasıdır.
 */
export function rankDailyFrequentEmployees(employees, attendance, selectedDate, shift, limit = 10) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(selectedDate || ""))) return [];
  const dateValue = new Date(selectedDate + "T12:00:00");
  const since = new Date(dateValue);
  since.setDate(since.getDate() - 29);
  const fromKey = [since.getFullYear(), String(since.getMonth() + 1).padStart(2, "0"), String(since.getDate()).padStart(2, "0")].join("-");
  const activePeople = new Map((Array.isArray(employees) ? employees : [])
    .filter((person) => person?.id && person.active !== false)
    .map((person) => [String(person.id), person]));
  const ranking = new Map();
  const seen = new Set();
  for (const row of Array.isArray(attendance) ? attendance : []) {
    const id = String(row.employeeId ?? row.personelId ?? row.personId ?? row.employee_id ?? "");
    const date = String(row.workDate ?? row.date ?? row.work_date ?? "").slice(0, 10);
    if (!activePeople.has(id) || date < fromKey || date > selectedDate) continue;
    const isDay = Boolean(row.dayShift ?? row.day ?? row.day_shift);
    const isNight = Boolean(row.nightShift ?? row.night ?? row.night_shift);
    if (shift === "night" ? !isNight : !isDay) continue;
    const key = id + "|" + date + "|" + shift;
    if (seen.has(key)) continue;
    seen.add(key);
    const record = ranking.get(id) || { count: 0, lastDate: "", sameWeekday: 0 };
    record.count += 1;
    if (date > record.lastDate) record.lastDate = date;
    const observed = new Date(date + "T12:00:00");
    if (observed.getDay() === dateValue.getDay()) record.sameWeekday += 1;
    ranking.set(id, record);
  }
  return [...ranking.entries()]
    .sort((a, b) => b[1].count - a[1].count
      || b[1].sameWeekday - a[1].sameWeekday
      || b[1].lastDate.localeCompare(a[1].lastDate)
      || String(activePeople.get(a[0])?.name || "").localeCompare(String(activePeople.get(b[0])?.name || ""), "tr"))
    .slice(0, Math.max(0, Math.min(20, Number(limit) || 10)))
    .map(([id, stats]) => ({ person: activePeople.get(id), ...stats }));
}
