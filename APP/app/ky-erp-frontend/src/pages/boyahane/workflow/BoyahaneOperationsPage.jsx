/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useState } from "react";
import {
  addBoyahaneJobColor,
  completeBoyahaneJob,
  getBoyahaneJob,
  listBoyahaneJobs,
  listBoyahaneLogs,
  listBoyahaneLots,
  listBoyahaneProducts,
  listBoyahaneProductions,
  listRegisteredColors,
  patchBoyahaneJob,
  patchBoyahaneJobColor,
  startBoyahaneJob,
} from "../../../services/boyahaneWorkflowApi";
import AddColorModal from "./AddColorModal";
import ModelColorList from "./ModelColorList";
import ModelThumbnail from "./ModelThumbnail";
import QueueDesignModal from "./QueueDesignModal";
import RecipeWorkspace from "./RecipeWorkspace";
import { formatDate, formatKg, safeArray, statusTone } from "./boyahaneFormat";

const TABS = [
  ["prepare", "Boyası Hazırlanacaklar"],
  ["manufacturing-waiting", "İmalat Bekleyenler"],
  ["active", "Aktif İmalatlar"],
  ["completed", "Tamamlananlar"],
];

function prepared(job) {
  const rows = safeArray(job?.colors).filter(
    (row) => String(row.status).toUpperCase() !== "CANCELLED",
  );
  return (
    rows.length > 0 &&
    rows.every((row) => String(row.status).toUpperCase() === "COMPLETED")
  );
}

function bucket(job) {
  if (String(job.status).toUpperCase() === "COMPLETED") return "completed";
  if (job.enteredProductionAt || job.manufacturingStatus === "ACTIVE") return "active";
  if (prepared(job)) return "manufacturing-waiting";
  return "prepare";
}

function waitText(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const hours = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 3_600_000),
  );
  return hours < 24 ? `${hours} saat` : `${Math.floor(hours / 24)} gün`;
}

