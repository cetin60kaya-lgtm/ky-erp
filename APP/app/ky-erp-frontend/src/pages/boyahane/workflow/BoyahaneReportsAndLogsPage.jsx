/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getBoyahaneReports,
  listBoyahaneJobs,
  listBoyahaneLogs,
  listBoyahaneLots,
  listBoyahaneProducts,
  listBoyahaneProductions,
} from "../../../services/boyahaneWorkflowApi";
import { formatDate, formatKg, safeArray } from "./boyahaneFormat";
import ModelThumbnail from "./ModelThumbnail";

const TABS = [
  ["summary", "Boyahane Özeti"],
  ["product-lot", "Ürün ve Lot Raporları"],
  ["model-color", "Model ve Renk Geçmişi"],
  ["logs", "İşlem Logları"],
];

function dateKey(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function csvCell(value) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

export default function BoyahaneReportsAndLogsPage({ activeMainCompany }) {
  const [tab, setTab] = useState("summary");
  const [jobs, setJobs] = useState([]);
  const [productions, setProductions] = useState([]);
  const [products, setProducts] = useState([]);
  const [lots, setLots] = useState([]);
  const [logs, setLogs] = useState([]);
  const [report, setReport] = useState({ summary: {}, expenses: [] });
  const [filters, setFilters] = useState({ query: "", user: "", startDate: "", endDate: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug) return;
    setLoading(true); setError("");
    try {
      const [jobRows, productionRows, productRows, lotRows, logRows, reportRow] = await Promise.all([
        listBoyahaneJobs(activeMainCompany),
        listBoyahaneProductions(activeMainCompany),
        listBoyahaneProducts(activeMainCompany),
        listBoyahaneLots(activeMainCompany),
        listBoyahaneLogs(activeMainCompany),
        getBoyahaneReports(activeMainCompany),
      ]);
      setJobs(safeArray(jobRows));
      setProductions(safeArray(productionRows));
      setProducts(safeArray(productRows));
      setLots(safeArray(lotRows));
      setLogs(safeArray(logRows));
      setReport(reportRow || { summary: {}, expenses: [] });
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [activeMainCompany?.slug]);

  useEffect(() => { load(); }, [activeMainCompany?.slug]);

  const q = filters.query.trim().toLocaleLowerCase("tr-TR");
  const within = (value) => {
    const key = dateKey(value);
    if (filters.startDate && key && key < filters.startDate) return false;
    if (filters.endDate && key && key > filters.endDate) return false;
    return true;
  };
  const filteredLogs = logs.filter((row) => {
    const text = [row.actor, row.description, row.action, row.actionType, row.entityType].join(" ").toLocaleLowerCase("tr-TR");
    return (!q || text.includes(q)) && (!filters.user || row.actor === filters.user) && within(row.createdAt);
  });
  const filteredProductions = productions.filter((row) => {
    const text = [row.modelSnapshot, row.modelName, row.companySnapshot, row.pantoneSnapshot, row.colorNameSnapshot, row.paintTypeSnapshot].join(" ").toLocaleLowerCase("tr-TR");
    return (!q || text.includes(q)) && within(row.createdAt);
  });
  const users = useMemo(() => [...new Set(logs.map((row) => row.actor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr-TR")), [logs]);

  const productUsage = useMemo(() => {
    const map = new Map(products.map((row) => [String(row.id), { ...row, usedKg: 0, sampleKg: 0, productionKg: 0, lots: [] }]));
    lots.forEach((lot) => {
      const id = String(lot.inventoryId || lot.productId || "");
      const row = map.get(id) || { id, productName: lot.productName || "Ürün", usedKg: 0, sampleKg: 0, productionKg: 0, lots: [] };
      row.usedKg += Number(lot.usedKg || 0);
      row.lots.push(lot);
      map.set(id, row);
    });
    productions.forEach((production) => safeArray(production.items || production.lines).forEach((line) => {
      const id = String(line.productId || line.inventoryId || "");
      if (!id) return;
      const row = map.get(id) || { id, productName: line.productNameSnapshot || line.productName || "Ürün", usedKg: 0, sampleKg: 0, productionKg: 0, lots: [] };
      const kg = Number(line.productionGram || line.usedGram || line.referenceGram || 0) / 1000;
      if (String(production.jobType).toUpperCase() === "SAMPLE") row.sampleKg += kg;
      else row.productionKg += kg;
      map.set(id, row);
    }));
    return [...map.values()].sort((a, b) => Number(b.usedKg || b.productionKg) - Number(a.usedKg || a.productionKg));
  }, [products, lots, productions]);

  const rfRows = useMemo(() => jobs.flatMap((job) => safeArray(job.colors).flatMap((color) => safeArray(color.rfUsage))), [jobs]);
  const summary = report?.summary || {};

  function exportCsv() {
    let headers = [];
    let rows = [];
    if (tab === "logs") {
      headers = ["Tarih", "Kullanıcı", "İşlem", "Açıklama", "Kayıt Türü"];
      rows = filteredLogs.map((row) => [formatDate(row.createdAt), row.actor, row.actionType || row.action, row.description, row.entityType]);
    } else if (tab === "product-lot") {
      headers = ["Ürün", "Numune KG", "İmalat KG", "Toplam Kullanılan KG", "Aktif Lot", "Kalan KG"];
      rows = productUsage.map((row) => [row.productName, row.sampleKg, row.productionKg, row.usedKg, row.lots.filter((lot) => Number(lot.remainingKg || 0) > 0).length, row.lots.reduce((sum, lot) => sum + Number(lot.remainingKg || 0), 0)]);
    } else {
      headers = ["Tarih", "Model", "Firma", "Renk", "Pantone", "Boya Türü", "Versiyon", "KG", "İş Türü"];
      rows = filteredProductions.map((row) => [formatDate(row.createdAt), row.modelSnapshot || row.modelName, row.companySnapshot, row.colorNameSnapshot || row.colorName, row.pantoneSnapshot, row.paintTypeSnapshot, row.versionSnapshot, row.productionTotalKg, row.jobType]);
    }
    const csv = `\ufeff${[headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `boyahane-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bh-reports-hub">
      <section className="bh-operation-intro"><div><small>RAPORLAR VE İŞLEM LOGLARI</small><h2>Boyahane Denetim Merkezi</h2><p>Model, renk, ürün, lot, numune, imalat, RF ve kullanıcı hareketleri aynı tarih filtresinden denetlenir.</p></div><div className="bh-head-actions"><button type="button" className="bh-btn" onClick={exportCsv}>Excel / CSV</button><button type="button" className="bh-btn" onClick={() => window.print()}>Yazdır / PDF</button></div></section>

      <nav className="bh-operation-tabs reports">{TABS.map(([key, label]) => <button type="button" key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</nav>
      <section className="bh-report-filters"><label><span>Arama</span><input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Model, ürün, renk veya işlem ara" /></label><label><span>Başlangıç</span><input type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} /></label><label><span>Bitiş</span><input type="date" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} /></label><label><span>Kullanıcı</span><select value={filters.user} onChange={(event) => setFilters((current) => ({ ...current, user: event.target.value }))}><option value="">Tümü</option>{users.map((user) => <option key={user}>{user}</option>)}</select></label><button type="button" className="bh-btn" onClick={() => setFilters({ query: "", user: "", startDate: "", endDate: "" })}>Temizle</button></section>
      {error ? <div className="bh-notice danger">{error}</div> : null}
      {loading ? <div className="bh-empty large">Raporlar hazırlanıyor…</div> : null}

      {tab === "summary" ? <><div className="bh-command-kpis"><article><span>Numune sayısı</span><strong>{summary.sampleCount ?? productions.filter((row) => String(row.jobType).toUpperCase() === "SAMPLE").length}</strong><small>Fiziksel hazırlama</small></article><article><span>Onaylanan renk</span><strong>{summary.approvedColorCount ?? productions.filter((row) => row.recipeId).length}</strong><small>Versiyon geçmişi korunur</small></article><article><span>İmalat boyası</span><strong>{summary.productionCount ?? productions.filter((row) => String(row.jobType).toUpperCase() !== "SAMPLE").length}</strong><small>{formatKg(summary.preparedKg || productions.reduce((sum, row) => sum + Number(row.productionTotalKg || 0), 0))}</small></article><article><span>İmalat bekleyen</span><strong>{jobs.filter((row) => row.colors?.length && row.colors.every((color) => ["COMPLETED", "CANCELLED"].includes(String(color.status).toUpperCase())) && !row.enteredProductionAt && row.status !== "COMPLETED").length}</strong><small>Kg tekrar sorulmaz</small></article><article><span>RF</span><strong>{formatKg(rfRows.reduce((sum, row) => sum + Number(row.usedKg || 0), 0))}</strong><small>{rfRows.reduce((sum, row) => sum + Number(row.tlValue || 0), 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</small></article><article><span>Fire / Sayım farkı</span><strong>{formatKg(summary.fireKg || summary.adjustmentKg || 0)}</strong><small>Ters hareketler dahil</small></article></div>
        <div className="bh-dashboard-two-column"><section className="bh-card"><div className="bh-card-head"><div><h2>Son Hazırlamalar</h2><small>Numune ve imalat ayrımı</small></div></div><div className="bh-card-body"><div className="bh-table-wrap"><table><thead><tr><th>Tarih</th><th>Model</th><th>Renk</th><th>Tür</th><th>KG</th></tr></thead><tbody>{filteredProductions.slice(0, 20).map((row) => <tr key={row.id}><td>{formatDate(row.createdAt)}</td><td>{row.modelSnapshot || row.modelName || "-"}</td><td>{row.pantoneSnapshot || row.colorNameSnapshot || "-"}</td><td>{row.jobType || "PRODUCTION"}</td><td>{formatKg(row.productionTotalKg)}</td></tr>)}</tbody></table></div></div></section><section className="bh-card"><div className="bh-card-head"><div><h2>RF Tasarrufları</h2><small>Bileşenler ikinci kez stoktan düşmez</small></div></div><div className="bh-card-body"><div className="bh-table-wrap"><table><thead><tr><th>Tarih</th><th>Kaynak</th><th>Kullanılan model</th><th>KG</th><th>TL</th><th>Durum</th></tr></thead><tbody>{rfRows.map((row) => <tr key={row.id}><td>{formatDate(row.createdAt)}</td><td>{row.sourceModelName || "-"}</td><td>{row.targetModelName || "-"}</td><td>{formatKg(row.usedKg)}</td><td>{Number(row.tlValue || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</td><td>{row.status === "BITTI" ? "Bitti" : "RF"}</td></tr>)}</tbody></table></div>{!rfRows.length ? <div className="bh-empty">RF kaydı yok.</div> : null}</div></section></div></> : null}

      {tab === "product-lot" ? <section className="bh-card"><div className="bh-card-head"><div><h2>Ürün ve Lot Kullanımı</h2><small>Numune ve imalat ayrı toplamlar</small></div></div><div className="bh-card-body"><div className="bh-table-wrap wide"><table><thead><tr><th>Ürün</th><th>Tür</th><th>Numune</th><th>İmalat</th><th>Lot kullanımı</th><th>Aktif lot</th><th>Kalan</th><th>Kullanıldığı modeller</th></tr></thead><tbody>{productUsage.map((row) => <tr key={row.id}><td><strong>{row.productName}</strong></td><td>{row.dyeType || "-"}</td><td>{formatKg(row.sampleKg)}</td><td>{formatKg(row.productionKg)}</td><td>{formatKg(row.usedKg)}</td><td>{row.lots.filter((lot) => Number(lot.remainingKg || 0) > 0).length}</td><td>{formatKg(row.lots.reduce((sum, lot) => sum + Number(lot.remainingKg || 0), 0))}</td><td>{safeArray(row.usedModels).join(", ") || "Detay hareketlerinde"}</td></tr>)}</tbody></table></div></div></section> : null}

      {tab === "model-color" ? <section className="bh-model-history-grid">{filteredProductions.map((row) => <article key={row.id}><ModelThumbnail src={row.imageUrl} alt={row.modelSnapshot || row.modelName} /><div><h3>{row.modelSnapshot || row.modelName || "Model"}</h3><p>{row.companySnapshot || "-"}</p><dl><div><dt>Renk</dt><dd>{row.colorNameSnapshot || row.colorName || "-"}</dd></div><div><dt>Pantone</dt><dd>{row.pantoneSnapshot || "-"}</dd></div><div><dt>Boya türü</dt><dd>{row.paintTypeSnapshot || "-"}</dd></div><div><dt>Versiyon</dt><dd>{row.versionSnapshot || "-"}</dd></div><div><dt>Gramaj</dt><dd>{formatKg(row.productionTotalKg)}</dd></div><div><dt>Tarih</dt><dd>{formatDate(row.createdAt)}</dd></div></dl></div></article>)}</section> : null}

      {tab === "logs" ? <section className="bh-card"><div className="bh-card-head"><div><h2>İşlem Logları</h2><small>Silme yok; iptal ve düzeltme yeni log oluşturur.</small></div></div><div className="bh-card-body"><div className="bh-table-wrap wide"><table><thead><tr><th>Tarih-saat</th><th>Kullanıcı</th><th>İşlem</th><th>Açıklama</th><th>Kayıt türü</th><th>Kayıt kimliği</th></tr></thead><tbody>{filteredLogs.map((row) => <tr key={row.id}><td>{formatDate(row.createdAt)}</td><td>{row.actor || "KY ERP"}</td><td>{row.actionType || row.action}</td><td>{row.description || "-"}</td><td>{row.entityType || "-"}</td><td>{row.entityId || "-"}</td></tr>)}</tbody></table></div>{!filteredLogs.length ? <div className="bh-empty">Filtreye uygun işlem logu yok.</div> : null}</div></section> : null}
    </div>
  );
}
