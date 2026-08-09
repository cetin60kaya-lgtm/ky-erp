import { useEffect, useMemo, useState } from "react";
import { getDesignModels, syncDesignDyehouse } from "../../../services/desenWorkflowApi";
import { createBoyahaneSampleFromDesign } from "../../../services/boyahaneSampleApi";
import { listBoyahaneJobs } from "../../../services/boyahaneWorkflowApi";
import ModelThumbnail from "./ModelThumbnail";
import { safeArray } from "./boyahaneFormat";

function workType(job) {
  const value = String(job?.jobType || job?.workflowType || job?.type || "PRODUCTION").toUpperCase();
  return ["SAMPLE", "TRIAL"].includes(value) ? "sample" : "production";
}

export default function QueueDesignModal({
  activeMainCompany,
  queuedModelIds = [],
  jobMode = "production",
  onClose,
  onQueued,
}) {
  const [models, setModels] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    Promise.all([
      getDesignModels(activeMainCompany, { limit: 1000 }),
      listBoyahaneJobs(activeMainCompany),
    ])
      .then(([payload, jobRows]) => {
        if (!live) return;
        setModels(payload?.rows || []);
        setJobs(safeArray(jobRows));
      })
      .catch((requestError) => {
        if (!live) return;
        console.error("Boyahane design queue load failed", requestError);
        setError("Desen ve mevcut Boyahane işleri karşılaştırılamadı. Yeniden deneyin.");
      })
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [activeMainCompany, activeMainCompany?.slug]);

  const sampleMode = jobMode === "sample";
  const requestedType = sampleMode ? "sample" : "production";
  const jobMap = useMemo(() => {
    const map = new Map();
    jobs.forEach((job) => {
      const designId = String(job.designId || job.modelCardId || "");
      if (!designId) return;
      const current = map.get(designId) || { sample: null, production: null };
      current[workType(job)] = job;
      map.set(designId, current);
    });
    return map;
  }, [jobs]);
  const queued = useMemo(() => new Set(queuedModelIds.filter(Boolean).map(String)), [queuedModelIds]);
  const filtered = models.filter((model) => `${model.modelName || ""} ${model.modelCode || ""} ${model.companyName || ""} ${model.operations?.map((item) => item.printAreaName).join(" ") || ""}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));

  function existingFor(modelId, type = requestedType) {
    return jobMap.get(String(modelId))?.[type] || null;
  }

  function isDuplicate(id) {
    return Boolean(existingFor(id) || queued.has(String(id)));
  }

  const toggle = (id) => {
    if (isDuplicate(id)) return;
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  async function addToQueue() {
    if (!selectedIds.length) return;
    setBusy(true);
    setError("");
    const failures = [];
    for (const id of selectedIds) {
      try {
        if (existingFor(id)) {
          failures.push(`${models.find((item) => item.id === id)?.modelName || id}: aynı tür iş zaten açık`);
          continue;
        }
        if (sampleMode) {
          await createBoyahaneSampleFromDesign(activeMainCompany, id);
        } else {
          await syncDesignDyehouse(activeMainCompany, id, true);
        }
      } catch (requestError) {
        failures.push(`${models.find((item) => item.id === id)?.modelName || id}: ${requestError.message}`);
      }
    }
    setBusy(false);
    if (failures.length) {
      setError(`${selectedIds.length - failures.length} iş oluşturuldu. Oluşturulmayanlar: ${failures.join(" | ")}`);
      if (selectedIds.length !== failures.length) await onQueued(false);
      return;
    }
    await onQueued(true);
  }

  const selectedModels = selectedIds.map((id) => models.find((row) => row.id === id)).filter(Boolean);

  return (
    <div className="bh-modal" role="dialog" aria-modal="true">
      <div className="bh-modal-card bh-queue-modal">
        <button className="bh-modal-close" disabled={busy} onClick={onClose}>Kapat</button>
        <h2>{sampleMode ? "Desenden Numune İşi Aç" : "Desenden İmalat İşi Aç"}</h2>
        <p className="bh-queue-help">Model, görsel, kanal ve mevcut iş durumu kaydetmeden önce kontrol edilir. Aynı modelin aynı tür işi ikinci kez oluşturulmaz; numune ve imalat birbirini engellemez.</p>

        <div className="bh-queue-tools">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Desen, firma veya baskı bölgesi ara" autoFocus />
          <button className="bh-btn" onClick={() => setSelectedIds(filtered.filter((item) => !isDuplicate(item.id)).map((item) => item.id))}>Uygunları Seç</button>
          <button className="bh-btn" onClick={() => setSelectedIds([])}>Seçimi Temizle</button>
        </div>

        {selectedModels.length ? (
          <section className="bh-queue-review">
            <strong>Açılacak iş türü: {sampleMode ? "Numune" : "İmalat Boyası"}</strong>
            <span>{selectedModels.length} model seçildi · {selectedModels.reduce((sum, model) => sum + Number(model.totals?.activeChannelCount || 0), 0)} kanal · {selectedModels.reduce((sum, model) => sum + Number(model.totals?.uniqueColorCount || 0), 0)} renk</span>
          </section>
        ) : null}

        {error ? <div className="bh-notice danger">{error}</div> : null}
        {loading ? (
          <div className="bh-empty compact">Desenler ve mevcut işler kontrol ediliyor…</div>
        ) : (
          <div className="bh-queue-list">
            {filtered.map((model) => {
              const work = jobMap.get(String(model.id)) || {};
              const duplicate = isDuplicate(model.id);
              const activeOperations = safeArray(model.operations);
              const approvedColors = activeOperations.flatMap((operation) => safeArray(operation.colorGroups)).filter((color) => color.registeredColorId).length;
              return (
                <label className={`bh-queue-row ${selectedIds.includes(model.id) ? "selected" : ""} ${duplicate ? "queued" : ""}`} key={model.id}>
                  <input type="checkbox" disabled={duplicate} checked={selectedIds.includes(model.id)} onChange={() => toggle(model.id)} />
                  <ModelThumbnail src={model.mainImage?.thumbnailUrl || model.mainImage?.previewUrl} alt={model.modelName} size="medium" />
                  <span className="bh-queue-row-main">
                    <strong>{model.modelName || "Adsız desen"}</strong>
                    <small>{model.companyName || "Firma yok"} • {activeOperations.map((item) => item.printAreaName).join(", ") || "Baskı bölgesi yok"}</small>
                    <small>Kanal {model.totals?.activeChannelCount || 0} • Renk {model.totals?.uniqueColorCount || 0} • Onaylı renk {approvedColors}</small>
                    <span className="bh-queue-existing">
                      <em className={work.sample ? "exists" : ""}>Numune: {work.sample ? `${work.sample.status || "Açık"}` : "Yok"}</em>
                      <em className={work.production ? "exists" : ""}>İmalat: {work.production ? `${work.production.status || "Açık"}` : "Yok"}</em>
                    </span>
                  </span>
                  <span className={`bh-status ${duplicate ? "green" : "gray"}`}>{duplicate ? "Mevcut işe git" : "İş açılabilir"}</span>
                </label>
              );
            })}
            {!filtered.length ? <div className="bh-empty compact">Aramaya uygun desen yok.</div> : null}
          </div>
        )}
        <div className="bh-modal-actions">
          <span className="bh-queue-count">{models.length} desen • {selectedIds.length} seçili</span>
          <button className="bh-btn" disabled={busy} onClick={onClose}>Vazgeç</button>
          <button className="bh-btn primary" disabled={busy || !selectedIds.length} onClick={addToQueue}>{busy ? "Kontrol edilip oluşturuluyor…" : `${sampleMode ? "Numune İşi Aç" : "İmalat İşi Aç"} (${selectedIds.length})`}</button>
        </div>
      </div>
    </div>
  );
}
