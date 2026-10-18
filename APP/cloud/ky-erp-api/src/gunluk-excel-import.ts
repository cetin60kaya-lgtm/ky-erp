import * as XLSX from "xlsx";

type SheetRow = Record<string, unknown>;
export type DailyExcelShift = { name: string; personnelNo: string; workDate: string; dayShift: boolean; nightShift: boolean };
const text = (value: unknown) => value == null ? "" : String(value).trim();
const normalized = (value: unknown) => text(value).toLocaleUpperCase("tr-TR").replace(/\s+/g," ");
const marked = (value: unknown) => ["1","EVET","TRUE","X","✓","✔","G","N"].includes(normalized(value));
function columnDate(header: string) {
  const match = header.match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(GÜNDÜZ|GECE)$/i);
  if (match) return {date:`${match[3]}-${match[2]}-${match[1]}`,shift:match[4].toLocaleUpperCase("tr-TR") === "GÜNDÜZ" ? "day" : "night"};
  const iso = header.match(/^(\d{4}-\d{2}-\d{2})\s+(GÜNDÜZ|GECE)$/i);
  return iso ? {date:iso[1],shift:iso[2].toLocaleUpperCase("tr-TR") === "GÜNDÜZ" ? "day" : "night"} : null;
}
export function parseDailyExcelRows(bytes: Uint8Array, startDate: string, endDate: string) {
  if (!bytes.length || bytes.length > 3_000_000) throw new Error("Excel dosyası boş veya 3 MB sınırını aşıyor.");
  const book = XLSX.read(bytes,{type:"array",cellDates:false});
  const sheet = book.Sheets[book.SheetNames[0]];
  if (!sheet) throw new Error("Excel sayfası okunamadı.");
  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet,{defval:"",raw:false});
  if (!rows.length || rows.length > 2500) throw new Error("Excel en fazla 2500 personel satırı içerebilir.");
  const headers = Object.keys(rows[0]);
  const dates = headers.map((header)=>({header,...(columnDate(header)||{})})).filter((item)=>item.date && item.shift);
  if (!dates.length) throw new Error("Excel'de tarihli Gündüz/Gece sütunları bulunamadı.");
  const nameKey = headers.find((item)=>normalized(item)==="PERSONEL");
  const idKey = headers.find((item)=>normalized(item)==="PERSONEL NO");
  if (!nameKey && !idKey) throw new Error("Personel veya Personel No sütunu zorunludur.");
  const selected = new Map<string, DailyExcelShift>();
  for (const row of rows) {
    const name = text(nameKey ? row[nameKey] : "");
    const personnelNo = text(idKey ? row[idKey] : "");
    if (normalized(name)==="GENEL TOPLAM" || (!name && !personnelNo)) continue;
    for (const item of dates) {
      const date = String(item.date);
      if (date < startDate || date > endDate) continue;
      const cell = row[item.header];
      if (!marked(cell)) continue;
      const key = `${normalized(personnelNo||name)}|${date}`;
      const record = selected.get(key) || {name,personnelNo,workDate:date,dayShift:false,nightShift:false};
      if (item.shift === "day") record.dayShift=true;
      else record.nightShift=true;
      selected.set(key,record);
    }
  }
  if (!selected.size) throw new Error("Seçili dönemde işaretlenmiş gündüz veya gece vardiyası bulunamadı.");
  return [...selected.values()];
}
