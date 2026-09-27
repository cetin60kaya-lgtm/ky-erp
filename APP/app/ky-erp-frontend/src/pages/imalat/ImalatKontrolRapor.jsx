import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChartColumn,
  CircleAlert,
  CircleCheck,
  FileSpreadsheet,
  RotateCcw,
  Search,
} from "lucide-react";
import { getImalatDenetim, getImalatOperasyonRaporu } from "../../services/imalatApi";
import { Field, Status } from "./ImalatShared";
import { formatQty, toneForStatus } from "./imalatData";
import { loadModuleData, moduleLoadMessage } from "../../utils/resilientDataLoader";
import "../modules/cleanWorkflow.css";
import "./imalatWorkflow.css";

const initialFilters = {
  baslangic: "",
  bitis: "",
  firma: "",
  model: "",
  partiNo: "",
  makine: "",
  makinaci: "",
  vardiya: "",
  baskiBolgesi: "",
  durum: "",
};

function exportRows(fileName, headers, rows) {
  const lines = rows.map((row) => headers.map((header) => row[header.key] ?? "").join("\t"));
  const blob = new Blob(
    [[headers.map((header) => header.label).join("\t"), ...lines].join("\n")],
    { type: "application/vnd.ms-excel;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ImalatKontrolRapor({ activeMainCompany, initialView = "audit" }) {
  const [view, setView] = useState(initialView);
  const [filters, setFilters] = useState(initialFilters);
  const [audit, setAudit] = useState({ summary: {}, rows: [] });
  const [report, setReport] = useState({ summary: {}, machineRows: [], operatorRows: [], modelRows: [], rows: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadData = useCallback(async (nextFilters) => {
    setLoading(true);
    try {
      const tenant = activeMainCompany?.slug || activeMainCompany?.id || "main";
      const result = await loadModuleData({
        scope: `imalat:${tenant}:rapor:${JSON.stringify(nextFilters)}`,
        sources: {
          audit: { critical: true, load: () => getImalatDenetim(activeMainCompany, nextFilters) },
          report: { critical: true, load: () => getImalatOperasyonRaporu(activeMainCompany, nextFilters) },
        },
      });
      if (result.states.audit.status !== "error") {
        const auditResult = result.data.audit;
        setAudit({ summary: auditResult?.summary || {}, rows: Array.isArray(auditResult?.rows) ? auditResult.rows : [] });
      }
      if (result.states.report.status !== "error") {
        const reportResult = result.data.report;
        setReport({
          summary: reportResult?.summary || {},
          machineRows: Array.isArray(reportResult?.machineRows) ? reportResult.machineRows : [],
          operatorRows: Array.isArray(reportResult?.operatorRows) ? reportResult.operatorRows : [],
          modelRows: Array.isArray(reportResult?.modelRows) ? reportResult.modelRows : [],
          rows: Array.isArray(reportResult?.rows) ? reportResult.rows : [],
        });
      }
      setMessage(moduleLoadMessage(result, "İmalat denetim veya rapor ana kaynağı okunamadı; diğer başarılı sonuç korunuyor.", ""));
    } catch (error) {
      setMessage(error?.message || "İmalat denetim ve rapor verileri okunamadı.");
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadData(initialFilters), 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const metrics = useMemo(() => [
    ["Açık parti", audit.summary.acikParti || 0, ""],
    ["Kontrol gereken", audit.summary.kontrolGereken || 0, "red"],
    ["Eksik operasyon", report.summary.eksikOperasyon ?? audit.summary.eksikBolge ?? 0, "yellow"],
    ["Bugün basılan", report.summary.bugunBasilanAdet ?? audit.summary.bugunBasilanAdet ?? 0, "green"],
    ["Aktif makine", report.summary.aktifMakine || 0, ""],
    ["Tamamlanan model", report.summary.tamamlananModelAdedi || 0, "green"],
  ], [audit.summary, report.summary]);

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function resetFilters() {
    setFilters(initialFilters);
    loadData(initialFilters);
  }

  function exportCurrentView() {
    const date = new Date().toISOString().slice(0, 10);
    if (view === "audit") {
      exportRows(`imalat-denetim-${date}.xls`, auditHeaders(), audit.rows);
      return;
    }
    exportRows(`uretim-raporu-${date}.xls`, reportHeaders(), report.rows);
  }

  return (
    <div className="iw-page imalat-control-center">
      <section className="iw-card imalat-control-head">
        <div className="iw-card-head">
          <div>
            <h2><CircleCheck size={18} /> İmalat Denetim ve Rapor</h2>
            <small>Ortak filtrelerle üretim açıklarını denetleyin veya makine, vardiya ve model sonuçlarını inceleyin.</small>
          </div>
          <div className="imalat-control-actions">
            <label>
              <span>Görünüm</span>
              <select value={view} onChange={(event) => setView(event.target.value)}>
                <option value="audit">Operasyon denetimi</option>
                <option value="report">Üretim raporu ve analiz</option>
              </select>
            </label>
            <button className="iw-btn" type="button" onClick={exportCurrentView}><FileSpreadsheet size={16} /> Excel</button>
          </div>
        </div>

        <div className="iw-card-body">
          <div className="imalat-shared-filters">
            <Field label="Başlangıç"><input type="date" value={filters.baslangic} onChange={(event) => updateFilter("baslangic", event.target.value)} /></Field>
            <Field label="Bitiş"><input type="date" value={filters.bitis} onChange={(event) => updateFilter("bitis", event.target.value)} /></Field>
            <Field label="Firma"><input value={filters.firma} onChange={(event) => updateFilter("firma", event.target.value)} placeholder="Firma ara" /></Field>
            <Field label="Model"><input value={filters.model} onChange={(event) => updateFilter("model", event.target.value)} placeholder="Model ara" /></Field>
            <Field label="Makine"><input value={filters.makine} onChange={(event) => updateFilter("makine", event.target.value)} placeholder="No veya ad" /></Field>
            <Field label="Makinacı"><input value={filters.makinaci} onChange={(event) => updateFilter("makinaci", event.target.value)} placeholder="Makinacı ara" /></Field>
            <Field label="Vardiya"><select value={filters.vardiya} onChange={(event) => updateFilter("vardiya", event.target.value)}><option value="">Tümü</option><option>Gündüz</option><option>Gece</option></select></Field>
            <Field label="Baskı bölgesi"><input value={filters.baskiBolgesi} onChange={(event) => updateFilter("baskiBolgesi", event.target.value)} /></Field>
            <Field label="Durum"><select value={filters.durum} onChange={(event) => updateFilter("durum", event.target.value)}><option value="">Tümü</option><option>Tamam</option><option>Eksik Operasyon</option><option>Bekliyor</option><option>İptal</option><option>Kontrol Gerekli</option></select></Field>
            <div className="imalat-filter-buttons">
              <button className="iw-btn primary" type="button" disabled={loading} onClick={() => loadData(filters)}><Search size={16} /> {loading ? "Yükleniyor" : "Uygula"}</button>
              <button className="iw-btn" type="button" onClick={resetFilters}><RotateCcw size={15} /> Temizle</button>
            </div>
          </div>

          <div className="summary uretim-summary imalat-control-metrics">
            {metrics.map(([label, value, tone]) => <Stat key={label} label={label} value={formatQty(value)} tone={tone} />)}
          </div>
        </div>
      </section>

      {message ? <div className="iw-notice red"><CircleAlert size={16} /> {message}</div> : null}

      {view === "audit" ? <AuditTable rows={audit.rows} loading={loading} /> : <ReportAnalysis report={report} loading={loading} />}
    </div>
  );
}

function AuditTable({ rows, loading }) {
  return (
    <section className="iw-card">
      <div className="iw-card-head"><div><h2><CircleAlert size={18} /> Operasyon Denetim Listesi</h2><small>Eksik veya kontrol gerektiren satırlar durum rengiyle öne çıkarılır.</small></div><span className="iw-badge b-blue">{rows.length} satır</span></div>
      <div className="iw-table-wrap imalat-control-table">
        <table>
          <thead><tr><th>Görsel</th><th>Model / Firma</th><th>Parti</th><th>Baskı Bölgesi</th><th>Planlanan</th><th>Basılan</th><th>Eksik</th><th>Makine</th><th>Vardiya</th><th>Makinacı</th><th>Zemin</th><th>Durum</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row?.id || `${row?.model}-${row?.partiNo}-${row?.baskiBolgesi}`}>
                <td>{row?.modelImageUrl ? <img className="smart-thumb" src={row.modelImageUrl} alt={row?.model || "Model"} /> : "-"}</td>
                <td><strong>{row?.model || "-"}</strong><small className="imalat-cell-subtitle">{row?.firma || "Firma yok"}</small></td>
                <td>{row?.partiNo || "-"}</td><td>{row?.baskiBolgesi || "-"}</td><td>{formatQty(row?.planlanan)}</td><td>{formatQty(row?.basilan)}</td><td className={Number(row?.eksik || 0) > 0 ? "imalat-number-danger" : ""}>{formatQty(row?.eksik)}</td>
                <td>{[row?.makineNo, row?.makineAdi].filter(Boolean).join(" - ") || "-"}</td><td>{row?.vardiya || "-"}</td><td>{row?.makinaci || "-"}</td><td>{row?.zemin || "-"}</td><td><Status tone={toneForStatus(row?.durum)}>{row?.durum || "-"}</Status></td>
              </tr>
            )) : <tr><td colSpan={12}>{loading ? "Denetim verileri yükleniyor..." : "Filtreye uygun operasyon bulunamadı."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportAnalysis({ report, loading }) {
  return (
    <div className="imalat-report-analysis">
      <div className="split uretim-entry-bottom">
        <ReportTable title="Makine Bazlı Üretim" headers={["Makine", "Operasyon", "Tamamlanan", "Eksik"]} rows={report.machineRows} loading={loading} render={(row) => [[row?.makineNo, row?.makineAdi].filter(Boolean).join(" - ") || "-", formatQty(row?.operasyonAdedi), formatQty(row?.tamamlananModelAdedi), formatQty(row?.eksik)]} />
        <ReportTable title="Makinacı / Vardiya Performansı" headers={["Makinacı", "Vardiya", "Basılan Bölge", "Tamamlanan"]} rows={report.operatorRows} loading={loading} render={(row) => [row?.makinaci || "-", row?.vardiya || "-", formatQty(row?.basilanBolgeAdedi || row?.operasyonAdedi), formatQty(row?.tamamlananModelAdedi)]} />
      </div>
      <ReportTable title="Model / Baskı Bölgesi Analizi" headers={["Model", "Firma", "Baskı Bölgesi", "Operasyon", "Tamamlanan", "Eksik", "Durum"]} rows={report.modelRows} loading={loading} render={(row) => [row?.model || "-", row?.firma || "-", row?.baskiBolgesi || "-", formatQty(row?.operasyonAdedi), formatQty(row?.tamamlananModelAdedi), formatQty(row?.eksik), <Status key="status" tone={toneForStatus(row?.durum)}>{row?.durum || "-"}</Status>]} />
    </div>
  );
}

function ReportTable({ title, headers, rows, loading, render }) {
  return (
    <section className="iw-card">
      <div className="iw-card-head"><h2><ChartColumn size={17} /> {title}</h2><span className="iw-badge b-blue">{rows.length} kayıt</span></div>
      <div className="iw-table-wrap compact"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, rowIndex) => <tr key={row?.id || `${title}-${rowIndex}`}>{render(row).map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>) : <tr><td colSpan={headers.length}>{loading ? "Rapor hazırlanıyor..." : "Kayıt bulunamadı."}</td></tr>}</tbody></table></div>
    </section>
  );
}

function Stat({ label, value, tone = "" }) {
  return <div className={`stat ${tone}`}><span>{label}</span><b>{value}</b></div>;
}

function auditHeaders() {
  return [
    ["model", "Model"], ["firma", "Firma"], ["partiNo", "Parti"], ["baskiBolgesi", "Baskı Bölgesi"],
    ["planlanan", "Planlanan"], ["basilan", "Basılan"], ["eksik", "Eksik"], ["makineNo", "Makine No"],
    ["makineAdi", "Makine Adı"], ["vardiya", "Vardiya"], ["makinaci", "Makinacı"], ["zemin", "Zemin"], ["durum", "Durum"],
  ].map(([key, label]) => ({ key, label }));
}

function reportHeaders() {
  return [
    ["tarih", "Tarih"], ["firma", "Firma"], ["model", "Model"], ["partiNo", "Parti"], ["baskiBolgesi", "Baskı Bölgesi"],
    ["basilan", "Basılan"], ["makineNo", "Makine No"], ["makineAdi", "Makine Adı"], ["vardiya", "Vardiya"], ["makinaci", "Makinacı"], ["durum", "Durum"],
  ].map(([key, label]) => ({ key, label }));
}