function RfPanel({ activeMainCompany, job, color, jobs, onSaved }) {
  const [form, setForm] = useState({
    sourceJobId: "",
    sourceKg: "",
    usedKg: "",
    tlValue: "",
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!color) return null;
  const rows = safeArray(color.rfUsage);

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const sourceKg = Number(form.sourceKg || 0);
      const usedKg = Number(form.usedKg || 0);
      if (
        !form.sourceJobId ||
        sourceKg <= 0 ||
        usedKg <= 0 ||
        usedKg > sourceKg
      ) {
        throw new Error(
          "Kaynak model, kaynak kg ve kullanılan kg doğru girilmelidir.",
        );
      }
      const remainingKg = Math.max(0, sourceKg - usedKg);
      const source = jobs.find((row) => row.id === form.sourceJobId);
      const record = {
        id: globalThis.crypto?.randomUUID?.() || `rf-${Date.now()}`,
        sourceJobId: form.sourceJobId,
        sourceModelName: source?.modelName || "",
        targetJobId: job.id,
        targetModelName: job.modelName,
        colorId: color.id,
        colorName: color.colorName,
        sourceKg,
        usedKg,
        remainingKg,
        tlValue: Number(form.tlValue || 0),
        status: remainingKg > 0 ? "RF" : "BITTI",
        createdAt: new Date().toISOString(),
      };
      await patchBoyahaneJobColor(activeMainCompany, color.id, {
        rfUsage: [...rows, record],
      });
      setMessage(
        "RF kullanım kaydı oluşturuldu. Bileşenler ikinci kez stoktan düşürülmedi.",
      );
      setForm({ sourceJobId: "", sourceKg: "", usedKg: "", tlValue: "" });
      await onSaved?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bh-card bh-rf-panel">
      <div className="bh-card-head">
        <div>
          <h2>RF Boya Değerlendirme</h2>
          <small>RF ayrı raf veya stok değildir; daha önce hazırlanmış karışım boyanın başka imalatta değerlendirilmesidir.</small>
        </div>
      </div>
      <div className="bh-card-body">
        {error ? <div className="bh-notice danger">{error}</div> : null}
        {message ? <div className="bh-notice success">{message}</div> : null}
        <div className="bh-form-grid five">
          <label className="bh-field wide">
            <span>Kaynak model</span>
            <select
              value={form.sourceJobId}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sourceJobId: event.target.value,
                }))
              }
            >
              <option value="">Kaynak modeli seç</option>
              {jobs
                .filter((row) => row.id !== job.id)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.modelName} · {row.companyName || "-"}
                  </option>
                ))}
            </select>
          </label>
          <label className="bh-field"><span>Kaynak toplam KG</span><input type="number" min="0.001" step="0.001" value={form.sourceKg} onChange={(event) => setForm((current) => ({ ...current, sourceKg: event.target.value }))} /></label>
          <label className="bh-field"><span>Bu işte kullanılan KG</span><input type="number" min="0.001" step="0.001" value={form.usedKg} onChange={(event) => setForm((current) => ({ ...current, usedKg: event.target.value }))} /></label>
          <label className="bh-field"><span>Hazırlama anındaki gerçek TL değeri</span><input type="number" min="0" step="0.01" value={form.tlValue} onChange={(event) => setForm((current) => ({ ...current, tlValue: event.target.value }))} /></label>
          <button type="button" className="bh-btn primary bh-field-button" disabled={busy} onClick={save}>RF Kaydet</button>
        </div>
        {rows.length ? (
          <div className="bh-table-wrap">
            <table>
              <thead><tr><th>Tarih</th><th>Kaynak model</th><th>Kullanılan model</th><th>Renk</th><th>Kullanılan</th><th>Kalan</th><th>TL</th><th>Durum</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>{row.sourceModelName || "-"}</td>
                    <td>{row.targetModelName || job.modelName}</td>
                    <td>{row.colorName || color.colorName}</td>
                    <td>{formatKg(row.usedKg)}</td>
                    <td>{formatKg(row.remainingKg)}</td>
                    <td>{Number(row.tlValue || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</td>
                    <td><span className={`bh-status ${row.status === "BITTI" ? "gray" : "green"}`}>{row.status === "BITTI" ? "Bitti" : "RF"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bh-empty">Bu renk için RF kullanımı yok.</div>
        )}
      </div>
    </section>
  );
}

export default function BoyahaneOperationsPage({
  activeMainCompany,
  moduleActionContext,
}) {
  const [jobs, setJobs] = useState([]);
  const [registeredColors, setRegisteredColors] = useState([]);
  const [products, setProducts] = useState([]);
  const [lots, setLots] = useState([]);
  const [productions, setProductions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedColorId, setSelectedColorId] = useState("");
  const [tab, setTab] = useState("prepare");
  const [addColorOpen, setAddColorOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (keepSelection = true) => {
    if (!activeMainCompany?.slug) return;
    setLoading(true);
    setError("");
    try {
      const [
        jobRows,
        colorRows,
        productRows,
        lotRows,
        productionRows,
        logRows,
      ] = await Promise.all([
        listBoyahaneJobs(activeMainCompany),
        listRegisteredColors(activeMainCompany),
        listBoyahaneProducts(activeMainCompany),
        listBoyahaneLots(activeMainCompany),
        listBoyahaneProductions(activeMainCompany),
        listBoyahaneLogs(activeMainCompany),
      ]);
      const productionJobs = safeArray(jobRows).filter(
        (row) =>
          !["SAMPLE", "TRIAL"].includes(
            String(row.jobType || row.workflowType || row.type || "PRODUCTION").toUpperCase(),
          ),
      );
      setJobs(productionJobs);
      setRegisteredColors(safeArray(colorRows));
      setProducts(safeArray(productRows));
      setLots(safeArray(lotRows));
      setProductions(safeArray(productionRows));
      setLogs(safeArray(logRows));

      const requested = moduleActionContext?.boyahaneJobId;
      const nextId =
        requested && productionJobs.some((row) => row.id === requested)
          ? requested
          : keepSelection && productionJobs.some((row) => row.id === selectedJobId)
            ? selectedJobId
            : "";
      setSelectedJobId(nextId);
      if (nextId) {
        const job = productionJobs.find((row) => row.id === nextId);
        setSelectedColorId((current) =>
          safeArray(job?.colors).some((row) => row.id === current)
            ? current
            : safeArray(job?.colors)[0]?.id || "",
        );
      } else {
        setSelectedColorId("");
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany?.slug, moduleActionContext?.nonce, selectedJobId]);

  useEffect(() => { load(false); }, [activeMainCompany?.slug, moduleActionContext?.nonce]);

  const selectedJob = jobs.find((row) => row.id === selectedJobId) || null;
  const selectedColor = safeArray(selectedJob?.colors).find(
    (row) => row.id === selectedColorId,
  ) || null;
  const visibleJobs = jobs.filter((job) => bucket(job) === tab);

  function openJob(job) {
    setSelectedJobId(job.id);
    setSelectedColorId(
      safeArray(job.colors).find(
        (row) => !["COMPLETED", "CANCELLED"].includes(String(row.status).toUpperCase()),
      )?.id || safeArray(job.colors)[0]?.id || "",
    );
    window.requestAnimationFrame(() =>
      document.querySelector(".bh-operation-workspace")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }

  async function refreshSelected(nextColorId) {
    if (!selectedJobId) return load();
    try {
      const row = await getBoyahaneJob(activeMainCompany, selectedJobId);
      setJobs((current) => current.map((job) => (job.id === row.id ? row : job)));
      setSelectedColorId(
        nextColorId ||
          safeArray(row.colors).find((item) => item.id === selectedColorId)?.id ||
          safeArray(row.colors)[0]?.id ||
          "",
      );
      const [productionRows, logRows, lotRows] = await Promise.all([
        listBoyahaneProductions(activeMainCompany),
        listBoyahaneLogs(activeMainCompany),
        listBoyahaneLots(activeMainCompany),
      ]);
      setProductions(safeArray(productionRows));
      setLogs(safeArray(logRows));
      setLots(safeArray(lotRows));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function startJob(job) {
    setBusy(true);
    setError("");
    try {
      await startBoyahaneJob(activeMainCompany, job.id, true);
      await load();
      openJob({ ...job, status: "ACTIVE" });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function addColor(form) {
    setBusy(true);
    setError("");
    try {
      const row = await addBoyahaneJobColor(activeMainCompany, selectedJob.id, {
        ...form,
        jobType: "PRODUCTION",
      });
      setAddColorOpen(false);
      await refreshSelected(row.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelColor() {
    if (
      !selectedColor ||
      !window.confirm(
        `${selectedColor.colorName || "Renk"} silinmeyecek; iptal durumuna alınsın mı?`,
      )
    ) return;
    setBusy(true);
    setError("");
    try {
      await patchBoyahaneJobColor(activeMainCompany, selectedColor.id, {
        status: "CANCELLED",
        cancelledAt: new Date().toISOString(),
        cancelReason: "İmalat boya işinden kullanıcı tarafından çıkarıldı",
      });
      await refreshSelected();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function enterManufacturing() {
    if (
      !selectedJob ||
      !window.confirm(
        `${selectedJob.modelName} imalata girdi olarak işaretlensin mi? Kilogram tekrar sorulmayacaktır.`,
      )
    ) return;
    setBusy(true);
    setError("");
    try {
      await patchBoyahaneJob(activeMainCompany, selectedJob.id, {
        enteredProductionAt: new Date().toISOString(),
        manufacturingStatus: "ACTIVE",
      });
      await load();
      setTab("active");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function finishJob() {
    if (
      !selectedJob ||
      !window.confirm(`${selectedJob.modelName} tamamlandı olarak kapatılsın mı?`)
    ) return;
    setBusy(true);
    setError("");
    try {
      await completeBoyahaneJob(activeMainCompany, selectedJob.id);
      setSelectedJobId("");
      await load(false);
      setTab("completed");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function chooseNextColor() {
    if (!selectedJob?.colors?.length) return;
    const index = selectedJob.colors.findIndex((row) => row.id === selectedColorId);
    const next = [
      ...selectedJob.colors.slice(index + 1),
      ...selectedJob.colors.slice(0, index + 1),
    ].find(
      (row) => !["COMPLETED", "CANCELLED"].includes(String(row.status).toUpperCase()),
    );
    if (next) setSelectedColorId(next.id);
  }

  return (
    <div className="bh-operation-page production">
      <section className="bh-operation-intro">
        <div>
          <small>İMALAT BOYALARI</small>
          <h2>İmalat Boyaları</h2>
          <p>Modelin bütün renk kanalları aynı çalışma alanında izlenir. Fiziksel hazırlama stok düşürür; imalata girişte kilogram yeniden sorulmaz.</p>
        </div>
        <button type="button" className="bh-btn primary" onClick={() => setQueueOpen(true)}>+ Desenden İmalat İşi Aç</button>
      </section>

      <nav className="bh-operation-tabs">
        {TABS.map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => {
              setTab(key);
              setSelectedJobId("");
            }}
          >
            {label}<b>{jobs.filter((job) => bucket(job) === key).length}</b>
          </button>
        ))}
      </nav>
      {error ? <div className="bh-notice danger">{error}</div> : null}
      {loading ? <div className="bh-empty large">İmalat boya işleri yükleniyor…</div> : null}

      <div className="bh-operation-card-grid">
        {visibleJobs.map((job) => (
          <article className="bh-operation-card" key={job.id}>
            <button type="button" className="bh-model-image-button" onClick={() => openJob(job)}><ModelThumbnail src={job.imageUrl} alt={job.modelName} size="large" /></button>
            <div>
              <span className={`bh-status ${statusTone(job.status)}`}>{job.status}</span>
              <h3>{job.modelName}</h3>
              <p>{job.companyName || "Firma yok"} · {job.orderNo || "Sipariş yok"}</p>
              <dl>
                <div><dt>Toplam renk</dt><dd>{safeArray(job.colors).filter((row) => row.status !== "CANCELLED").length}</dd></div>
                <div><dt>Hazır</dt><dd>{job.preparedColorCount || 0}</dd></div>
                <div><dt>Eksik</dt><dd>{job.pendingColorCount || 0}</dd></div>
                <div><dt>Hazır boya</dt><dd>{formatKg(job.preparedKg || job.plannedPaintKg)}</dd></div>
                <div><dt>Son işlem</dt><dd>{formatDate(job.updatedAt)}</dd></div>
                <div><dt>Bekleme</dt><dd>{waitText(job.createdAt)}</dd></div>
              </dl>
              <div className="bh-row-actions">
                <button type="button" className="bh-btn primary" onClick={() => openJob(job)}>İşi Aç</button>
                {String(job.status).toUpperCase() === "WAITING" ? <button type="button" className="bh-btn" disabled={busy} onClick={() => startJob(job)}>Çalışmaya Başla</button> : null}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!visibleJobs.length && !loading ? <div className="bh-empty large">Bu bölümde imalat boya işi bulunmuyor.</div> : null}

      {selectedJob ? (
        <section className="bh-operation-workspace">
          <header className="bh-operation-model-head">
            <ModelThumbnail src={selectedJob.imageUrl} alt={selectedJob.modelName} size="large" />
            <div>
              <small>{bucket(selectedJob) === "completed" ? "TAMAMLANAN İMALAT" : "İMALAT BOYASI TAM ÇALIŞMA EKRANI"}</small>
              <h2>{selectedJob.modelName}</h2>
              <p>{selectedJob.companyName || "-"} · {selectedJob.orderNo || "-"} · {selectedJob.printRegion || "Tüm baskı bölgeleri"}</p>
              <div className="bh-summary-facts">
                <span>Toplam renk <b>{safeArray(selectedJob.colors).filter((row) => row.status !== "CANCELLED").length}</b></span>
                <span>Hazır <b>{selectedJob.preparedColorCount || 0}</b></span>
                <span>Eksik <b>{selectedJob.pendingColorCount || 0}</b></span>
                <span>Kanal <b>{selectedJob.channelCount || 0}</b></span>
              </div>
            </div>
            <div className="bh-head-actions">
              <button type="button" className="bh-btn" onClick={() => setSelectedJobId("")}>Listeye Dön</button>
              {prepared(selectedJob) && !selectedJob.enteredProductionAt && bucket(selectedJob) !== "completed" ? <button type="button" className="bh-btn primary" disabled={busy} onClick={enterManufacturing}>İmalata Girdi</button> : null}
              {bucket(selectedJob) !== "completed" ? <button type="button" className="bh-btn primary" disabled={busy} onClick={finishJob}>Modeli Tamamla</button> : null}
            </div>
          </header>

          {bucket(selectedJob) === "completed" ? (
            <section className="bh-card">
              <div className="bh-card-head"><div><h2>İşlem Geçmişi</h2><small>Tamamlanan modelde reçete tablosu tekrar gösterilmez.</small></div></div>
              <div className="bh-card-body bh-activity-list">
                {logs
                  .filter(
                    (row) =>
                      row.entityId === selectedJob.id ||
                      safeArray(selectedJob.colors).some(
                        (color) => color.id === row.entityId,
                      ),
                  )
                  .map((row) => (
                    <article key={row.id}>
                      <time>{formatDate(row.createdAt)}</time>
                      <div><strong>{row.actor || "KY ERP"}</strong><p>{row.description || row.actionType}</p></div>
                    </article>
                  ))}
              </div>
            </section>
          ) : (
            <>
              <div className="bh-work-grid">
                <ModelColorList colors={safeArray(selectedJob.colors)} selectedId={selectedColorId} onSelect={setSelectedColorId} onAdd={() => setAddColorOpen(true)} onDelete={cancelColor} />
                <RecipeWorkspace activeMainCompany={activeMainCompany} job={selectedJob} color={selectedColor} registeredColors={registeredColors} products={products.filter((row) => row.approvalStatus === "APPROVED")} lots={lots} productions={productions} logs={logs} onSaved={refreshSelected} onNext={chooseNextColor} onLotsChanged={async () => setLots(safeArray(await listBoyahaneLots(activeMainCompany)))} />
              </div>
              <RfPanel activeMainCompany={activeMainCompany} job={selectedJob} color={selectedColor} jobs={jobs} onSaved={refreshSelected} />
            </>
          )}
        </section>
      ) : null}

      {addColorOpen ? <AddColorModal colors={registeredColors} job={selectedJob} busy={busy} onCancel={() => setAddColorOpen(false)} onSave={addColor} /> : null}
      {queueOpen ? <QueueDesignModal activeMainCompany={activeMainCompany} jobMode="production" queuedModelIds={jobs.map((row) => row.designId || row.modelCardId)} onClose={() => setQueueOpen(false)} onQueued={async (close) => { await load(false); if (close) setQueueOpen(false); }} /> : null}
    </div>
  );
}
