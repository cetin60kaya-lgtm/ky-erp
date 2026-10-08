// Shared presentation-only helpers for desktop-aligned PDKS web views.
// No DB writes or interpretation of missing physical punches happens here.
const upper = value => String(value ?? "").trim().toLocaleUpperCase("tr-TR");

const exitTimestamp = value => {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(text.slice(0, 10) + "T12:00:00");
    return Number.isNaN(date.getTime()) ? null : date.getTime();
  }
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (!match) return null;
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12);
  return date.getFullYear() === Number(match[3]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[1])
    ? date.getTime() : null;
};

export function isActivePdksPerson(person, now = Date.now()) {
  const status = upper(person?.status) + " " + upper(person?.activePassive);
  if (/PASIF|PASİF|AYRIL|ÇIKIŞ|CIKIS|INACTIVE/.test(status)) return false;
  const exit = exitTimestamp(person?.exitDate ?? person?.exit_date);
  return exit === null || exit > now;
}

export function visiblePdksPeople(people, status = "AKTIF", search = "", now = Date.now()) {
  const query = upper(search);
  return (Array.isArray(people) ? people : [])
    .filter(person => {
      const active = isActivePdksPerson(person, now);
      if (status === "AKTIF" && !active) return false;
      if (status === "PASIF" && active) return false;
      return !query || upper([
        person.personnelCode, person.code, person.fullName, person.cardNo,
        person.personnelGroupName, person.groupName, person.workGroupName,
        person.department, person.title,
      ].join(" ")).includes(query);
    })
    .sort((a,b) => String(a.cardNo || a.personnelCode || a.code || "")
      .localeCompare(String(b.cardNo || b.personnelCode || b.code || ""), "tr", { numeric: true }));
}

export function selectedPdksPerson(people, status, selectedId, now = Date.now()) {
  const scoped = visiblePdksPeople(people, status, "", now);
  return scoped.find(person => person.id === selectedId) || scoped[0] || null;
}

export function pdksLiveHealth(devices, now = Date.now()) {
  const list = Array.isArray(devices) ? devices : [];
  const activeDevices = list.filter(row => Number(row.active) !== 0);
  const recent = (value, age) => {
    if (!value) return false;
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) && timestamp <= now + 60000 && now - timestamp < age;
  };
  const onlineCount = activeDevices.filter(row => recent(row.lastSeenAt, 5 * 60 * 1000)).length;
  const lastSyncedDevice = activeDevices
    .filter(row => row.lastSyncAt)
    .sort((a,b) => new Date(b.lastSyncAt).getTime() - new Date(a.lastSyncAt).getTime())[0] || null;
  const hasRecentSync = activeDevices.some(row =>
    recent(row.lastSeenAt, 5 * 60 * 1000) && recent(row.lastSyncAt, 10 * 60 * 1000));
  return {
    totalCount:list.length, activeCount:activeDevices.length,
    onlineCount, offlineCount:Math.max(0, activeDevices.length - onlineCount),
    lastSyncedDevice, hasRecentSync,
    freshness:hasRecentSync ? "fresh" : onlineCount ? "warning" : "offline",
  };
}
