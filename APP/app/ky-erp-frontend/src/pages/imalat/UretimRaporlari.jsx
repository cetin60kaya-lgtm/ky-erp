import "../modules/cleanWorkflow.css";
import "./imalatWorkflow.css";
import { useEffect, useState } from "react";
import { useCallback } from "react";
import { ChartColumn, FileSpreadsheet, Search } from "lucide-react";
import { getImalatOperasyonRaporu } from "../../services/imalatApi";
import { Field, Status } from "./ImalatShared";
import { formatQty, toneForStatus } from "./imalatData";

const initialFilters = {
  baslangic: "",
  bitis: "",
  firma: "",
  model: "",
  makine: "",
  makinaci: "",
  vardiya: "",
  baskiBolgesi: "",
  durum: "",
};

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

export default function UretimRaporlari({ activeMainCompany }) {
  const [filters, setFilters] = useState(initialFilters);
  const [report, setReport] = useState({
    summary: {},
    machineRows: [],
    operatorRows: [],
    modelRows: [],
    rows: [],
  });
  const [message, setMessage] = useState("");

  const loadReport = useCallback(async function loadReport(nextFilters = filters) {
    try {
      const result = await getImalatOperasyonRaporu(activeMainCompany, nextFilters);
      setReport({
        summary: result?.summary || {},
        machineRows: Array.isArray(result?.machineRows) ? result?.machineRows : [],
        operatorRows: Array.isArray(result?.operatorRows) ? result?.operatorRows : [],
        modelRows: Array.isArray(result?.modelRows) ? result?.modelRows : [],
        rows: Array.isArray(result?.rows) ? result?.rows : [],
      });
      setMessage("");
    } catch (error) {
      setMessage(error?.message || "Üretim raporu okunamadı.");
    }
  }, [activeMainCompany, filters]);

  useEffect(() => {
    loadReport(initialFilters);
  }, [activeMainCompany?.slug, activeMainCompany?.id, loadReport]);

  return (
    <div className="iw-page">
      <div className="iw-card">
        <div className="iw-card-head">
          <div>
            <h2>
              <ChartColumn size={18} /> Üretim Raporu
            </h2>
            <small>Filtrelenmiş gerçek imalat operasyonlarından makine, makinacı ve model/bölge raporu.</small>
          </div>
          <button
            className="iw-btn"
            type="button"
            onClick={() =>
              exportRows(`uretim-raporu-${new Date().toISOString().slice(0, 10)}.xls`, reportHeaders(), report.rows)
            }
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
        </div>
        <div className="iw-card-body">
          <div className="toolbar report-filter-grid">
            <Field label="Tarih başlangıç">
              <input type="date" value={filters.baslangic} onChange={(e) => setFilters({ ...filters, baslangic: e.target.value })} />
            </Field>
            <Field label="Tarih bitiş">
              <input type="date" value={filters.bitis} onChange={(e) => setFilters({ ...filters, bitis: e.target.value })} />
            </Field>
            <Field label="Firma">
              <input value={filters.firma} onChange={(e) => setFilters({ ...filters, firma: e.target.value })} />
            </Field>
            <Field label="Model">
              <input value={filters.model} onChange={(e) => setFilters({ ...filters, model: e.target.value })} />
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
            <button className="iw-btn primary" type="button" onClick={() => loadReport(filters)}>
              <Search size={16} /> Raporla
            </button>
          </div>

          <div className="summary uretim-summary imalat-metric-grid">
            <Stat label="Tamamlanan Model Adedi" value={formatQty(report.summary.tamamlananModelAdedi)} />
            <Stat label="Bölge Operasyonu" value={formatQty(report.summary.bolgeOperasyonu)} />
            <Stat label="Aktif Makine" value={formatQty(report.summary.aktifMakine)} />
            <Stat label="Eksik Operasyon" value={formatQty(report.summary.eksikOperasyon)} tone="yellow" />
            <Stat label="Bugün Basılan Adet" value={formatQty(report.summary.bugunBasilanAdet)} tone="green" />
          </div>
        </div>
      </div>

      <div className="split uretim-entry-bottom">
        <ReportTable
          title="Makine Bazlı Üretim"
          headers={["Makine No", "Makine Adı", "Operasyon Adedi", "Tamamlanan Model", "Eksik"]}
          rows={report.machineRows}
          render={(row) => [
            row?.makineNo || "-",
            row?.makineAdi || "-",
            formatQty(row?.operasyonAdedi),
            formatQty(row?.tamamlananModelAdedi),
            formatQty(row?.eksik),
          ]}
        />
        <ReportTable
          title="Makinacı / Vardiya Bazlı Üretim"
          headers={["Makinacı", "Vardiya", "Basılan Bölge Adedi", "Tamamlanan Model"]}
          rows={report.operatorRows}
          render={(row) => [
            row?.makinaci || "-",
            row?.vardiya || "-",
            formatQty(row?.basilanBolgeAdedi || row?.operasyonAdedi),
            formatQty(row?.tamamlananModelAdedi),
          ]}
        />
      </div>

      <div className="iw-card">
        <div className="iw-card-head">
          <h2>Model / Baskı Bölgesi Bazlı Üretim</h2>
        </div>
        <div className="iw-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Görsel</th>
                <th>Model</th>
                <th>Firma</th>
                <th>Baskı Bölgesi</th>
                <th>Operasyon</th>
                <th>Tamamlanan Model Adedi</th>
                <th>Eksik</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {report.modelRows.length ? (
                report.modelRows.map((row) => (
                  <tr key={`${row?.model}-${row?.firma}-${row?.baskiBolgesi}`}>
                    <td>{row?.modelImageUrl ? <img className="smart-thumb" src={row.modelImageUrl} alt={row?.model || "Model görseli"} /> : "-"}</td>
                    <td>{row?.model}</td>
                    <td>{row?.firma}</td>
                    <td>{row?.baskiBolgesi}</td>
                    <td>{formatQty(row?.operasyonAdedi)}</td>
                    <td>{formatQty(row?.tamamlananModelAdedi)}</td>
                    <td>{formatQty(row?.eksik)}</td>
                    <td>
                      <Status tone={toneForStatus(row?.durum)}>{row?.durum}</Status>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>Raporlanacak üretim operasyonu bulunamadı.</td>
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

function ReportTable({ title, headers, rows, render }) {
  return (
    <div className="iw-card">
      <div className="iw-card-head">
        <h2>{title}</h2>
      </div>
      <div className="iw-table-wrap compact">
        <table>
          <thead>
            <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, rowIndex) => (
                <tr key={row?.id || row?.makineNo || `${row?.makinaci}-${row?.vardiya}-${rowIndex}`}>
                  {render(row).map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={headers.length}>Kayıt bulunamadı.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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

function reportHeaders() {
  return [
    { key: "tarih", label: "Tarih" },
    { key: "firma", label: "Firma" },
    { key: "model", label: "Model" },
    { key: "partiNo", label: "Parti" },
    { key: "baskiBolgesi", label: "Baskı Bölgesi" },
    { key: "basilan", label: "Basılan" },
    { key: "makineNo", label: "Makine No" },
    { key: "makineAdi", label: "Makine Adı" },
    { key: "vardiya", label: "Vardiya" },
    { key: "makinaci", label: "Makinacı" },
    { key: "durum", label: "Durum" },
  ];
}
