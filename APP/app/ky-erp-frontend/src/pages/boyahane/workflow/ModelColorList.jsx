import { useMemo, useState } from "react";
import { COLOR_STATUS, formatKg, statusTone } from "./boyahaneFormat";

function sourceTypeOf(row) {
  return row?.sourceType || row?.colorSource || (row?.pantone ? "PANTONE" : "VISUAL");
}

function sourceText(row) {
  const sourceType = sourceTypeOf(row);
  if (sourceType === "REFERENCE") return `Referansa göre${row.referenceName || row.referenceCode ? ` · ${row.referenceName || row.referenceCode}` : ""}`;
  if (sourceType === "VISUAL") return `Görsel/RGB${row.colorHex ? ` · ${row.colorHex}` : ""}`;
  return "Pantoneye göre";
}

function effectiveStatus(row) {
  if (String(row.status).toUpperCase() === "COMPLETED" && !row.recipeId) return "RECIPE_MISSING";
  return row.status;
}

export default function ModelColorList({ colors, selectedId, onSelect, onAdd, onDelete }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [paintType, setPaintType] = useState("");
  const paintTypes = useMemo(() => [...new Set(colors.map((row) => row.paintType).filter(Boolean))], [colors]);
  const filtered = colors.filter((row) => {
    const text = `${row.colorName || ""} ${row.pantone || ""} ${row.basePantone || ""} ${row.referenceName || ""} ${row.referenceCode || ""} ${row.colorFamily || ""}`.toLocaleLowerCase("tr-TR");
    const rowStatus = effectiveStatus(row);
    return (!query || text.includes(query.toLocaleLowerCase("tr-TR"))) && (!status || rowStatus === status) && (!paintType || row.paintType === paintType);
  });
  return (
    <aside className="bh-card bh-color-sidebar">
      <div className="bh-card-head"><div><h2>Model Renkleri</h2><small>{colors.length} renk</small></div></div>
      <div className="bh-card-body">
        <div className="bh-form-grid">
          <label className="bh-field"><span>Renk, Pantone veya referans ara</span><input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="bh-form-grid two"><label className="bh-field"><span>Durum</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tümü</option>{Object.entries(COLOR_STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="RECIPE_MISSING">Reçete Eksik</option></select></label><label className="bh-field"><span>Boya türü</span><select value={paintType} onChange={(event) => setPaintType(event.target.value)}><option value="">Tümü</option>{paintTypes.map((item) => <option key={item}>{item}</option>)}</select></label></div>
        </div>
        <div className="bh-color-actions">
          <button className="bh-btn primary" onClick={onAdd}>+ Renk Ekle</button>
          <button className="bh-btn danger" onClick={onDelete} disabled={!selectedId}>Renk Sil</button>
        </div>
        <div className="bh-list bh-work-color-list">
          {filtered.map((color) => {
            const rowStatus = effectiveStatus(color);
            return (
              <button key={color.id} className={color.id === selectedId ? "active" : ""} onClick={() => onSelect(color.id)}>
                <span className="bh-color-row-title"><i className="bh-swatch tiny" style={{ background: color?.raw?.hex || color?.colorHex || "#cbd5e1" }} /><strong>{color.colorName || "Tanımsız renk"}</strong></span>
                <span>{color.pantone || color.basePantone || color.colorHex || "Pantone yok"} • {color.paintType || "Boya türü yok"}</span>
                <span className={`bh-color-source-inline ${sourceTypeOf(color).toLowerCase()}`}>{sourceText(color)}</span>
                <span>{color.printRegion || "Baskı bölgesi yok"} • Plan {formatKg(color.plannedKg)}</span>
                <span><em className={`bh-status ${rowStatus === "RECIPE_MISSING" ? "orange" : statusTone(rowStatus)}`}>{rowStatus === "RECIPE_MISSING" ? "Reçete Eksik" : COLOR_STATUS[rowStatus] || rowStatus}</em></span>
              </button>
            );
          })}
          {!colors.length ? <div className="bh-empty">Bu işe bağlı renk bulunamadı.</div> : null}
        </div>
      </div>
    </aside>
  );
}
