/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getBoyahaneReports,
  listBoyahaneJobs,
  listBoyahaneLogs,
  listBoyahaneProductions,
  listRegisteredColors,
} from "../../../services/boyahaneWorkflowApi";
import { formatDate, formatKg, safeArray, statusTone } from "./boyahaneFormat";
import ModelThumbnail from "./ModelThumbnail";

function todayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function jobKind(job) {
  const value = String(job?.jobType || job?.workflowType || job?.type || "").toUpperCase();
  return value === "SAMPLE" || value === "TRIAL" ? "sample" : "production";
}

function waitText(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const hours = Math.max(0, Math.floor((Date.now() - date.getTime()) / 3_600_000));
  if (hours < 24) return `${hours} saat`;
  return `${Math.floor(hours / 24)} gün`;
}

export default function BoyahaneDashboardPage({ activeMainCompany, openModule }) {
  const [jobs, setJobs] = useState([]);
  const [productions, setProductions] = useState([]);
  const [colors, setColors] = useState([]);
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({});
  const [clock, setClock] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug) return;
    setLoading(true);
    setError("");
    try {
      const [jobRows, productionRows, colorRows, logRows, report] = await Promise.all([
        listBoyahaneJobs(activeMainCompany),
        listBoyahaneProductions(activeMainCompany),
        listRegisteredColors(activeMainCompany),
        listBoyahaneLogs(activeMainCompany),
        getBoyahaneReports(activeMainCompany),
      ]);
      setJobs(safeArray(jobRows));
      setProductions(safeArray(productionRows));
      setColors(safeArray(colorRows));
      setLogs(safeArray(logRows));
      setSummary(report?.summary || {});
    } catch (requestError) {
      setError(requestError?.message || "Boyahane ana ekranı yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany?.slug]);

  useEffect(() => { load(); }, [activeMainCompany?.slug]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const today = todayKey();
  const openJobs = useMemo(
    () => jobs.filter((row) => !["COMPLETED", "CANCELLED"].includes(String(row.status).toUpperCase())),
    [jobs],
  );
  const todayRows = useMemo(
    () => productions.filter((row) => todayKey(row.createdAt || row.updatedAt) === today),
    [productions, today],
  );
  const preparedModels = useMemo(() => {
    const map = new Map();
    productions.forEach((row) => {
      if (String(row.jobType || "").toUpperCase() === "SAMPLE") return;
      const key = row.jobId || row.modelSnapshot || row.modelName || row.id;
      const current = map.get(key) || {
        id: key,
        modelName: row.modelSnapshot || row.modelName || "Model",
        companyName: row.companySnapshot || row.companyName || "",
        imageUrl: row.imageUrl || "",
        totalKg: 0,
        colors: new Set(),
        createdAt: row.createdAt,
      };
      current.totalKg += Number(row.productionTotalKg || row.totalPreparedKg || 0);
      current.colors.add(row.pantoneSnapshot || row.colorNameSnapshot || row.colorName || row.id);
      if (String(row.createdAt || "") > String(current.createdAt || "")) current.createdAt = row.createdAt;
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 12);
  }, [productions]);

  const rates = summary.exchangeRates || summary.rates || {};
  const rate = (key) => Number(rates[key]?.rate || rates[key] || 0) > 0
    ? Number(rates[key]?.rate || rates[key]).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    : "—";

  function openJob(job) {
    const tabKey = jobKind(job) === "sample" ? "receteler" : "uretim-gecmisi";
    openModule?.("boyahane", {
      tabKey,
      actionContext: { sourceModule: "boyahane", boyahaneJobId: job.id },
    });
  }

  return (
    <div className="bh-command-page">
      <section className="bh-command-strip">
        <div><strong>HAKAN EMPRİME BOYAHANE</strong><span>{clock.toLocaleDateString("tr-TR")} · {clock.toLocaleTimeString("tr-TR")}</span></div>
        <div className="bh-rate-list"><span>USD <b>{rate("USD")}</b></span><span>EUR <b>{rate("EUR")}</b></span><span>GBP <b>{rate("GBP")}</b></span></div>
        <button type="button" className="bh-btn primary" onClick={() => openModule?.("asistan", { actionContext: { sourceModule: "boyahane", sourceTab: "ana-ekran" } })}>Asistan</button>
      </section>

      {error ? <div className="bh-notice danger">{error}</div> : null}
      {loading ? <div className="bh-empty large">Boyahane kontrol merkezi yükleniyor…</div> : null}

      <div className="bh-command-kpis">
        <article><span>Yapılacak model</span><strong>{openJobs.length}</strong><small>Numune ve imalat birlikte</small></article>
        <article><span>Hazırlanacak renk</span><strong>{summary.pendingColors ?? openJobs.reduce((sum, row) => sum + Number(row.pendingColorCount || 0), 0)}</strong><small>Kanal bazlı takip</small></article>
        <article><span>Bugün hazırlanan</span><strong>{formatKg(todayRows.reduce((sum, row) => sum + Number(row.productionTotalKg || 0), 0))}</strong><small>{todayRows.length} ayrı hazırlama</small></article>
        <article><span>İmalat bekleyen</span><strong>{jobs.filter((row) => row.colors?.length && row.colors.every((color) => ["COMPLETED", "CANCELLED"].includes(String(color.status).toUpperCase())) && row.status !== "COMPLETED").length}</strong><small>Kg tekrar sorulmaz</small></article>
        <article><span>RF tasarrufu</span><strong>{formatKg(summary.rfKg || 0)}</strong><small>{Number(summary.rfTl || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</small></article>
      </div>

      <section className="bh-command-section">
        <div className="bh-command-section-head"><div><small>ÖNCELİKLİ</small><h2>Yapılacak İşler</h2><p>Görsele tıklayınca yalnız büyük ön izleme açılır; çalışma ekranı “İşi Aç” ile açılır.</p></div><button className="bh-btn" type="button" onClick={load}>Yenile</button></div>
        <div className="bh-model-card-grid">
          {openJobs.slice(0, 12).map((job) => (
            <article className="bh-model-command-card" key={job.id}>
              <button type="button" className="bh-model-image-button" onClick={() => setPreview({ src: job.imageUrl, alt: job.modelName })}><ModelThumbnail src={job.imageUrl} alt={job.modelName} size="large" /></button>
              <div className="bh-model-card-copy"><div><span className={`bh-status ${statusTone(job.status)}`}>{jobKind(job) === "sample" ? "Numune" : "İmalat"}</span><h3>{job.modelName}</h3><p>{job.companyName || "Firma bilgisi yok"}</p></div><dl><div><dt>Renk</dt><dd>{job.preparedColorCount || 0} / {job.colors?.length || 0}</dd></div><div><dt>Eksik</dt><dd>{job.pendingColorCount || 0}</dd></div><div><dt>Bekleme</dt><dd>{waitText(job.createdAt)}</dd></div></dl><button type="button" className="bh-btn primary wide" onClick={() => openJob(job)}>İşi Aç</button></div>
            </article>
          ))}
          {!openJobs.length && !loading ? <div className="bh-empty">Bekleyen Boyahane işi bulunmuyor.</div> : null}
        </div>
      </section>

      <section className="bh-command-section">
        <div className="bh-command-section-head"><div><small>BUGÜN</small><h2>Bugün Yapılan İşler</h2><p>Karışım boyanın tek lotu gösterilmez; bileşen lotları hazırlama detayında bağlıdır.</p></div></div>
        <div className="bh-table-wrap wide"><table><thead><tr><th>Saat</th><th>Model</th><th>Renk / Pantone</th><th>Boya türü</th><th>Versiyon</th><th>Gramaj</th><th>Lot durumu</th><th>Durum</th></tr></thead><tbody>{todayRows.map((row) => <tr key={row.id}><td>{formatDate(row.createdAt)}</td><td><strong>{row.modelSnapshot || row.modelName || "-"}</strong></td><td>{row.colorNameSnapshot || row.colorName || "-"} · {row.pantoneSnapshot || row.pantone || "-"}</td><td>{row.paintTypeSnapshot || row.paintType || "-"}</td><td>{row.versionSnapshot || row.version || "-"}</td><td>{formatKg(row.productionTotalKg || row.totalPreparedKg)}</td><td><span className="bh-link-chip">Bileşen lotları kayıtlı</span></td><td><span className="bh-status green">Hazır</span></td></tr>)}</tbody></table></div>
        {!todayRows.length ? <div className="bh-empty">Bugün hazırlanmış boya kaydı yok.</div> : null}
      </section>

      <section className="bh-command-section">
        <div className="bh-command-section-head"><div><small>İMALATA HAZIR</small><h2>İmalata Hazırlanan Model Boyaları</h2></div></div>
        <div className="bh-prepared-grid">{preparedModels.map((row) => <article key={row.id}><button type="button" onClick={() => setPreview({ src: row.imageUrl, alt: row.modelName })}><ModelThumbnail src={row.imageUrl} alt={row.modelName} size="large" /></button><div><h3>{row.modelName}</h3><p>{row.companyName || "-"}</p><span>{row.colors.size} renk · {formatKg(row.totalKg)}</span><small>{formatDate(row.createdAt)} · {waitText(row.createdAt)}</small></div></article>)}</div>
      </section>

      <div className="bh-dashboard-two-column">
        <section className="bh-command-section"><div className="bh-command-section-head"><div><small>RENK HAFIZASI</small><h2>Son Kayıtlı Renkler</h2></div><button type="button" className="bh-btn" onClick={() => openModule?.("boyahane", { tabKey: "kayitli-renkler" })}>Tümünü Aç</button></div><div className="bh-recent-color-grid">{colors.slice(0, 16).map((row) => <button key={row.id} type="button" onClick={() => openModule?.("boyahane", { tabKey: "kayitli-renkler", actionContext: { registeredColorId: row.id } })}><i style={{ background: row.colorHex || "#cbd5e1" }} /><strong>{row.pantone || row.colorName || "Renk"}</strong><span>{safeArray(row.paintTypes).join(", ") || row.dyeType || "-"}</span><small>{row.lastModelName || row.lastUsedModel || "Henüz model yok"}</small></button>)}</div></section>
        <section className="bh-command-section"><div className="bh-command-section-head"><div><small>DENETİM</small><h2>Son Yapılan İşlemler</h2></div><button type="button" className="bh-btn" onClick={() => openModule?.("boyahane", { tabKey: "raporlar" })}>Tüm Loglar</button></div><div className="bh-activity-list">{logs.slice(0, 12).map((row) => <article key={row.id}><time>{formatDate(row.createdAt)}</time><div><strong>{row.actor || "KY ERP"}</strong><p>{row.description || row.actionType || row.action}</p></div></article>)}</div></section>
      </div>

      {preview ? <div className="bh-modal" role="dialog" aria-modal="true" onClick={() => setPreview(null)}><div className="bh-image-preview" onClick={(event) => event.stopPropagation()}><button type="button" className="bh-modal-close" onClick={() => setPreview(null)}>Kapat</button><ModelThumbnail src={preview.src} alt={preview.alt} size="large" /><strong>{preview.alt}</strong></div></div> : null}
    </div>
  );
}
