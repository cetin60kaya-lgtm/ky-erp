// Kullanıcı izinli 10 İmalat alanı haricindeki hiçbir Excel sütununu aktarmaz.
const HEADER_MAP = {
  "model adı": "modelName", "model adi": "modelName",
  "tarih": "date", "adet": "quantity", "vardiya": "shift",
  "makina no": "machineNo", "makine no": "machineNo",
  "zemin": "ground", "zemin renk": "ground",
  "baskı bölgesi": "printRegion", "baski bolgesi": "printRegion",
  "baskı sakatı": "printDefectQty", "baski sakati": "printDefectQty",
  "kumaş sakatı": "fabricDefectQty", "kumas sakati": "fabricDefectQty",
  "makinacı": "operatorName", "makinaci": "operatorName",
};
const REQUIRED = ["modelName", "date", "quantity"];
export const HISTORY_COLUMNS = ["modelName", "date", "quantity", "shift", "machineNo", "ground", "printRegion", "printDefectQty", "fabricDefectQty", "operatorName"];

function cells(csv) {
  const rows = [];
  let row = [], value = "", quoted = false;
  const text = String(csv || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(value); value = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((v) => v.trim())) rows.push(row);
      row = []; value = "";
    } else value += ch;
  }
  row.push(value);
  if (row.some((v) => v.trim())) rows.push(row);
  if (quoted) throw Error("CSV tırnak işaretleri tamamlanmamış.");
  return rows;
}
function numberValue(value, fallback = NaN) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return fallback;
  const normalized = trimmed.includes(",") && trimmed.includes(".") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}
export function parseProductionHistoryCsv(text, options = {}) {
  const grid = cells(text);
  if (!grid.length) throw Error("CSV boş.");
  const headers = grid[0].map((v) => HEADER_MAP[v.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ")] || "");
  for (const key of REQUIRED) if (!headers.includes(key)) throw Error("CSV içinde Model Adı, Tarih ve Adet sütunları zorunlu.");
  const startDate = options.startDate || "";
  const endDate = options.endDate || "";
  const rows = [], rejected = [];
  for (let i = 1; i < grid.length; i++) {
    const raw = Object.fromEntries(HISTORY_COLUMNS.map((key) => [key, ""]));
    grid[i].forEach((value, index) => {
      const key = headers[index];
      if (key && Object.prototype.hasOwnProperty.call(raw, key)) raw[key] = String(value ?? "").trim();
    });
    const date = raw.date;
    const quantity = numberValue(raw.quantity);
    const printDefectQty = numberValue(raw.printDefectQty, 0);
    const fabricDefectQty = numberValue(raw.fabricDefectQty, 0);
    const clientId = String(i + 1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
      !raw.modelName || !Number.isFinite(quantity) || quantity <= 0 ||
      ![printDefectQty, fabricDefectQty].every((n) => Number.isFinite(n) && n >= 0) ||
      printDefectQty + fabricDefectQty > quantity) {
      rejected.push({ clientId, reason: "Eksik model/tarih/adet veya geçersiz sakat miktarı" }); continue;
    }
    if ((startDate && date < startDate) || (endDate && date > endDate)) {
      rejected.push({ clientId, reason: "Seçilen 6 aylık dönem dışında" }); continue;
    }
    rows.push({
      clientId, modelName: raw.modelName, date, quantity,
      shift: raw.shift, machineNo: raw.machineNo, ground: raw.ground,
      printRegion: raw.printRegion, printDefectQty, fabricDefectQty,
      operatorName: raw.operatorName,
    });
  }
  return { rows, rejected, inputCount: grid.length - 1 };
}
