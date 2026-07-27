import { useEffect, useState } from "react";

export const fallbackSummary = {
  kesilenFaturaToplami: 0,
  gelenFaturaToplami: 0,
  yapilanIsToplami: 0,
  tahsilatToplami: 0,
  odemeToplami: 0,
  tahsilatBekleyen: 0,
  odemeBekleyen: 0,
  gelenKdv: 0,
  gidenKdv: 0,
  devredenKdv: 0,
  netKdv: 0,
  tahminiKar: 0,
  onayBekleyenBelge: 0,
  mailBekleyenFatura: 0,
  departmanYetkilisiEksik: 0,
  ekstreyeGirmeyen: 0,
};

export const emptyRows = {
  gunlukIsListesi: [],
  kesilenFaturalar: [],
  gelenFaturalar: [],
  yapilanIsler: [],
  yaklasanOdemeler: [],
};

export const reportTypes = [
  "Haftalık Yönetim Özeti",
  "Aylık Yönetim Özeti",
  "Cari Ekstre",
  "KDV Raporu",
  "Çek Listesi",
  "Mail / Departman Yetki Eksik Raporu",
  "Ekstreye Girmeyen Faturalar",
  "Çek Vade Raporu",
  "Mail Takip Raporu",
  "Kesilen Faturalar",
  "Gelen Faturalar",
  "Yapılan İşler / Üretim Raporu",
  "Tahmini Kar Raporu",
];

export function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload?.data;
  if (Array.isArray(payload?.items)) return payload?.items;
  if (Array.isArray(payload?.rows)) return payload?.rows;
  return [];
}

export function formatMoney(value) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let normalized = String(value ?? "")
    .replace(/[₺\s]/g, "")
    .replace(/[^0-9,.-]/g, "");
  const negative = normalized.startsWith("-");
  normalized = normalized.replace(/-/g, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);
  if (lastComma >= 0 && lastDot >= 0) {
    const integerPart = normalized.slice(0, decimalIndex).replace(/[,.]/g, "");
    const decimalPart = normalized.slice(decimalIndex + 1).replace(/[,.]/g, "");
    normalized = `${integerPart}.${decimalPart}`;
  } else if (lastComma >= 0) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (lastDot >= 0) {
    const after = normalized.slice(lastDot + 1);
    const dotCount = (normalized.match(/\./g) || []).length;
    normalized =
      dotCount === 1 && after.length <= 2
         ? normalized
        : normalized.replace(/\./g, "");
  }
  normalized = `${negative ? "-" : ""}${normalized}`;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatNumber(value) {
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function normalizeSummary(payload) {
  const source = payload?.summary || payload?.data.summary || payload || {};
  const merged = { ...fallbackSummary, ...source };
  merged.tahminiKar =
    Number(merged.kesilenFaturaToplami || 0) -
    Number(merged.gelenFaturaToplami || 0) -
    Number(merged.odemeToplami || 0);
  merged.netKdv =
    Number(merged.gidenKdv || 0) -
    Number(merged.gelenKdv || 0) -
    Number(merged.devredenKdv || 0);
  return merged;
}

export function field(row, keys, fallback = "-") {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") {
      return row[key];
    }
  }
  return fallback;
}

function safeCellValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) {
    const list = value
      .map((item) => safeCellValue(item))
      .filter((item) => item !== "-");
    return list.length ? list.join(", ") : "-";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return value;
}

export function Status({ children, tone = "blue" }) {
  return <span className={`mh-badge ${tone}`}>{children}</span>;
}

export function Kpi({ label, value, tone = "blue", money = true }) {
  return (
    <div className={`mh-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{money ? formatMoney(value) : formatNumber(value)}</strong>
    </div>
  );
}

export function DataTable({ columns, rows, empty = "Kayıt bulunamadı" }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return (
    <div className="mh-table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.length ? (
            safeRows.map((row, index) => (
              <tr key={row?.id || `${index}-${columns[0].key}`}>
                {columns.map((column) => (
                  <td key={column.key}>
                    {column.render
                       ? column.render(row, index)
                      : safeCellValue(field(row, [column.key]))}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function MoneyInput({ label, value, onValueChange, disabled = false }) {
  const [raw, setRaw] = useState(String(value ?? "0"));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setRaw(formatMoney(value));
  }, [value, focused]);

  return (
    <label className="mh-field">
      <span>{label}</span>
      <input
        inputMode="decimal"
        value={focused ? raw : formatMoney(value)}
        disabled={disabled}
        onFocus={() => {
          setFocused(true);
          setRaw(String(value ?? 0).replace(".", ","));
        }}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={() => {
          const parsed = parseMoney(raw);
          onValueChange(parsed);
          setFocused(false);
          setRaw(formatMoney(parsed));
        }}
      />
    </label>
  );
}
