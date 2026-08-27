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
import { loadModuleData, moduleLoadMessage } from "../../../utils/resilientDataLoader";
import ModelThumbnail from "./ModelThumbnail";

function todayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function isSample(job) {
  return ["SAMPLE", "TRIAL"].includes(
    String(job?.jobType || job?.workflowType || job?.type || "").toUpperCase(),
  );
}

function waitText(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "-";
  const hours = Math.max(0, Math.floor((Date.now() - date.getTime()) / 3_600_000));
  return hours < 24 ? `${hours} saat` : `${Math.floor(hours / 24)} gün`;
}

function timeText(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function groupToday(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const key = String(row.jobId || row.modelSnapshot || row.modelName || row.id);
    const current = map.get(key) || {
      id: key,
      jobId: row.jobId,
      modelName: row.modelSnapshot || row.modelName || "Model",
      companyName: row.companySnapshot || row.companyName || "",
      imageUrl: row.imageUrl || "",
      createdAt: row.createdAt,
      actor: row.actor || row.createdByName || row.userName || "KY ERP",
      colorCount: 0,
      totalKg: 0,
    };
    current.colorCount += 1;
    current.totalKg += Number(row.productionTotalKg || row.totalPreparedKg || 0);
    if (String(row.createdAt || "") > String(current.createdAt || "")) {
      current.createdAt = row.createdAt;
      current.actor = row.actor || row.createdByName || row.userName || current.actor;
    }
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export default function BoyahaneDashboardCompactPage({ activeMainCompany, openModule }) {
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
      const tenant = activeMainCompany?.slug || activeMainCompany?.id;
      const result = await loadModuleData({
        scope: `boyahane:${tenant}:dashboard`,
        sources: {
          jobs: { critical: true, load: () => listBoyahaneJobs(activeMainCompany) },
          productions: { fallback: [], load: () => listBoyahaneProductions(activeMainCompany) },
          colors: { fallback: [], load: () => listRegisteredColors(activeMainCompany) },
          logs: { fallback: [], load: () => listBoyahaneLogs(activeMainCompany) },
          report: { fallback: {}, load: () => getBoyahaneReports(activeMainCompany) },
        },
      });
      if (result.states.jobs.status !== "error") setJobs(safeArray(result.data.jobs));
      if (result.states.productions.status !== "error") setProductions(safeArray(result.data.productions));
      if (result.states.colors.status !== "error") setColors(safeArray(result.data.colors));
      if (result.states.logs.status !== "error") setLogs(safeArray(result.data.logs));
      if (result.states.report.status !== "error") setSummary(result.data.report?.summary || {});
      setError(moduleLoadMessage(
        result,
        "Boyahane iş ana listesi alınamadı; son başarılı işler korunuyor.",
        "Bazı Boyahane yardımcı özetleri yenilenemedi; iş listesi kullanılabilir.",
      ));
    } catch (requestError) {
      setError(requestError?.message || "Boyahane verileri alınamadı.");
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany?.slug]);

  useEffect(() => { load(); }, [activeMainCompany?.slug]);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const openJobs = useMemo(
    () => jobs.filter((row) => !["COMPLETED", "CANCELLED"].includes(String(row.status).toUpperCase())),
    [jobs],
  );
  const todayRows = useMemo(
    () => productions.filter((row) => todayKey(row.createdAt || row.updatedAt) === todayKey()),
    [productions],
  );
  const todayModels = useMemo(() => groupToday(todayRows), [todayRows]);
  const preparedModels = useMemo(() => {
    const map = new Map();
    productions.forEach((row) => {
      if (String(row.jobType || "").toUpperCase() === "SAMPLE") return;
      const key = row.jobId || row.modelSnapshot || row.modelName || row.id;
      const current = map.get(key) || {
        id: key,
        jobId: row.jobId,
        modelName: row.modelSnapshot || row.modelName || "Model",
        companyName: row.companySnapshot || row.companyName || "",
        imageUrl: row.imageUrl || "",
        totalKg: 0,
        colors: new Set(),
        createdAt: row.createdAt,
      };
      current.totalKg += Number(row.productionTotalKg || row.totalPreparedKg || 0);
      current.colors.add(row.pantoneSnapshot || row.colorNameSnapshot || row.id);
      if (String(row.createdAt || "") > String(current.createdAt || "")) current.createdAt = row.createdAt;
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [productions]);

  const rates = summary.exchangeRates || summary.rates || {};
  function rateValue(key) {
    const raw = rates[key];
    const value = Number(raw?.rate || raw || 0);
    return value > 0
      ? value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
      : "Veri yok";
  }

  function openJob(job) {
    openModule?.("boyahane", {
      tabKey: isSample(job) ? "receteler" : "uretim-gecmisi",
      actionContext: { sourceModule: "boyahane", boyahaneJobId: job.id || job.jobId },
    });
  }

  function answerQuestion(type) {
    if (type === "waiting") {
      const waiting = jobs.filter((row) => {
        const activeColors = safeArray(row.colors).filter((color) => String(color.status).toUpperCase() !== "CANCELLED");
        return activeColors.length && activeColors.every((color) => String(color.status).toUpperCase() === "COMPLETED") && !row.enteredProductionAt && row.status !== "COMPLETED";
      });
      setAssistantAnswer(waiting.length ? `${waiting.length} model imalat bekliyor: ${waiting.map((row) => row.modelName).join(", ")}.` : "İmalat bekleyen hazır model bulunmuyor.");
    } else if (type === "today") {
      setAssistantAnswer(`Bugün ${todayModels.length} model için ${todayRows.length} renk hazırlandı. Toplam ${formatKg(todayRows.reduce((sum, row) => sum + Number(row.productionTotalKg || 0), 0))}.`);
    } else if (type === "rf") {
      setAssistantAnswer(`Bu ay ${formatKg(summary.rfKg || 0)} RF boya kaydedildi. TL değeri ${Number(summary.rfTl || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}.`);
    } else {
      setAssistantAnswer(openJobs.length ? `${openJobs.length} açık Boyahane işi var. İlk iş ${openJobs[0]?.modelName || "model"}.` : "Açık Boyahane işi yok.");
    }
  }

  const pendingColors = summary.pendingColors ?? openJobs.reduce(
    (sum, row) => sum + safeArray(row.colors).filter((color) => !["COMPLETED", "CANCELLED"].includes(String(color.status).toUpperCase())).length,
    0,
  );
  const todayKg = todayRows.reduce((sum, row) => sum + Number(row.productionTotalKg || 0), 0);
  const manufacturingWaiting = jobs.filter((row) => {
    const activeColors = safeArray(row.colors).filter((color) => String(color.status).toUpperCase() !== "CANCELLED");
    return activeColors.length && activeColors.every((color) => String(color.status).toUpperCase() === "COMPLETED") && !row.enteredProductionAt && row.status !== "COMPLETED";
  }).length;

  return (
    <div className="bh-dashboard-compact-page">
      <section className="bh-dashboard-compact-strip">
        <div><strong>HAKAN EMPRİME BOYAHANE</strong><span>{clock.toLocaleDateString("tr-TR")} · {clock.toLocaleTimeString("tr-TR")}</span></div>
        <div className="bh-dashboard-rates">{["USD", "EUR", "GBP"].map((key) => <span key={key}><small>{key}</small><b>{rateValue(key)}</b></span>)}</div>
        <button type="button" className="bh-btn primary" onClick={() => setAssistantOpen(true)}>Boyahane Asistanı</button>
      </section>

      {error ? <div className="bh-notice danger">{error}<button type="button" className="bh-btn mini" onClick={load}>Yeniden Dene</button></div> : null}
      {loading ? <div className="bh-empty compact">Boyahane ana ekranı yükleniyor…</div> : null}

      <div className="bh-dashboard-mini-kpis">
        <article><span>Yapılacak</span><strong>{openJobs.length}</strong></article>
        <article><span>Hazırlanacak renk</span><strong>{pendingColors}</strong></article>
        <article><span>Bugün</span><strong>{formatKg(todayKg)}</strong></article>
        <article><span>İmalat bekleyen</span><strong>{manufacturingWaiting}</strong></article>
        <article><span>RF</span><strong>{formatKg(summary.rfKg || 0)}</strong></article>
      </div>

      <section className="bh-dashboard-work-panel">
        <header><div><small>ÖNCELİKLİ</small><h2>Yapılacak İşler</h2></div><button type="button" className="bh-btn mini" onClick={load}>Yenile</button></header>
        <div className="bh-dashboard-work-strip">
          {openJobs.map((job) => {
            const activeColors = safeArray(job.colors).filter((row) => String(row.status).toUpperCase() !== "CANCELLED");
            const preparedCount = activeColors.filter((row) => String(row.status).toUpperCase() === "COMPLETED").length;
            return (
              <article key={job.id}>
                <ModelThumbnail src={job.imageUrl} alt={job.modelName} size="medium" />
                <div className="bh-dashboard-work-copy"><span className={`bh-status ${isSample(job) ? "purple" : statusTone(job.status)}`}>{isSample(job) ? "Numune" : "İmalat"}</span><h3>{job.modelName}</h3><p>{job.companyName || "-"} · {job.orderNo || "-"}</p><div><b>{preparedCount}/{activeColors.length} renk</b><small>{waitText(job.createdAt)}</small></div><button type="button" className="bh-btn primary" onClick={() => openJob(job)}>İşi Aç</button></div>
              </article>
            );
          })}
          {!openJobs.length && !loading ? <div className="bh-empty compact">Bekleyen iş yok.</div> : null}
        </div>
      </section>

      <div className="bh-dashboard-lower-grid">
        <section className="bh-dashboard-small-panel"><header><h2>Bugün Yapılan İşler</h2><span>{todayModels.length}</span></header><div className="bh-dashboard-small-list">{todayModels.slice(0, 8).map((row) => <button type="button" key={row.id} onClick={() => openModule?.("boyahane", { tabKey: "raporlar" })}><ModelThumbnail src={row.imageUrl} alt={row.modelName} /><span><strong>{timeText(row.createdAt)} · {row.modelName}</strong><small>{row.colorCount} renk · {formatKg(row.totalKg)} · {row.actor}</small></span></button>)}{!todayModels.length ? <div className="bh-empty compact">Bugün kayıt yok.</div> : null}</div></section>
        <section className="bh-dashboard-small-panel"><header><h2>İmalata Hazırlananlar</h2><span>{preparedModels.length}</span></header><div className="bh-dashboard-small-list">{preparedModels.slice(0, 8).map((row) => <button type="button" key={row.id} onClick={() => openModule?.("boyahane", { tabKey: "uretim-gecmisi", actionContext: { boyahaneJobId: row.jobId || row.id } })}><ModelThumbnail src={row.imageUrl} alt={row.modelName} /><span><strong>{row.modelName}</strong><small>{row.colors.size} renk · {formatKg(row.totalKg)} · {waitText(row.createdAt)}</small></span></button>)}{!preparedModels.length ? <div className="bh-empty compact">Hazırlanan model yok.</div> : null}</div></section>
        <section className="bh-dashboard-small-panel"><header><h2>Son Kayıtlı Renkler</h2><button type="button" onClick={() => openModule?.("boyahane", { tabKey: "kayitli-renkler" })}>Tümü</button></header><div className="bh-dashboard-color-strip">{colors.slice(0, 10).map((row) => <button key={row.id} type="button" onClick={() => openModule?.("boyahane", { tabKey: "kayitli-renkler", actionContext: { registeredColorId: row.id } })}><i style={{ background: row.colorHex || "#cbd5e1" }} /><strong>{row.pantone || row.colorName || "Renk"}</strong><small>{safeArray(row.paintTypes).join(", ") || row.dyeType || "-"}</small></button>)}</div></section>
        <section className="bh-dashboard-small-panel"><header><h2>Son İşlem Logları</h2><button type="button" onClick={() => openModule?.("boyahane", { tabKey: "raporlar" })}>Tümü</button></header><div className="bh-dashboard-log-list">{logs.slice(0, 8).map((row) => <article key={row.id}><time>{formatDate(row.createdAt)}</time><span><strong>{row.actor || "KY ERP"}</strong><small>{row.description || row.actionType || row.action}</small></span></article>)}</div></section>
      </div>

      {assistantOpen ? (
        <div className="bh-assistant-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setAssistantOpen(false)}>
          <aside className="bh-assistant-drawer" role="dialog" aria-modal="true"><header><div><small>KY ERP</small><h2>Boyahane Asistanı</h2></div><button type="button" className="bh-btn" onClick={() => setAssistantOpen(false)}>Kapat</button></header><div className="bh-assistant-questions"><button type="button" onClick={() => answerQuestion("waiting")}>Hangi modeller hazır?</button><button type="button" onClick={() => answerQuestion("today")}>Bugün ne hazırlandı?</button><button type="button" onClick={() => answerQuestion("rf")}>RF toplamı nedir?</button><button type="button" onClick={() => answerQuestion("open")}>Açık işler neler?</button></div><div className="bh-assistant-answer">{assistantAnswer || "Bir soru seçin."}</div></aside>
        </div>
      ) : null}
    </div>
  );
}
