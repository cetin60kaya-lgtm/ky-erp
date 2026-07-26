/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";
import { getBoyahaneReports, listBoyahaneProductions } from "../../../services/boyahaneWorkflowApi";
import { formatDate, formatKg, safeArray } from "./boyahaneFormat";
import ModelThumbnail from "./ModelThumbnail";

function useRecords(activeMainCompany) {
  const [productions, setProductions] = useState([]);
  const [report, setReport] = useState({ summary: {}, expenses: [], jobs: [] });
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    Promise.all([listBoyahaneProductions(activeMainCompany), getBoyahaneReports(activeMainCompany)])
      .then(([rows, data]) => { if (live) { setProductions(safeArray(rows)); setReport(data || { summary: {}, expenses: [], jobs: [] }); } })
      .catch((requestError) => live && setError(requestError.message));
    return () => { live = false; };
  }, [activeMainCompany?.slug]);
  return { productions, report, error };
}

export function UretimGecmisiPage({ activeMainCompany }) {
  const { productions, error } = useRecords(activeMainCompany);
  return <section className="bh-card"><div className="bh-card-head"><div><h2>Üretim Geçmişi</h2><small>Değişmez reçete ve lot snapshotları</small></div></div><div className="bh-card-body">
    {error ? <div className="bh-notice danger">{error}</div> : null}
    <div className="bh-table-wrap wide"><table><thead><tr><th>Görsel</th><th>Tarih</th><th>Model</th><th>Firma</th><th>Sipariş</th><th>Baskı</th><th>Pantone</th><th>Renk</th><th>Boya türü</th><th>Versiyon</th><th>Çarpan</th><th>KG</th><th>Kullanıcı</th></tr></thead><tbody>{productions.map((row) => <tr key={row.id}><td><ModelThumbnail src={row.imageUrl} alt={row.modelSnapshot} /></td><td>{formatDate(row.createdAt)}</td><td>{row.modelSnapshot}</td><td>{row.companySnapshot || "-"}</td><td>{row.orderSnapshot || "-"}</td><td>{row.printRegionSnapshot || "-"}</td><td>{row.pantoneSnapshot || "-"}</td><td>{row.colorNameSnapshot}</td><td>{row.paintTypeSnapshot}</td><td>{row.versionSnapshot}</td><td>{Number(row.multiplier || 0).toFixed(4)}</td><td>{formatKg(row.productionTotalKg)}</td><td>{row.createdBy || "-"}</td></tr>)}</tbody></table></div>
    {!productions.length ? <div className="bh-empty">Üretim kaydı yok.</div> : null}
  </div></section>;
}

export function BoyaGiderleriPage({ activeMainCompany }) {
  const { report, error } = useRecords(activeMainCompany);
  const expenses = safeArray(report.expenses);
  return <section className="bh-card"><div className="bh-card-head"><div><h2>Boya Giderleri</h2><small>Muhasebe model boya gideri kayıtları</small></div></div><div className="bh-card-body">
    {error ? <div className="bh-notice danger">{error}</div> : null}
    <div className="bh-kpi-row compact"><div className="bh-kpi"><span>Toplam tüketim</span><strong>{formatKg(report.summary?.totalExpenseKg)}</strong></div><div className="bh-kpi"><span>Gider satırı</span><strong>{expenses.length}</strong></div></div>
    <div className="bh-table-wrap wide"><table><thead><tr><th>Görsel</th><th>Tarih</th><th>Model / Sipariş bağlantısı</th><th>Ürün</th><th>Lot</th><th>Tüketim KG</th><th>Tahmini maliyet</th><th>Kaynak üretim</th><th>Not</th></tr></thead><tbody>{expenses.map((row) => <tr key={row.id}><td><ModelThumbnail src={row.imageUrl} alt={row.modelName} /></td><td>{formatDate(row.expenseDate)}</td><td>{row.modelName || row.modelOrderId || "-"}</td><td>{row.productName || "-"}</td><td>{row.lotNo || "-"}</td><td>{formatKg(row.amountKg)}</td><td>₺{Number(row.estimatedCost || 0).toLocaleString("tr-TR")}</td><td>{row.sourceProductionId || "-"}</td><td>{row.note || "-"}</td></tr>)}</tbody></table></div>
  </div></section>;
}

export function BoyahaneRaporlarPage({ activeMainCompany }) {
  const { productions, report, error } = useRecords(activeMainCompany);
  const summary = report.summary || {};
  return <div>{error ? <div className="bh-notice danger">{error}</div> : null}<div className="bh-kpi-row"><div className="bh-kpi"><span>Aktif İş</span><strong>{summary.activeJobs || 0}</strong></div><div className="bh-kpi"><span>Bekleyen İş</span><strong>{summary.waitingJobs || 0}</strong></div><div className="bh-kpi"><span>Hazırlanacak Renk</span><strong>{summary.pendingColors || 0}</strong></div><div className="bh-kpi"><span>Aktif Lot</span><strong>{summary.activeLots || 0}</strong></div><div className="bh-kpi"><span>Kalan Stok</span><strong>{formatKg(summary.remainingStockKg)}</strong></div></div>
    <section className="bh-card"><div className="bh-card-head"><div><h2>Boyahane Raporu</h2><small>Gerçek iş, üretim ve stok kayıtlarından</small></div></div><div className="bh-card-body"><div className="bh-table-wrap"><table><thead><tr><th>Görsel</th><th>Model</th><th>Firma</th><th>Baskı</th><th>Durum</th><th>Hazır renk</th><th>Bekleyen renk</th><th>Plan KG</th></tr></thead><tbody>{safeArray(report.jobs).map((row) => <tr key={row.id}><td><ModelThumbnail src={row.imageUrl} alt={row.modelName} /></td><td>{row.modelName}</td><td>{row.companyName || "-"}</td><td>{row.printRegion || "-"}</td><td>{row.status}</td><td>{row.preparedColorCount || 0}</td><td>{row.pendingColorCount || 0}</td><td>{formatKg(row.plannedPaintKg)}</td></tr>)}</tbody></table></div><p className="bh-report-foot">Toplam {productions.length} üretim snapshotı rapora dahil edildi.</p></div></section>
  </div>;
}
