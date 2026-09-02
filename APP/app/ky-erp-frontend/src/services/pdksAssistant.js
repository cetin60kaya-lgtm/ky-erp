import {
  addPdksTimeEvent,
  getPdksPeople,
  savePdksAdjustment,
  savePdksDayOverride,
  savePdksLeave,
} from "./pdksApi";

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function todayIstanbul() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDate(base, days) {
  const date = new Date(`${base}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function extractDates(command) {
  const values = [];
  const push = (value) => { if (value && !values.includes(value)) values.push(value); };
  for (const match of command.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
    push(`${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}`);
  }
  for (const match of command.matchAll(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](20\d{2})\b/g)) {
    push(`${match[3]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`);
  }
  const normalized = normalize(command);
  const today = todayIstanbul();
  if (!values.length && normalized.includes("dun")) push(shiftDate(today, -1));
  if (!values.length && normalized.includes("yarin")) push(shiftDate(today, 1));
  if (!values.length) push(today);
  return values;
}

function extractTime(command) {
  const match = command.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return match ? `${String(Number(match[1])).padStart(2, "0")}:${match[2]}` : "";
}

function numeric(value) {
  const raw = String(value || "").replace(/\s/g, "");
  if (raw.includes(",") && raw.includes(".")) return Number(raw.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) return Number(raw.replace(/\./g, ""));
  return Number(raw.replace(",", "."));
}

function extractAmount(command) {
  const match = command.match(/\b(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d+)?)\s*(?:tl|₺)\b/i);
  return match ? numeric(match[1]) : 0;
}

function extractHours(command) {
  const match = command.match(/\b(\d+(?:[.,]\d+)?)\s*saat\b/i);
  return match ? numeric(match[1]) : 0;
}

function pdksPeopleOnly(people) {
  return (Array.isArray(people) ? people : []).filter((person) => {
    const sgk = normalize(person.sgkStatus || person.sgk_status || "VAR");
    return sgk === "var" && String(person.cardNo || person.card_no || "").trim();
  });
}

function resolvePerson(command, people) {
  const haystack = ` ${normalize(command)} `;
  const ranked = pdksPeopleOnly(people)
    .map((person) => {
      const fullName = normalize(person.fullName || person.full_name);
      const code = normalize(person.personnelCode || person.code);
      const card = normalize(person.cardNo || person.card_no);
      let score = 0;
      if (fullName && haystack.includes(` ${fullName} `)) score = 1000 + fullName.length;
      else if (code && haystack.includes(` ${code} `)) score = 900 + code.length;
      else if (card && haystack.includes(` ${card} `)) score = 850 + card.length;
      else if (fullName) {
        const tokens = fullName.split(" ").filter((token) => token.length > 1);
        const hits = tokens.filter((token) => haystack.includes(` ${token} `)).length;
        if (hits >= Math.min(2, tokens.length)) score = 100 + hits * 20 + fullName.length;
      }
      return { person, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) throw new Error("Personel adı/kodu bulunamadı. Ad soyadı biraz daha açık yazın.");
  if (ranked.length > 1 && ranked[0].score === ranked[1].score) throw new Error("Birden fazla personel eşleşti. Ad soyadı tam yazın.");
  return ranked[0].person;
}

function commandNote(command) {
  return `KY ERP Asistan · ${String(command).trim().slice(0, 300)}`;
}

export async function executePdksAssistantCommand(command, { mainCompanyId } = {}) {
  const raw = String(command || "").trim();
  if (!raw) throw new Error("Komut yazın.");
  const normalized = normalize(raw);
  const people = await getPdksPeople();
  const person = resolvePerson(raw, people);
  const dates = extractDates(raw);
  const date = dates[0];
  const note = commandNote(raw);

  if (normalized.includes("avans")) {
    const amount = extractAmount(raw);
    if (!(amount > 0)) throw new Error("Avans tutarını TL olarak yazın. Örnek: 5000 TL avans gir.");
    const saved = await savePdksAdjustment({
      mainCompanyId,
      employeeId: person.id,
      date,
      adjustmentType: "Avans",
      amount,
      hourOrDay: 0,
      paymentMethod: "Elden",
      payrollEffect: "Bordrodan düş",
      status: "APPROVED",
      note,
    });
    return { action: "ADVANCE", person, date, amount, saved, message: `${person.fullName} için ${amount.toLocaleString("tr-TR")} TL avans kaydedildi.` };
  }

  if (normalized.includes("mesai")) {
    const hours = extractHours(raw);
    const amount = extractAmount(raw);
    if (!(hours > 0) && !(amount > 0)) throw new Error("Mesai için saat veya tutar yazın. Örnek: 10 saat hafta içi mesai ekle.");
    const type = normalized.includes("resmi tatil")
      ? "Resmi Tatil Mesai"
      : normalized.includes("hafta sonu")
        ? "Hafta Sonu Mesai"
        : "Hafta İçi Mesai";
    const saved = await savePdksAdjustment({
      mainCompanyId,
      employeeId: person.id,
      date,
      adjustmentType: type,
      hourOrDay: hours,
      amount,
      paymentMethod: "Bordro",
      payrollEffect: "Bordroya ekle",
      status: "APPROVED",
      note,
    });
    return { action: "OVERTIME", person, date, hours, amount, saved, message: `${person.fullName} için ${hours || 0} saat ${type.toLocaleLowerCase("tr-TR")} kaydedildi.` };
  }

  if (normalized.includes("yillik izin") || /\bizin\b/.test(normalized)) {
    if (dates.length < 2) throw new Error("İzin için başlangıç ve bitiş tarihini birlikte yazın. Örnek: 05.09.2026-10.09.2026 yıllık izin.");
    const annual = normalized.includes("yillik izin");
    const saved = await savePdksLeave({
      mainCompanyId,
      employeeId: person.id,
      recordType: annual ? "Yıllık izin" : "İzin",
      startDate: dates[0],
      endDate: dates[1],
      status: "APPROVED",
      effectType: annual ? "Ücretli" : "Kayıt",
      note,
      allowDepartmentConflict: false,
    });
    return { action: "LEAVE", person, startDate: dates[0], endDate: dates[1], saved, message: `${person.fullName} için ${dates[0]} - ${dates[1]} izin kaydedildi.` };
  }

  if (normalized.includes("gelmedi") || normalized.includes("yok yaz") || normalized.includes("bugun yok") || normalized.includes("devamsiz")) {
    const saved = await savePdksDayOverride(person.id, {
      workDate: date,
      status: "KART_YOK",
      entry: null,
      exit: null,
      missingPunch: false,
      note,
    });
    return { action: "ABSENCE", person, date, saved, message: `${person.fullName} ${date} için gelmedi / kart yok olarak kaydedildi.` };
  }

  const time = extractTime(raw);
  if ((normalized.includes("gec geldi") || normalized.includes("giris") || normalized.includes("ise geldi")) && time) {
    const saved = await addPdksTimeEvent(person.id, {
      cardNo: person.cardNo,
      workDate: date,
      eventTime: time,
      direction: "IN",
      source: "KYERP_ASSISTANT",
      note,
    });
    return { action: "ENTRY", person, date, time, saved, message: `${person.fullName} için ${date} ${time} giriş kaydı eklendi.` };
  }

  if ((normalized.includes("cikti") || normalized.includes("cikis")) && time) {
    const saved = await addPdksTimeEvent(person.id, {
      cardNo: person.cardNo,
      workDate: date,
      eventTime: time,
      direction: "OUT",
      source: "KYERP_ASSISTANT",
      note,
    });
    return { action: "EXIT", person, date, time, saved, message: `${person.fullName} için ${date} ${time} çıkış kaydı eklendi.` };
  }

  throw new Error("Komut anlaşılamadı. Giriş/çıkış, gelmedi, izin, avans veya mesai komutu yazın.");
}

export const PDKS_ASSISTANT_EXAMPLES = [
  "Ali Akkaya bugün 08:32 giriş yaptı",
  "Ali Akkaya bugün gelmedi, yok yaz",
  "Ali Akkaya için 5000 TL avans gir",
  "Ali Akkaya 01.09.2026 tarihinde 10 saat hafta içi mesai ekle",
  "Ali Akkaya 05.09.2026-10.09.2026 yıllık izin",
];
