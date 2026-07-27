/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useState } from "react";
import {
  addBoyahaneJobColor,
  completeBoyahaneJob,
  deleteBoyahaneJobColor,
  getBoyahaneJob,
  getBoyahaneReports,
  listBoyahaneJobs,
  listBoyahaneLogs,
  listBoyahaneLots,
  listBoyahaneProducts,
  listBoyahaneProductions,
  listRegisteredColors,
  patchBoyahaneJob,
  startBoyahaneJob,
} from "../../../services/boyahaneWorkflowApi";
import JobCard from "./JobCard";
import ModelColorList from "./ModelColorList";
import RecipeWorkspace from "./RecipeWorkspace";
import AddColorModal from "./AddColorModal";
import ModelThumbnail from "./ModelThumbnail";
import QueueDesignModal from "./QueueDesignModal";
import { JOB_STATUS, formatKg, safeArray, statusTone } from "./boyahaneFormat";

export default function BoyahaneIsAkisiPage({ activeMainCompany }) {
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedColorId, setSelectedColorId] = useState("");
  const [registeredColors, setRegisteredColors] = useState([]);
  const [products, setProducts] = useState([]);
  const [lots, setLots] = useState([]);
  const [productions, setProductions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addColorOpen, setAddColorOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  const selectedJob = jobs.find((row) => row.id === selectedJobId) || null;
  const selectedColor = selectedJob?.colors?.find((row) => row.id === selectedColorId) || null;

  const load = useCallback(async (keepSelection = true) => {
    if (!activeMainCompany?.slug) return;
    setLoading(true); setError("");
    try {
      const [jobRows, colorRows, productRows, lotRows, productionRows, logRows, reports] = await Promise.all([
        listBoyahaneJobs(activeMainCompany), listRegisteredColors(activeMainCompany), listBoyahaneProducts(activeMainCompany), listBoyahaneLots(activeMainCompany), listBoyahaneProductions(activeMainCompany), listBoyahaneLogs(activeMainCompany), getBoyahaneReports(activeMainCompany),
      ]);
      const safeJobs = safeArray(jobRows);
      setJobs(safeJobs); setRegisteredColors(safeArray(colorRows)); setProducts(safeArray(productRows)); setLots(safeArray(lotRows)); setProductions(safeArray(productionRows)); setLogs(safeArray(logRows)); setSummary(reports?.summary || {});
      const nextJobId = keepSelection && safeJobs.some((row) => row.id === selectedJobId) ? selectedJobId : "";
      setSelectedJobId(nextJobId);
      if (nextJobId) {
        const nextJob = safeJobs.find((row) => row.id === nextJobId);
        setSelectedColorId((current) => nextJob?.colors?.some((row) => row.id === current) ? current : nextJob?.colors?.find((row) => row.status !== "COMPLETED")?.id || nextJob?.colors?.[0]?.id || "");
      } else setSelectedColorId("");
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [activeMainCompany?.slug, selectedJobId]);

  useEffect(() => { load(false); }, [activeMainCompany?.slug]);

  async function refreshSelected(nextColorId) {
    if (!selectedJobId) return load();
    try {
      const job = await getBoyahaneJob(activeMainCompany, selectedJobId);
      setJobs((current) => current.map((row) => row.id === job.id ? job : row));
      setSelectedColorId(nextColorId || job.colors?.find((row) => row.id === selectedColorId)?.id || job.colors?.find((row) => row.status !== "COMPLETED")?.id || job.colors?.[0]?.id || "");
      const [productionRows, logRows, report] = await Promise.all([listBoyahaneProductions(activeMainCompany), listBoyahaneLogs(activeMainCompany), getBoyahaneReports(activeMainCompany)]);
      setProductions(safeArray(productionRows)); setLogs(safeArray(logRows)); setSummary(report?.summary || {});
    } catch (requestError) { setError(requestError.message); }
  }

  function openJob(job) {
    setSelectedJobId(job.id);
    setSelectedColorId(job.colors?.find((row) => row.status !== "COMPLETED")?.id || job.colors?.[0]?.id || "");
    window.requestAnimationFrame(() => document.querySelector(".bh-workbench")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function startJob(job) {
    setBusy(true); setError("");
    try { await startBoyahaneJob(activeMainCompany, job.id, false); await load(); openJob({ ...job, status: "ACTIVE" }); }
    catch (requestError) {
      if (window.confirm(`${requestError.message}\n\nAktif işi beklemeye alıp bu işe geçilsin mi?`)) {
        try { await startBoyahaneJob(activeMainCompany, job.id, true); await load(); openJob({ ...job, status: "ACTIVE" }); }
        catch (retryError) { setError(retryError.message); }
      } else setError(requestError.message);
    } finally { setBusy(false); }
  }

  async function pauseJob(job) {
    setBusy(true); setError("");
    try { await patchBoyahaneJob(activeMainCompany, job.id, { status: "PAUSED" }); await load(); }
    catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  async function finishJob() {
    if (!selectedJob || !window.confirm(`${selectedJob.modelName} Boyahane işi tamamlansın mı?`)) return;
    setBusy(true); setError("");
    try { await completeBoyahaneJob(activeMainCompany, selectedJob.id); await load(); }
    catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  async function addColor(form) {
    setBusy(true); setError("");
    try { const row = await addBoyahaneJobColor(activeMainCompany, selectedJob.id, form); setAddColorOpen(false); await refreshSelected(row.id); }
    catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  async function deleteColor() {
    if (!selectedColor || !window.confirm(`${selectedColor.colorName} modelden silinsin mi?`)) return;
    setBusy(true); setError("");
    try { await deleteBoyahaneJobColor(activeMainCompany, selectedColor.id); await refreshSelected(); }
    catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }

  const activeJobs = jobs.filter((row) => row.status === "ACTIVE");
  const waitingJobs = jobs.filter((row) => ["WAITING", "PAUSED"].includes(row.status));
  const today = new Date().toISOString().slice(0, 10);
  const completedJobs = jobs.filter((row) => row.status === "COMPLETED" && String(row.completedAt || row.updatedAt || "").startsWith(today));
  const completedHistory = jobs.filter((row) => row.status === "COMPLETED" && !String(row.completedAt || row.updatedAt || "").startsWith(today));
  const jobIndex = jobs.findIndex((row) => row.id === selectedJobId);
  const chooseRelativeJob = (offset) => { if (!jobs.length) return; const next = jobs[(jobIndex + offset + jobs.length) % jobs.length]; openJob(next); };
  const chooseNextColor = () => {
    if (!selectedJob?.colors?.length) return;
    const index = selectedJob.colors.findIndex((row) => row.id === selectedColorId);
    const pending = [...selectedJob.colors.slice(index + 1), ...selectedJob.colors.slice(0, index + 1)].find((row) => row.status !== "COMPLETED");
    if (pending) setSelectedColorId(pending.id);
  };

  return (
    <div className="bh-flow-page">
      <div className="bh-flow-actions"><div><strong>Boyahane İş Kuyruğu</strong><span>Desen Havuzu'ndan seçerek doğrudan iş akışına ekleyin.</span></div><button className="bh-btn primary" onClick={() => setQueueOpen(true)}>+ Desenlerden Kuyruğa Ekle</button></div>
      <div className="bh-kpi-row">
        {[['Aktif İş', summary.activeJobs ?? activeJobs.length], ['Bekleyen İş', summary.waitingJobs ?? waitingJobs.length], ['Bugün Tamamlanan', summary.completedToday ?? completedJobs.length], ['Hazırlanacak Renk', summary.pendingColors ?? jobs.reduce((sum, row) => sum + Number(row.pendingColorCount || 0), 0)], ['Bugünkü Hazırlanan Boya', formatKg(summary.preparedKgToday || 0)]].map(([label, value]) => <div className="bh-kpi" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      {error ? <div className="bh-notice danger">{error}</div> : null}
      {loading ? <div className="bh-empty large">Gerçek Boyahane işleri yükleniyor…</div> : null}
      {!loading && !jobs.length ? <div className="bh-empty large"><strong>Boyahane kuyruğunda iş yok.</strong><span>Yukarıdaki “Desenlerden Kuyruğa Ekle” düğmesiyle Desen Havuzu'ndan iş seçin.</span><button className="bh-btn primary" onClick={() => setQueueOpen(true)}>Desen Seç</button></div> : null}
      {!loading && jobs.length ? <div className="bh-job-sections">
        {[['Aktif İş', activeJobs], ['Bekleyen İşler', waitingJobs], ['Bugün Tamamlananlar', completedJobs], ['Tamamlanan İş Geçmişi', completedHistory]].map(([title, rows]) => <section className="bh-card" key={title}><div className="bh-card-head"><div><h2>{title}</h2><small>{rows.length} iş</small></div></div><div className="bh-card-body bh-job-list">{rows.map((job) => <JobCard key={job.id} job={job} onOpen={openJob} onStart={startJob} onPause={pauseJob} />)}{!rows.length ? <div className="bh-empty">Bu bölümde iş yok.</div> : null}</div></section>)}
      </div> : null}
      {selectedJob ? <section className="bh-workbench">
        <div className="bh-workbench-toolbar">
          <label className="bh-field grow"><span>Model Seç</span><select value={selectedJobId} onChange={(event) => openJob(jobs.find((row) => row.id === event.target.value))}>{jobs.map((row) => <option key={row.id} value={row.id}>{row.modelName} • {row.companyName || 'Firma yok'} • {row.printRegion || 'Baskı yok'} • {row.orderNo || 'Sipariş yok'}</option>)}</select></label>
          <span className={`bh-status ${statusTone(selectedJob.status)}`}>{JOB_STATUS[selectedJob.status] || selectedJob.status}</span>
          <button className="bh-btn" onClick={() => chooseRelativeJob(-1)}>← Önceki Model</button><button className="bh-btn" onClick={() => chooseRelativeJob(1)}>Sonraki Model →</button><button className="bh-btn primary" disabled={busy || selectedJob.status === "COMPLETED"} onClick={finishJob}>Modeli Tamamla</button>
        </div>
        <div className="bh-model-summary"><ModelThumbnail src={selectedJob.imageUrl} alt={selectedJob.modelName} size="large" className="bh-job-image large" /><div><h2>{selectedJob.modelName}</h2><p>{selectedJob.companyName || "Firma bilgisi yok"} • {selectedJob.orderNo || "Sipariş yok"} • {selectedJob.printRegion || "Baskı bölgesi yok"}</p><div className="bh-summary-facts"><span>Planlanan <b>{Number(selectedJob.plannedQuantity || 0).toLocaleString('tr-TR')}</b></span><span>Kanal <b>{selectedJob.channelCount || 0}</b></span><span>Benzersiz renk <b>{selectedJob.uniqueColorCount || 0}</b></span><span>Kalıp <b>{selectedJob.moldCount || 0}</b></span><span>Plan boya <b>{formatKg(selectedJob.plannedPaintKg)}</b></span><span>Tamamlanan <b>{selectedJob.preparedColorCount || 0} / {selectedJob.colors?.length || 0}</b></span></div></div></div>
        <div className="bh-work-grid"><ModelColorList colors={safeArray(selectedJob.colors)} selectedId={selectedColorId} onSelect={setSelectedColorId} onAdd={() => setAddColorOpen(true)} onDelete={deleteColor} /><RecipeWorkspace activeMainCompany={activeMainCompany} job={selectedJob} color={selectedColor} registeredColors={registeredColors} products={products} lots={lots} productions={productions} logs={logs} onSaved={refreshSelected} onNext={chooseNextColor} onLotsChanged={async () => setLots(safeArray(await listBoyahaneLots(activeMainCompany)))} /></div>
      </section> : null}
      {addColorOpen ? <AddColorModal colors={registeredColors} job={selectedJob} busy={busy} onCancel={() => setAddColorOpen(false)} onSave={addColor} /> : null}
      {queueOpen ? <QueueDesignModal activeMainCompany={activeMainCompany} queuedModelIds={jobs.map((row) => row.designId || row.modelCardId)} onClose={() => setQueueOpen(false)} onQueued={async (close) => { await load(false); if (close) setQueueOpen(false); }} /> : null}
    </div>
  );
}
