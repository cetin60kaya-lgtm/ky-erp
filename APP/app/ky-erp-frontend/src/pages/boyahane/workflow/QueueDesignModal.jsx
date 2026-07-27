import { useEffect, useMemo, useState } from "react";
import { getDesignModels, syncDesignDyehouse } from "../../../services/desenWorkflowApi";
import ModelThumbnail from "./ModelThumbnail";

export default function QueueDesignModal({ activeMainCompany, queuedModelIds = [], onClose, onQueued }) {
  const [models, setModels] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    setLoading(true); setError("");
    getDesignModels(activeMainCompany, { limit: 1000 })
      .then((payload) => live && setModels(payload?.rows || []))
      .catch((requestError) => live && setError(requestError.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [activeMainCompany, activeMainCompany?.slug]);

  const queued = useMemo(() => new Set(queuedModelIds.filter(Boolean)), [queuedModelIds]);
  const filtered = models.filter((model) => `${model.modelName || ""} ${model.modelCode || ""} ${model.companyName || ""} ${model.operations?.map((item) => item.printAreaName).join(" ") || ""}`.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
  const toggle = (id) => {
    if (queued.has(id)) return;
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  async function addToQueue() {
    if (!selectedIds.length) return;
    setBusy(true); setError("");
    const failures = [];
    for (const id of selectedIds) {
      try { await syncDesignDyehouse(activeMainCompany, id, true); }
      catch (requestError) { failures.push(`${models.find((item) => item.id === id)?.modelName || id}: ${requestError.message}`); }
    }
    setBusy(false);
    if (failures.length) {
      setError(`${selectedIds.length - failures.length} desen kuyruğa eklendi. Eklenemeyenler: ${failures.join(" | ")}`);
      if (selectedIds.length !== failures.length) await onQueued(false);
      return;
    }
    await onQueued(true);
  }

  return <div className="bh-modal" role="dialog" aria-modal="true"><div className="bh-modal-card bh-queue-modal">
    <button className="bh-modal-close" disabled={busy} onClick={onClose}>Kapat</button>
    <h2>Desenlerden Kuyruğa Ekle</h2>
    <p className="bh-queue-help">Desen Havuzu'ndaki tüm gerçek kayıtlar burada görünür. Bir veya daha fazla desen seçip doğrudan Boyahane kuyruğuna ekleyin.</p>
    <div className="bh-queue-tools"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Desen, firma veya baskı bölgesi ara" autoFocus /><button className="bh-btn" onClick={() => setSelectedIds(filtered.filter((item) => !queued.has(item.id)).map((item) => item.id))}>Görünenleri Seç</button><button className="bh-btn" onClick={() => setSelectedIds([])}>Seçimi Temizle</button></div>
    {error ? <div className="bh-notice danger">{error}</div> : null}
    {loading ? <div className="bh-empty">Desenler yükleniyor…</div> : <div className="bh-queue-list">{filtered.map((model) => <label className={`bh-queue-row ${selectedIds.includes(model.id) ? "selected" : ""} ${queued.has(model.id) ? "queued" : ""}`} key={model.id}>
      <input type="checkbox" disabled={queued.has(model.id)} checked={selectedIds.includes(model.id)} onChange={() => toggle(model.id)} />
      <ModelThumbnail src={model.mainImage?.previewUrl} alt={model.modelName} size="medium" />
      <span className="bh-queue-row-main"><strong>{model.modelName || "Adsız desen"}</strong><small>{model.companyName || "Firma yok"} • {model.operations?.map((item) => item.printAreaName).join(", ") || "Baskı bölgesi yok"}</small><small>Kanal {model.totals?.activeChannelCount || 0} • Renk {model.totals?.uniqueColorCount || 0} • Kalıp {model.totals?.totalMoldCount || 0}</small></span>
      <span className={`bh-status ${queued.has(model.id) ? "green" : "gray"}`}>{queued.has(model.id) ? "Kuyrukta" : "Havuzda"}</span>
    </label>)}{!filtered.length ? <div className="bh-empty">Aramaya uygun desen yok.</div> : null}</div>}
    <div className="bh-modal-actions"><span className="bh-queue-count">{models.length} desen • {selectedIds.length} seçili</span><button className="bh-btn" disabled={busy} onClick={onClose}>Vazgeç</button><button className="bh-btn primary" disabled={busy || !selectedIds.length} onClick={addToQueue}>{busy ? "Kuyruğa ekleniyor…" : `Kuyruğa Ekle (${selectedIds.length})`}</button></div>
  </div></div>;
}
