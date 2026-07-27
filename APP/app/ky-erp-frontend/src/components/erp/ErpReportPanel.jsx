import { handleExportReport, handlePrintReport } from "../../utils/erpWorkflow";

export default function ErpReportPanel({ title = "Rapor Çıktısı", rows = [], summary = [] }) {
  return (
    <section className="content-card erp-report-panel">
      <div className="section-header">
        <div>
          <h3>{title}</h3>
          <p>Haftalık, aylık ve dönemsel çıktı için hazır rapor görünümü.</p>
        </div>
        <div className="action-bar">
          <button className="soft-btn" type="button" onClick={handlePrintReport}>
            Yazdır
          </button>
          <button className="soft-btn" type="button" onClick={() => handleExportReport("ky-erp-rapor.csv", rows)}>
            Excel
          </button>
        </div>
      </div>
      <div className="erp-report-summary">
        {summary.map((item) => (
          <div key={item?.label}>
            <span>{item?.label}</span>
            <strong>{item?.value}</strong>
          </div>
        ))}
      </div>
      <div className="erp-report-print-area">
        {rows.map((row) => (
          <div className="erp-report-row" key={row?.id || row?.title}>
            <strong>{row?.title || row?.name || row?.model || row?.personel || "-"}</strong>
            <span>{row?.status || row?.durum || row?.nextAction || "-"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
