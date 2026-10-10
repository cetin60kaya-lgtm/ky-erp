/**
 * Read-only presentation adapter. No fabricated attendance, wage or device data.
 * Missing source values remain visibly unknown.
 */
const defined = (value) => value !== null && value !== undefined && String(value).trim() !== "";
export const displayValue = (value) => defined(value) ? String(value).trim() : "—";

const rawValue = (raw, ...names) => {
  for (const name of names) if (defined(raw?.[name])) return raw[name];
  return null;
};

export function normalizePerson(raw = {}, period = null) {
  const id = rawValue(raw, "id", "employeeId", "employee_id");
  const card = rawValue(raw, "cardNo", "card_no", "cardNumber");
  const fullName = rawValue(raw, "fullName", "name", "personnelName", "adSoyad");
  const employment = rawValue(raw, "status", "activePassive", "active_passive");
  const exitDate = rawValue(raw, "exitDate", "exit_date");
  const hireDate = rawValue(raw, "entryDate", "hireDate", "startDate", "entry_date");
  const validIso=(value)=>typeof value==="string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const selectedYear=Number(period?.year),selectedMonth=Number(period?.month);
  const validPeriod=Number.isInteger(selectedYear) && Number.isInteger(selectedMonth) &&
    selectedYear>=2000 && selectedMonth>=1 && selectedMonth<=12;
  let periodStatus = null;
  if(validPeriod) {
    const first=`${selectedYear}-${String(selectedMonth).padStart(2,"0")}-01`;
    const last=new Date(Date.UTC(selectedYear,selectedMonth,0)).toISOString().slice(0,10);
    if((validIso(hireDate) && hireDate>last) ||
      (validIso(exitDate) && exitDate<first))periodStatus="Dönem Dışı";
    else if(validIso(exitDate) && exitDate<=last)periodStatus="Çıkış Yapıldı";
    else if(validIso(hireDate) || validIso(exitDate))periodStatus="Dönemde Çalıştı";
  }
  return {
    id: id === null ? "" : String(id),
    cardNo: displayValue(card),
    fullName: displayValue(fullName),
    department: displayValue(rawValue(raw, "department", "departmentName", "bolum")),
    role: displayValue(rawValue(raw, "jobTitle", "title", "task", "position", "gorev")),
    title: displayValue(rawValue(raw, "title", "jobTitle")),
    personnelCode: displayValue(rawValue(raw, "personnelCode", "code")),
    sgkStatus: displayValue(rawValue(raw, "sgkStatus", "sgk_status")),
    phone: displayValue(rawValue(raw, "phone")),
    group: displayValue(rawValue(raw, "workGroup", "groupName", "group")),
    startDate: displayValue(rawValue(raw, "entryDate", "hireDate", "startDate", "entry_date")),
    exitDate: displayValue(exitDate),
    status: periodStatus || displayValue(employment),
    cardState: card === null ? "Atanmamış" : "Atanmış",
  };
}

export function normalizeAttendanceDay(raw = {}, person = {}) {
  return {
    date: displayValue(rawValue(raw, "date", "workDate", "day")),
    cardNo: displayValue(person.cardNo),
    fullName: displayValue(person.fullName),
    entry: displayValue(rawValue(raw, "entry", "entryTime", "firstIn", "inTime")),
    exit: displayValue(rawValue(raw, "exit", "exitTime", "lastOut", "outTime")),
    source: displayValue(rawValue(raw, "source", "sourceType")),
    e: displayValue(rawValue(raw, "e", "eStatus")),
    status: displayValue(rawValue(raw, "status", "attendanceStatus")),
    duration: displayValue(rawValue(raw, "workedMinutes", "workedHours", "duration")),
  };
}

export function toPersonRows(people = [], view = "people") {
  return people.map((person) => {
    if (view === "cards") return {
      "Kart No": person.cardNo, "Ad Soyad": person.fullName, "Kart Durumu": person.cardState,
      "Başlangıç": person.startDate, "Bitiş": person.exitDate, "Son Geçiş": "—",
      _id: person.id,
    };
    if (view === "employment") return {
      "Personel": person.fullName, "Giriş Tarihi": person.startDate, "Çıkış Tarihi": person.exitDate,
      "Departman": person.department, "Görev": person.role, "Durum": person.status, _id: person.id,
    };
    return {
      "Kart No": person.cardNo, "Ad Soyad": person.fullName, "Departman": person.department,
      "Görev": person.role, "Grup": person.group, "Giriş": person.startDate,
      "Durum": person.status, _id: person.id,
    };
  });
}

export function toAttendanceRows(days = [], person = {}) {
  return days.map((raw, index) => {
    const row = normalizeAttendanceDay(raw, person);
    return {
      "Tarih": row.date, "Kart No": row.cardNo, "Personel": row.fullName,
      "Giriş": row.entry, "Çıkış": row.exit, "Kaynak": row.source,
      "E": row.e, "Durum": row.status, "Süre": row.duration,
      _id: String(index) + "_" + row.date,
    };
  });
}

export function getDataRequirement(tab) {
  if (tab?.section === "people" && ["people", "cards", "employment"].includes(tab.id)) return "people";
  if (tab?.section === "attendance" && ["live", "punches", "history"].includes(tab.id)) return "attendance";
  if (tab?.section === "timesheet" && tab.id === "daily") return "attendance";
  return "unconnected";
}

export function safeFileNameSegment(value) {
  return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,80);
}

export function csvForTable(columns, rows) {
  const cell = (value) => {
    const raw = String(value ?? "");
    const hardened = /^[\s]*[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
    return '"' + hardened.replace(/"/g,'""') + '"';
  };
  return "\ufeff" + [columns, ...rows.map((r) => columns.map((key) => r[key]))]
    .map((r) => r.map(cell).join(";")).join("\r\n");
}
