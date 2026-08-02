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
  ["samples", "Numune Raporu"],
  ["productions", "İmalat Boyaları"],
  ["expenses", "Boya Giderleri"],
  ["product-lot", "Ürün ve Lot Raporları"],
  ["model-color", "Model ve Renk Geçmişi"],
  ["rf", "RF Raporu"],
  ["logs", "İşlem Logları"],
];

function dateKey(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(name, headers, rows) {
  const csv = `\ufeff${[headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function jobType(row) {
  const value = String(row?.jobType || row?.workflowType || row?.type || "PRODUCTION").toUpperCase();
  return ["SAMPLE", "TRIAL"].includes(value) ? "SAMPLE" : "PRODUCTION";
}

export default function BoyahaneReportsAndLogsPage({ activeMainCompany }) {
  const [tab, setTab] = useState("summary");
  const [jobs, setJobs] = useState([]);
  const [productions, setProductions] = useState([]);
  const [products, setProducts] = useState([]);
  const [lots, setLots] = useState([]);
  const [logs, setLogs] = useState([]);
  const [report, setReport] = useState({ summary: {}, expenses: [] });
  const [filters, setFilters] = useState({
    query: "",
    user: "",
    startDate: "",
    endDate: "",
    model: "",
    color: "",
    product: "",
    operationType: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug) return;
    setLoading(true);
    setError("");
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
    } catch (requestError) {
      console.error("Boyahane reports load failed", requestError);
      setError("Boyahane raporları alınamadı. Bağlantıyı kontrol edip yeniden deneyin.");
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany?.slug]);

  useEffect(() => { load(); }, [activeMainCompany?.slug]);

  const within = (value) => {
    const key = dateKey(value);
    if (filters.startDate && key && key < filters.startDate) return false;
    if (filters.endDate && key && key > filters.endDate) return false;
    return true;
  };
  const includes = (value, query) => !query || String(value || "").toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"));
  const q = filters.query.trim();

  const filteredProductions = useMemo(
    () => productions.filter((row) => {
      const model = row.modelSnapshot || row.modelName;
      const color = `${row.colorNameSnapshot || row.colorName || ""} ${row.pantoneSnapshot || row.pantone || ""}`;
      const all = [model, color, row.companySnapshot, row.paintTypeSnapshot, row.versionSnapshot, row.actor].join(" ");
      return within(row.createdAt) && includes(all, q) && includes(model, filters.model) && includes(color, filters.color) && (!filters.operationType || jobType(row) === filters.operationType);
    }),
    [productions, filters],
  );

  const filteredLogs = useMemo(
    () => logs.filter((row) => {
      const all = [row.actor, row.description, row.action, row.actionType, row.entityType, row.modelName, row.productName].join(" ");
      return within(row.createdAt) && includes(all, q) && (!filters.user || row.actor === filters.user) && (!filters.operationType || includes(`${row.actionType} ${row.entityType}`, filters.operationType));
    }),
    [logs, filters],
  );

  const filteredLots = useMemo(
    () => lots.filter((row) => {
      const all = [row.productName, row.lotNo, row.supplierName, row.invoiceNo, row.status, safeArray(row.usedModels).join(" ")].join(" ");
      return within(row.entryDate || row.createdAt) && includes(all, q) && includes(row.productName, filters.product) && includes(safeArray(row.usedModels).join(" "), filters.model);
    }),
    [lots, filters],
  );

  const users = useMemo(() => [...new Set(logs.map((row) => row.actor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr-TR")), [logs]);
  const modelNames = useMemo(() => [...new Set([...jobs.map((row) => row.modelName), ...productions.map((row) => row.modelSnapshot || row.modelName)].filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr-TR")), [jobs, productions]);
  const productNames = useMemo(() => [...new Set(products.map((row) => row.productName).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr-TR")), [products]);

  const rfRows = useMemo(
    () => jobs.flatMap((job) => safeArray(job.colors).flatMap((color) => safeArray(color.rfUsage).map((row) => ({ ...row, colorName: row.colorName || color.colorName, pantone: row.pantone || color.pantone, sourceJob: job })))),
    [jobs],
  );
  const filteredRf = rfRows.filter((row) => within(row.createdAt) && includes(`${row.sourceModelName} ${row.targetModelName} ${row.colorName} ${row.pantone}`, q) && includes(`${row.sourceModelName} ${row.targetModelName}`, filters.model) && includes(`${row.colorName} ${row.pantone}`, filters.color));

  const productUsage = useMemo(() => {
    const map = new Map(products.map((row) => [String(row.id), { ...row, usedKg: 0, sampleKg: 0, productionKg: 0, lots: [], models: new Set() }]));
    filteredLots.forEach((lot) => {
      const id = String(lot.inventoryId || lot.productId || "");
      const row = map.get(id) || { id, productName: lot.productName || "Ürün", usedKg: 0, sampleKg: 0, productionKg: 0, lots: [], models: new Set() };
      row.usedKg += Number(lot.usedKg || 0);
      row.lots.push(lot);
      safeArray(lot.usedModels).forEach((model) => row.models.add(model));
      map.set(id, row);
    });
    productions.forEach((production) => safeArray(production.items || production.lines).forEach((line) => {
      const id = String(line.productId || line.inventoryId || "");
      if (!id) return;
      const row = map.get(id) || { id, productName: line.productNameSnapshot || line.productName || "Ürün", usedKg: 0, sampleKg: 0, productionKg: 0, lots: [], models: new Set() };
      const kg = Number(line.productionGram || line.usedGram || line.referenceGram || 0) / 1000;
      if (jobType(production) === "SAMPLE") row.sampleKg += kg;
      else row.productionKg += kg;
      row.models.add(production.modelSnapshot || production.modelName || "");
      map.set(id, row);
    }));
    return [...map.values()].filter((row) => includes(row.productName, filters.product)).sort((a, b) => Number(b.usedKg || b.productionKg) - Number(a.usedKg || a.productionKg));
  }, [products, filteredLots, productions, filters.product]);

  const summary = report?.summary || {};
  const expenses = safeArray(report?.expenses).filter((row) => within(row.createdAt || row.date) && includes(`${row.description} ${row.category} ${row.productName} ${row.modelName}`, q));
  const sampleRows = filteredProductions.filter((row) => jobType(row) === "SAMPLE");
  const productionRows = filteredProductions.filter((row) => jobType(row) === "PRODUCTION");

  function resetFilters() {
    setFilters({ query: "", user: "", startDate: "", endDate: "", model: "", color: "", product: "", operationType: "" });
  }

  function exportCsv() {
    if (tab === "logs") {
      downloadCsv("boyahane-islem-loglari", ["Tarih", "Kullanıcı", "İşlem", "Açıklama", "Kayıt Türü"], filteredLogs.map((row) => [formatDate(row.createdAt), row.actor, row.actionType || row.action, row.description, row.entityType]));
      return;
    }
    if (tab === "product-lot") {
      downloadCsv("boyahane-urun-lot", ["Ürün", "Numune KG", "İmalat KG", "Lot Kullanımı KG", "Aktif Lot", "Kalan KG", "Modeller"], productUsage.map((row) => [row.productName, row.sampleKg, row.productionKg, row.usedKg, row.lots.filter((lot) => Number(lot.remainingKg || 0) > 0).length, row.lots.reduce((sum, lot) => sum + Number(lot.remainingKg || 0), 0), [...row.models].filter(Boolean).join(", ")]));
      return;
    }
    if (tab === "rf") {
      downloadCsv("boyahane-rf", ["Tarih", "Kaynak Model", "Kullanılan Model", "Renk", "İlk KG", "Kullanılan KG", "Kalan KG", "TL", "Kullanıcı", "Durum"], filteredRf.map((row) => [formatDate(row.createdAt), row.sourceModelName, row.targetModelName, row.colorName || row.pantone, row.sourceKg, row.usedKg, row.remainingKg, row.tlValue, row.actor || row.userName, row.status === "BITTI" ? "Bitti" : "RF"]));
      return;
    }
    const source = tab === "samples" ? sampleRows : tab === "productions" ? productionRows : filteredProductions;
    downloadCsv(`boyahane-${tab}`, ["Tarih", "Model", "Firma", "Renk", "Pantone", "Boya Türü", "Versiyon", "KG", "İş Türü"], source.map((row) => [formatDate(row.createdAt), row.modelSnapshot || row.modelName, row.companySnapshot, row.colorNameSnapshot || row.colorName, row.pantoneSnapshot, row.paintTypeSnapshot, row.versionSnapshot, row.productionTotalKg, jobType(row)]));
  }

  const ProductionTable = ({ rows, empty }) => (
    <section className="bh-card"><div className="bh-card-body"><div className="bh-table-wrap wide"><table><thead><tr><th>Görsel</th><th>Tarih</th><th>Model</th><th>Firma</th><th>Renk / Pantone</th><th>Boya Türü</th><th>Versiyon</th><th>KG</th><th>Kullanıcı</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><ModelThumbnail src={row.imageUrl} alt={row.modelSnapshot || row.modelName} /></td><td>{formatDate(row.createdAt)}</td><td><strong>{row.modelSnapshot || row.modelName || "-"}</strong></td><td>{row.companySnapshot || "-"}</td><td>{row.colorNameSnapshot || row.colorName || "-"} · {row.pantoneSnapshot || row.pantone || "-"}</td><td>{row.paintTypeSnapshot || row.paintType || "-"}</td><td>{row.versionSnapshot || row.version || "-"}</td><td>{formatKg(row.productionTotalKg)}</td><td>{row.actor || row.createdByName || "-"}</td></tr>)}</tbody></table></div>{!rows.length ? <div className="bh-empty compact">{empty}</div> : null}</div></section>
  );

  return (
    <div className="bh-reports-hub">
      <section className="bh-operation-intro">
        <div><small>RAPORLAR VE İŞLEM LOGLARI</small><h2>Boyahane Denetim Merkezi</h2><p>Numune, imalat, boya gideri, ürün, lot, RF ve kullanıcı hareketlerini aynı merkezden denetleyin.</p></div>
        <div className="bh-head-actions"><button type="button" className="bh-btn" onClick={exportCsv}>Excel / CSV</button><button type="button" className="bh-btn" onClick={() => window.print()}>Yazdır / PDF</button></div>
      </section>

      <nav className="bh-operation-tabs reports">{TABS.map(([key, label]) => <button type="button" key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</nav>

      <section className="bh-report-filters bh-report-filters-full">
        <label><span>Genel arama</span><input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} placeholder="Model, renk, ürün, lot veya işlem" /></label>
        <label><span>Başlangıç</span><input type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} /></label>
        <label><span>Bitiş</span><input type="date" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} /></label>
        <label><span>Kullanıcı</span><select value={filters.user} onChange={(event) => setFilters((current) => ({ ...current, user: event.target.value }))}><option value="">Tümü</option>{users.map((user) => <option key={user}>{user}</option>)}</select></label>
        <label><span>Model</span><select value={filters.model} onChange={(event) => setFilters((current) => ({ ...current, model: event.target.value }))}><option value="">Tümü</option>{modelNames.map((model) => <option key={model}>{model}</option>)}</select></label>
        <label><span>Renk / Pantone</span><input value={filters.color} onChange={(event) => setFilters((current) => ({ ...current, color: event.target.value }))} placeholder="18-1663, kırmızı…" /></label>
        <label><span>Ürün</span><select value={filters.product} onChange={(event) => setFilters((current) => ({ ...current, product: event.target.value }))}><option value="">Tümü</option>{productNames.map((product) => <option key={product}>{product}</option>)}</select></label>
        <label><span>İşlem türü</span><select value={filters.operationType} onChange={(event) => setFilters((current) => ({ ...current, operationType: event.target.value }))}><option value="">Tümü</option><option value="SAMPLE">Numune</option><option value="PRODUCTION">İmalat</option><option value="RF">RF</option><option value="LOT">Lot</option><option value="APPROVAL">Onay</option></select></label>
        <button type="button" className="bh-btn" onClick={resetFilters}>Temizle</button>
      </section>

      {error ? <div className="bh-notice danger">{error}<button type="button" className="bh-btn mini" onClick={load}>Yeniden Dene</button></div> : null}
      {loading ? <div className="bh-empty compact">Raporlar hazırlanıyor…</div> : null}

      {tab === "summary" ? (
        <>
          <div className="bh-command-kpis">
            <article><span>Numune</span><strong>{summary.sampleCount ?? sampleRows.length}</strong><small>Fiziksel hazırlama</small></article>
            <article><span>Onaylanan renk</span><strong>{summary.approvedColorCount ?? productions.filter((row) => row.recipeId).length}</strong><small>Versiyon geçmişi korunur</small></article>
            <article><span>İmalat boyası</span><strong>{formatKg(summary.preparedKg || productionRows.reduce((sum, row) => sum + Number(row.productionTotalKg || 0), 0))}</strong><small>{productionRows.length} kayıt</small></article>
            <article><span>İmalat bekleyen</span><strong>{jobs.filter((row) => safeArray(row.colors).length && safeArray(row.colors).every((color) => ["COMPLETED", "CANCELLED"].includes(String(color.status).toUpperCase())) && !row.enteredProductionAt && row.status !== "COMPLETED").length}</strong><small>Hazır model</small></article>
            <article><span>RF</span><strong>{formatKg(filteredRf.reduce((sum, row) => sum + Number(row.usedKg || 0), 0))}</strong><small>{filteredRf.reduce((sum, row) => sum + Number(row.tlValue || 0), 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</small></article>
            <article><span>Fire / Sayım</span><strong>{formatKg(summary.fireKg || summary.adjustmentKg || 0)}</strong><small>Ters hareketler dahil</small></article>
          </div>
          <div className="bh-dashboard-two-column">
            <ProductionTable rows={filteredProductions.slice(0, 16)} empty="Hazırlama kaydı yok." />
            <section className="bh-card"><div className="bh-card-head"><div><h2>Son İşlem Logları</h2><small>Kullanıcı ve tarih denetimi</small></div></div><div className="bh-card-body bh-activity-list">{filteredLogs.slice(0, 16).map((row) => <article key={row.id}><time>{formatDate(row.createdAt)}</time><div><strong>{row.actor || "KY ERP"}</strong><p>{row.description || row.actionType || row.action}</p></div></article>)}</div></section>
          </div>
        </>
      ) : null}

      {tab === "samples" ? <ProductionTable rows={sampleRows} empty="Filtreye uygun numune kaydı yok." /> : null}
      {tab === "productions" ? <ProductionTable rows={productionRows} empty="Filtreye uygun imalat boya kaydı yok." /> : null}

      {tab === "expenses" ? <section className="bh-card"><div className="bh-card-body"><div className="bh-table-wrap wide"><table><thead><tr><th>Tarih</th><th>Kategori</th><th>Açıklama</th><th>Ürün</th><th>Model</th><th>Tutar</th><th>Para Birimi</th><th>Kullanıcı</th></tr></thead><tbody>{expenses.map((row) => <tr key={row.id}><td>{formatDate(row.createdAt || row.date)}</td><td>{row.category || "Boya gideri"}</td><td>{row.description || "-"}</td><td>{row.productName || "-"}</td><td>{row.modelName || "-"}</td><td>{Number(row.amount || row.tlValue || 0).toLocaleString("tr-TR")}</td><td>{row.currency || "TL"}</td><td>{row.actor || "-"}</td></tr>)}</tbody></table></div>{!expenses.length ? <div className="bh-empty compact">Filtreye uygun boya gideri kaydı yok.</div> : null}</div></section> : null}

      {tab === "product-lot" ? <section className="bh-card"><div className="bh-card-body"><div className="bh-table-wrap wide"><table><thead><tr><th>Ürün</th><th>Tür</th><th>Numune</th><th>İmalat</th><th>Lot kullanımı</th><th>Aktif lot</th><th>Kalan</th><th>Kullanıldığı modeller</th></tr></thead><tbody>{productUsage.map((row) => <tr key={row.id}><td><strong>{row.productName}</strong></td><td>{row.dyeType || "-"}</td><td>{formatKg(row.sampleKg)}</td><td>{formatKg(row.productionKg)}</td><td>{formatKg(row.usedKg)}</td><td>{row.lots.filter((lot) => Number(lot.remainingKg || 0) > 0).length}</td><td>{formatKg(row.lots.reduce((sum, lot) => sum + Number(lot.remainingKg || 0), 0))}</td><td>{[...row.models].filter(Boolean).join(", ") || "Detay hareketlerinde"}</td></tr>)}</tbody></table></div>{!productUsage.length ? <div className="bh-empty compact">Ürün veya lot kullanımı bulunmuyor.</div> : null}</div></section> : null}

      {tab === "model-color" ? <section className="bh-model-history-grid">{filteredProductions.map((row) => <article key={row.id}><ModelThumbnail src={row.imageUrl} alt={row.modelSnapshot || row.modelName} size="medium" /><div><h3>{row.modelSnapshot || row.modelName || "Model"}</h3><p>{row.companySnapshot || "-"}</p><dl><div><dt>Renk</dt><dd>{row.colorNameSnapshot || row.colorName || "-"}</dd></div><div><dt>Pantone</dt><dd>{row.pantoneSnapshot || "-"}</dd></div><div><dt>Boya türü</dt><dd>{row.paintTypeSnapshot || "-"}</dd></div><div><dt>Versiyon</dt><dd>{row.versionSnapshot || "-"}</dd></div><div><dt>Gramaj</dt><dd>{formatKg(row.productionTotalKg)}</dd></div><div><dt>Tarih</dt><dd>{formatDate(row.createdAt)}</dd></div></dl></div></article>)}{!filteredProductions.length ? <div className="bh-empty compact">Model veya renk geçmişi bulunmuyor.</div> : null}</section> : null}

      {tab === "rf" ? <section className="bh-card"><div className="bh-card-body"><div className="bh-table-wrap wide"><table><thead><tr><th>Tarih</th><th>Kaynak Model</th><th>Kullanılan Model</th><th>Renk</th><th>İlk KG</th><th>Kullanılan KG</th><th>Kalan KG</th><th>TL</th><th>Kullanıcı</th><th>Durum</th></tr></thead><tbody>{filteredRf.map((row) => <tr key={row.id}><td>{formatDate(row.createdAt)}</td><td>{row.sourceModelName || "-"}</td><td>{row.targetModelName || "-"}</td><td>{row.colorName || row.pantone || "-"}</td><td>{formatKg(row.sourceKg)}</td><td><strong>{formatKg(row.usedKg)}</strong></td><td>{formatKg(row.remainingKg)}</td><td>{Number(row.tlValue || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</td><td>{row.actor || row.userName || "-"}</td><td><span className={`bh-status ${row.status === "BITTI" ? "gray" : "green"}`}>{row.status === "BITTI" ? "Bitti" : "RF"}</span></td></tr>)}</tbody></table></div>{!filteredRf.length ? <div className="bh-empty compact">Filtreye uygun RF kaydı yok.</div> : null}</div></section> : null}

      {tab === "logs" ? <section className="bh-card"><div className="bh-card-body"><div className="bh-table-wrap wide"><table><thead><tr><th>Tarih-Saat</th><th>Kullanıcı</th><th>İşlem</th><th>Açıklama</th><th>Kayıt Türü</th></tr></thead><tbody>{filteredLogs.map((row) => <tr key={row.id}><td>{formatDate(row.createdAt)}</td><td><strong>{row.actor || "KY ERP"}</strong></td><td>{row.actionType || row.action || "-"}</td><td>{row.description || "-"}</td><td>{row.entityType || "-"}</td></tr>)}</tbody></table></div>{!filteredLogs.length ? <div className="bh-empty compact">Filtreye uygun işlem logu yok.</div> : null}</div></section> : null}
    </div>
  );
}
