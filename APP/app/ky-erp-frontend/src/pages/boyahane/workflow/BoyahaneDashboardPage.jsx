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

function timeText(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function priorityText(value) {
  const key = String(value || "NORMAL").toUpperCase();
  return { HIGH: "Öncelikli", URGENT: "Acil", NORMAL: "Normal", LOW: "Düşük" }[key] || key;
}

function groupToday(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = String(row.jobId || row.modelSnapshot || row.modelName || row.id);
    const current = map.get(key) || {
      id: key,
      modelName: row.modelSnapshot || row.modelName || "Model",
      companyName: row.companySnapshot || row.companyName || "",
      imageUrl: row.imageUrl || "",
      createdAt: row.createdAt,
      actor: row.actor || row.createdByName || row.userName || "KY ERP",
      rows: [],
      totalKg: 0,
    };
    current.rows.push(row);
    current.totalKg += Number(row.productionTotalKg || row.totalPreparedKg || 0);
    if (String(row.createdAt || "") > String(current.createdAt || "")) {
      current.createdAt = row.createdAt;
      current.actor = row.actor || row.createdByName || row.userName || current.actor;
    }
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
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
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantAnswer, setAssistantAnswer] = useState("");

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
      console.error("Boyahane dashboard load failed", requestError);
      setError("Boyahane verileri şu anda alınamadı. Bağlantıyı kontrol edip yeniden deneyin.");
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
  const todayModels = useMemo(() => groupToday(todayRows), [todayRows]);
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
  function rateInfo(key) {
    const raw = rates[key];
    const value = Number(raw?.rate || raw || 0);
    const updatedAt = raw?.updatedAt || summary.exchangeRateUpdatedAt || "";
    const date = new Date(updatedAt || 0);
    const stale = !Number.isNaN(date.getTime()) && Date.now() - date.getTime() > 36 * 3_600_000;
    return {
      value: value > 0
        ? value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
        : "Veri yok",
      source: raw?.source || summary.exchangeRateSource || "Kur kaynağı yok",
      updatedAt,
      stale,
    };
  }

  function openJob(job) {
    const tabKey = jobKind(job) === "sample" ? "receteler" : "uretim-gecmisi";
    openModule?.("boyahane", {
      tabKey,
      actionContext: { sourceModule: "boyahane", boyahaneJobId: job.id },
    });
  }

  function answerQuestion(type) {
    if (type === "waiting") {
      const waiting = jobs.filter((row) => {
        const colorsOfJob = safeArray(row.colors).filter((color) => String(color.status).toUpperCase() !== "CANCELLED");
        return colorsOfJob.length && colorsOfJob.every((color) => String(color.status).toUpperCase() === "COMPLETED") && !row.enteredProductionAt && row.status !== "COMPLETED";
      });
      setAssistantAnswer(waiting.length ? `${waiting.length} modelin imalat boyaları hazır ve imalat bekliyor: ${waiting.map((row) => row.modelName).join(", ")}.` : "İmalat boyaları hazır olup bekleyen model bulunmuyor.");
    } else if (type === "rf") {
      setAssistantAnswer(`Bu ay ${formatKg(summary.rfKg || 0)} RF boya değerlendirildi. Kayıtlı TL değeri ${Number(summary.rfTl || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}.`);
    } else if (type === "today") {
      setAssistantAnswer(`Bugün ${todayModels.length} model için ${todayRows.length} renk hazırlama kaydı var. Toplam ${formatKg(todayRows.reduce((sum, row) => sum + Number(row.productionTotalKg || 0), 0))}.`);
    } else {
      setAssistantAnswer(openJobs.length ? `${openJobs.length} açık Boyahane işi var. İlk sırada ${openJobs[0]?.modelName || "model"} bulunuyor.` : "Açık Boyahane işi bulunmuyor.");
    }
  }

  return (
    <div className="bh-command-page">
      <section className="bh-command-strip">
        <div className="bh-command-brand">
          <strong>HAKAN EMPRİME BOYAHANE</strong>
          <span>{clock.toLocaleDateString("tr-TR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })} · {clock.toLocaleTimeString("tr-TR")}</span>
        </div>
        <div className="bh-rate-list" aria-label="Güncel döviz kurları">
          {["USD", "EUR", "GBP"].map((key) => {
            const item = rateInfo(key);
            return (
              <span key={key} className={item.stale ? "stale" : ""} title={`${item.source}${item.updatedAt ? ` · ${formatDate(item.updatedAt)}` : ""}`}>
                <small>{key}</small><b>{item.value}</b>{item.stale ? <em>Güncel değil</em> : null}
              </span>
            );
          })}
        </div>
        <button type="button" className="bh-btn primary" onClick={() => setAssistantOpen(true)}>Boyahane Asistanı</button>
      </section>

      {error ? <div className="bh-notice danger">{error}<button type="button" className="bh-btn mini" onClick={load}>Yeniden Dene</button></div> : null}
      {loading ? <div className="bh-empty compact">Boyahane kontrol merkezi yükleniyor…</div> : null}

      <div className="bh-command-kpis compact">
        <article><span>Yapılacak model</span><strong>{openJobs.length}</strong><small>Numune ve imalat</small></article>
        <article><span>Hazırlanacak renk</span><strong>{summary.pendingColors ?? openJobs.reduce((sum, row) => sum + Number(row.pendingColorCount || safeArray(row.colors).filter((color) => !["COMPLETED", "CANCELLED"].includes(String(color.status).toUpperCase())).length), 0)}</strong><small>Kanal bazlı</small></article>
        <article><span>Bugün hazırlanan</span><strong>{formatKg(todayRows.reduce((sum, row) => sum + Number(row.productionTotalKg || 0), 0))}</strong><small>{todayRows.length} renk</small></article>
        <article><span>İmalat bekleyen</span><strong>{jobs.filter((row) => safeArray(row.colors).length && safeArray(row.colors).every((color) => ["COMPLETED", "CANCELLED"].includes(String(color.status).toUpperCase())) && !row.enteredProductionAt && row.status !== "COMPLETED").length}</strong><small>Hazır model</small></article>
        <article><span>RF tasarrufu</span><strong>{formatKg(summary.rfKg || 0)}</strong><small>{Number(summary.rfTl || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</small></article>
      </div>

      <section className="bh-command-section">
        <div className="bh-command-section-head">
          <div><small>ÖNCELİKLİ</small><h2>Yapılacak İşler</h2><p>Model görseli yalnız büyür; çalışma ekranı “İşi Aç” düğmesiyle açılır.</p></div>
          <button className="bh-btn" type="button" onClick={load}>Yenile</button>
        </div>
        <div className="bh-model-card-grid">
          {openJobs.slice(0, 12).map((job) => {
            const activeColors = safeArray(job.colors).filter((row) => String(row.status).toUpperCase() !== "CANCELLED");
            const preparedCount = activeColors.filter((row) => String(row.status).toUpperCase() === "COMPLETED").length;
            return (
              <article className="bh-model-command-card" key={job.id}>
                <div className="bh-model-image-panel"><ModelThumbnail src={job.imageUrl} alt={job.modelName} size="large" /></div>
                <div className="bh-model-card-copy">
                  <div className="bh-card-topline">
                    <span className={`bh-status ${jobKind(job) === "sample" ? "purple" : statusTone(job.status)}`}>{jobKind(job) === "sample" ? "Numune" : "İmalat"}</span>
                    <span className={`bh-priority ${String(job.priority).toLowerCase()}`}>{priorityText(job.priority)}</span>
                  </div>
                  <div><h3>{job.modelName}</h3><p>{job.companyName || "Firma bilgisi yok"} · {job.orderNo || "Sipariş bilgisi yok"}</p></div>
                  <dl>
                    <div><dt>Kanal</dt><dd>{job.channelCount || activeColors.length}</dd></div>
                    <div><dt>Renk</dt><dd>{preparedCount} / {activeColors.length}</dd></div>
                    <div><dt>Hazırlanacak</dt><dd>{Math.max(0, activeColors.length - preparedCount)}</dd></div>
                    <div><dt>Bekleme</dt><dd>{waitText(job.createdAt)}</dd></div>
                  </dl>
                  <button type="button" className="bh-btn primary wide" onClick={() => openJob(job)}>İşi Aç</button>
                </div>
              </article>
            );
          })}
          {!openJobs.length && !loading ? <div className="bh-empty compact">Bekleyen Boyahane işi bulunmuyor.</div> : null}
        </div>
      </section>

      <section className="bh-command-section">
        <div className="bh-command-section-head"><div><small>BUGÜN</small><h2>Bugün Yapılan İşler</h2><p>Her model tek kayıt altında; hazırlanan bütün renkleri liste halinde gösterilir.</p></div></div>
        <div className="bh-today-model-list">
          {todayModels.map((model) => (
            <details className="bh-today-model" key={model.id} open>
              <summary>
                <ModelThumbnail src={model.imageUrl} alt={model.modelName} size="medium" />
                <span><strong>{timeText(model.createdAt)} — {model.modelName}</strong><small>{model.rows.length} renk · Toplam {formatKg(model.totalKg)} · Hazırlayan: {model.actor}</small></span>
                <b>{model.companyName || ""}</b>
              </summary>
              <div className="bh-table-wrap wide">
                <table>
                  <thead><tr><th>Renk</th><th>Pantone</th><th>Boya türü</th><th>Versiyon</th><th>Gramaj</th><th>Lot durumu</th><th>Durum</th></tr></thead>
                  <tbody>
                    {model.rows.map((row) => (
                      <tr key={row.id}>
                        <td><strong>{row.colorNameSnapshot || row.colorName || "-"}</strong></td>
                        <td>{row.pantoneSnapshot || row.pantone || "-"}</td>
                        <td>{row.paintTypeSnapshot || row.paintType || "-"}</td>
                        <td>{row.versionSnapshot || row.version || "-"}</td>
                        <td>{formatKg(row.productionTotalKg || row.totalPreparedKg)}</td>
                        <td><button type="button" className="bh-link-chip" onClick={() => openModule?.("boyahane", { tabKey: "urun-lotlar", actionContext: { productionId: row.id } })}>Lotlar kayıtlı</button></td>
                        <td><span className="bh-status green">Hazır</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
          {!todayModels.length ? <div className="bh-empty compact">Bugün hazırlanmış boya kaydı yok.</div> : null}
        </div>
      </section>

      <section className="bh-command-section">
        <div className="bh-command-section-head"><div><small>İMALATA HAZIR</small><h2>İmalata Hazırlanan Model Boyaları</h2><p>Görselden modeli hızlı tanıyın; karta girince bütün renkleri görün.</p></div></div>
        <div className="bh-prepared-grid">
          {preparedModels.map((row) => (
            <article key={row.id}>
              <ModelThumbnail src={row.imageUrl} alt={row.modelName} size="medium" />
              <div><h3>{row.modelName}</h3><p>{row.companyName || "-"}</p><span>{row.colors.size} renk · {formatKg(row.totalKg)}</span><small>{formatDate(row.createdAt)} · {waitText(row.createdAt)}</small><button type="button" className="bh-btn mini" onClick={() => openModule?.("boyahane", { tabKey: "uretim-gecmisi", actionContext: { boyahaneJobId: row.id } })}>Modeli Aç</button></div>
            </article>
          ))}
          {!preparedModels.length ? <div className="bh-empty compact">İmalata hazırlanmış model boyası bulunmuyor.</div> : null}
        </div>
      </section>

      <div className="bh-dashboard-two-column">
        <section className="bh-command-section">
          <div className="bh-command-section-head"><div><small>RENK HAFIZASI</small><h2>Son Kullanılan Renkler</h2></div><button type="button" className="bh-btn" onClick={() => openModule?.("boyahane", { tabKey: "kayitli-renkler" })}>Tüm Kayıtlı Renkler</button></div>
          <div className="bh-recent-color-grid">
            {colors.slice(0, 10).map((row) => (
              <button key={row.id} type="button" onClick={() => openModule?.("boyahane", { tabKey: "kayitli-renkler", actionContext: { registeredColorId: row.id } })}>
                <i style={{ background: row.colorHex || "#cbd5e1" }} />
                <strong>{row.pantone || row.colorName || "Renk"}</strong>
                <span>{safeArray(row.paintTypes).join(", ") || row.dyeType || "-"}</span>
                <small>Son model: {row.lastModelName || row.lastUsedModel || "-"}</small>
              </button>
            ))}
          </div>
        </section>
        <section className="bh-command-section">
          <div className="bh-command-section-head"><div><small>DENETİM</small><h2>Son İşlem Logları</h2></div><button type="button" className="bh-btn" onClick={() => openModule?.("boyahane", { tabKey: "raporlar" })}>Tüm Loglar</button></div>
          <div className="bh-activity-list">
            {logs.slice(0, 10).map((row) => (
              <article key={row.id}><time>{formatDate(row.createdAt)}</time><div><strong>{row.actor || "KY ERP"}</strong><p>{row.description || row.actionType || row.action}</p></div></article>
            ))}
          </div>
        </section>
      </div>

      {assistantOpen ? (
        <div className="bh-assistant-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setAssistantOpen(false)}>
          <aside className="bh-assistant-drawer" role="dialog" aria-modal="true" aria-label="Boyahane Asistanı">
            <header><div><small>KY ERP</small><h2>Boyahane Asistanı</h2></div><button type="button" className="bh-btn" onClick={() => setAssistantOpen(false)}>Kapat</button></header>
            <p>Model hazırlık, imalat bekleyen, RF, lot ve günlük çalışma verilerini hızlıca sorun.</p>
            <div className="bh-assistant-questions">
              <button type="button" onClick={() => answerQuestion("waiting")}>Hangi modellerin boyaları hazır?</button>
              <button type="button" onClick={() => answerQuestion("rf")}>Bu ay kaç KG ve kaç TL RF kullanıldı?</button>
              <button type="button" onClick={() => answerQuestion("today")}>Bugün ne kadar boya hazırlandı?</button>
              <button type="button" onClick={() => answerQuestion("open")}>Açık işler neler?</button>
            </div>
            <div className="bh-assistant-answer" aria-live="polite">{assistantAnswer || "Bir soru seçin; cevap gerçek Boyahane kayıtlarından hazırlanır."}</div>
            <button type="button" className="bh-btn primary wide" onClick={() => openModule?.("asistan", { tabKey: "sohbet", actionContext: { sourceModule: "boyahane", sourceTab: "ana-ekran" } })}>Asistan Sohbetini Aç</button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
