import "../modules/cleanWorkflow.css";
import "./imalatWorkflow.css";
import { useEffect, useState } from "react";
import { useCallback } from "react";
import { CircleAlert, CircleCheck, FileSpreadsheet, Search } from "lucide-react";
import { getImalatDenetim } from "../../services/imalatApi";
import { Field, Status } from "./ImalatShared";
import { formatQty, toneForStatus } from "./imalatData";

function exportRows(fileName, headers, rows) {
  const body = rows.map((row) =>
    headers.map((item) => row[item?.key] ?? "").join("\t"),
  );
  const blob = new Blob(
    [[headers.map((item) => item?.label).join("\t"), ...body].join("\n")],
    { type: "application/vnd.ms-excel;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link?.click();
  URL.revokeObjectURL(url);
}

const initialFilters = {
  baslangic: "",
  bitis: "",
  model: "",
  firma: "",
  partiNo: "",
  makine: "",
  makinaci: "",
  vardiya: "",
  baskiBolgesi: "",
  durum: "",
};

export default function UretimDenetim({ activeMainCompany }) {
  const [filters, setFilters] = useState(initialFilters);
  const [summary, setSummary] = useState({});
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState("");

  const loadData = useCallback(async function loadData(nextFilters = filters) {
    try {
      const result = await getImalatDenetim(activeMainCompany, nextFilters);
      setSummary(result?.summary || {});
      setRows(Array.isArray(result?.rows) ? result?.rows : []);
      setMessage("");
    } catch (error) {
      setMessage(error?.message || "İmalat denetim verisi yüklenemedi.");
    }
  }, [activeMainCompany, filters]);

  useEffect(() => {
    loadData(initialFilters);
  }, [activeMainCompany?.slug, activeMainCompany?.id, loadData]);

  return (
    <div className="iw-page">
      <div className="iw-card">
        <div className="iw-card-head">
          <div>
            <h2>
              <CircleAlert size={18} /> İmalat Denetim
            </h2>
            <small>Parti, baskı bölgesi, makine, vardiya ve makinacı bazlı operasyon kontrolü.</small>
          </div>
          <button
            className="iw-btn"
            type="button"
            onClick={() =>
              exportRows(`imalat-denetim-${new Date().toISOString().slice(0, 10)}.xls`, auditHeaders(), rows)
            }
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
        </div>
        <div className="iw-card-body">
          <div className="toolbar uretim-filterbar report-filter-grid">
            <Field label="Tarih başlangıç">
              <input type="date" value={filters.baslangic} onChange={(e) => setFilters({ ...filters, baslangic: e.target.value })} />
            </Field>
            <Field label="Tarih bitiş">
              <input type="date" value={filters.bitis} onChange={(e) => setFilters({ ...filters, bitis: e.target.value })} />
            </Field>
            <Field label="Model">
              <input value={filters.model} onChange={(e) => setFilters({ ...filters, model: e.target.value })} />
            </Field>
            <Field label="Firma">
              <input value={filters.firma} onChange={(e) => setFilters({ ...filters, firma: e.target.value })} />
            </Field>
            <Field label="Parti no">
              <input value={filters.partiNo} onChange={(e) => setFilters({ ...filters, partiNo: e.target.value })} />
            </Field>
            <Field label="Makine">
              <input value={filters.makine} onChange={(e) => setFilters({ ...filters, makine: e.target.value })} />
            </Field>
            <Field label="Makinacı">
              <input value={filters.makinaci} onChange={(e) => setFilters({ ...filters, makinaci: e.target.value })} />
            </Field>
            <Field label="Vardiya">
              <select value={filters.vardiya} onChange={(e) => setFilters({ ...filters, vardiya: e.target.value })}>
                <option value="">Tümü</option>
                <option>Gündüz</option>
                <option>Gece</option>
              </select>
            </Field>
            <Field label="Baskı bölgesi">
              <input value={filters.baskiBolgesi} onChange={(e) => setFilters({ ...filters, baskiBolgesi: e.target.value })} />
            </Field>
            <Field label="Durum">
              <select value={filters.durum} onChange={(e) => setFilters({ ...filters, durum: e.target.value })}>
                <option value="">Tümü</option>
                <option>Tamam</option>
                <option>Eksik Operasyon</option>
                <option>Bekliyor</option>
                <option>İptal</option>
                <option>Kontrol Gerekli</option>
              </select>
            </Field>
            <button className="iw-btn primary" type="button" onClick={() => loadData(filters)}>
              <Search size={16} /> Filtrele
            </button>
          </div>

          <div className="summary uretim-summary imalat-metric-grid">
            <Stat label="Açık Parti" value={formatQty(summary.acikParti)} />
            <Stat label="Eksik Bölge" value={formatQty(summary.eksikBolge)} tone="yellow" />
            <Stat label="Tamamlanan Parti" value={formatQty(summary.tamamlananParti)} tone="green" />
            <Stat label="Bugün Basılan Adet" value={formatQty(summary.bugunBasilanAdet)} />
            <Stat label="Kontrol Gereken" value={formatQty(summary.kontrolGereken)} tone="red" />
          </div>
        </div>
      </div>

      <div className="iw-card">
        <div className="iw-card-head">
          <h2>
            <CircleCheck size={18} /> Operasyon Denetim Tablosu
          </h2>
        </div>
        <div className="iw-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Görsel</th>
                <th>Model</th>
                <th>Firma</th>
                <th>Parti</th>
                <th>Baskı Bölgesi</th>
                <th>Planlanan</th>
                <th>Basılan</th>
                <th>Eksik</th>
                <th>Makine</th>
                <th>Vardiya</th>
                <th>Makinacı</th>
                <th>Zemin</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row?.id || `${row?.model}-${row?.partiNo}-${row?.baskiBolgesi}`}>
                    <td>{row?.modelImageUrl ? <img className="smart-thumb" src={row.modelImageUrl} alt={row?.model || "Model görseli"} /> : "-"}</td>
                    <td>{row?.model || "-"}</td>
                    <td>{row?.firma || "-"}</td>
                    <td>{row?.partiNo || "-"}</td>
                    <td>{row?.baskiBolgesi || "-"}</td>
                    <td>{formatQty(row?.planlanan)}</td>
                    <td>{formatQty(row?.basilan)}</td>
                    <td>{formatQty(row?.eksik)}</td>
                    <td>{[row?.makineNo, row?.makineAdi].filter(Boolean).join(" - ") || "-"}</td>
                    <td>{row?.vardiya || "-"}</td>
                    <td>{row?.makinaci || "-"}</td>
                    <td>{row?.zemin || "-"}</td>
                    <td>
                      <Status tone={toneForStatus(row?.durum)}>{row?.durum}</Status>
                    </td>
                    <td>
                      <span className="iw-badge b-blue">Model Takip: üretim özeti</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={13}>Filtreye uygun imalat operasyonu bulunamadı.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {message ? <div className="iw-notice">{message}</div> : null}
    </div>
  );
}

function Stat({ label, value, tone = "" }) {
  return (
    <div className={`stat ${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function auditHeaders() {
  return [
    { key: "model", label: "Model" },
    { key: "firma", label: "Firma" },
    { key: "partiNo", label: "Parti" },
    { key: "baskiBolgesi", label: "Baskı Bölgesi" },
    { key: "planlanan", label: "Planlanan" },
    { key: "basilan", label: "Basılan" },
    { key: "eksik", label: "Eksik" },
    { key: "makineNo", label: "Makine No" },
    { key: "makineAdi", label: "Makine Adı" },
    { key: "vardiya", label: "Vardiya" },
    { key: "makinaci", label: "Makinacı" },
    { key: "zemin", label: "Zemin" },
    { key: "durum", label: "Durum" },
  ];
}
