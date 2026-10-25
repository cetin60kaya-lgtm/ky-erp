// Excel'in sekmeli metin dosyası (TSV) biçimidir; gerçek XLS ikilisi diye sunulmaz.
export function imalatReportTsv(headers, rows) {
  const safeCell = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
    const plain = String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
    return /^[=+@-]/.test(plain) ? "'" + plain : plain;
  };
  return "\ufeff" + [headers.map((header) => safeCell(header.label)).join("\t"), ...rows.map(
    (row) => headers.map((header) => safeCell(row[header.key])).join("\t"),
  )].join("\r\n");
}
