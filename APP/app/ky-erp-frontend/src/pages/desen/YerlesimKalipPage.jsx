import { useCallback, useEffect, useMemo, useState } from "react";
import { FileImage, Filter, Layers3, LoaderCircle, Pencil, RefreshCw, Ruler, Search, Upload } from "lucide-react";
import { getDesignCompanies, getDesignModels, updateDesignOperation, uploadDesignWorkflowFile } from "../../services/desenWorkflowApi";
import { assetUrl, EmptyState, ImagePreview, Pager, StatusBadge, WideModal } from "./DesenWorkflowShared";

export default function YerlesimKalipPage({ activeMainCompany }) {
  const [models, setModels] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [active, setActive] = useState(null);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ q: "", companyId: "", placementStatus: "WAITING", moldType: "" });
  const load = useCallback(async () => {
    if (!activeMainCompany?.slug) return;
    setLoading(true);
    try {
      const [payload, firms] = await Promise.all([getDesignModels(activeMainCompany, { q: filters.q, companyId: filters.companyId, placementStatus: filters.placementStatus }), getDesignCompanies(activeMainCompany)]);
      setModels(payload?.rows || []); setCompanies(firms || []);
      setMessage("");
    } catch (error) { setMessage(error?.message || "Yerleşim kuyruğu yüklenemedi."); }
    finally { setLoading(false); }
  }, [activeMainCompany, filters.companyId, filters.placementStatus, filters.q]);
  useEffect(() => { const timer = window.setTimeout(load, 200); return () => window.clearTimeout(timer); }, [activeMainCompany?.slug, filters.q, filters.companyId, filters.placementStatus, load]);
  useEffect(() => { setPage(0); }, [filters.q, filters.companyId, filters.placementStatus, filters.moldType]);
  const rows = useMemo(() => models.flatMap((model) => (Array.isArray(model.operations) ? model.operations : []).map((operation) => ({ model, operation }))).filter(({ operation }) => !filters.moldType || operation.moldType === filters.moldType), [models, filters.moldType]);
  const pageCount = Math.ceil(rows.length / 100);
  const visibleRows = rows.slice(page * 100, page * 100 + 100);
  return <>
    <section className="dsg-toolbar-card"><div className="dsg-filter-grid technical"><label className="dsg-search"><Search size={16} /><input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Model veya firma ara" /></label><select value={filters.companyId} onChange={(event) => setFilters((current) => ({ ...current, companyId: event.target.value }))}><option value="">Tüm firmalar</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select><select value={filters.placementStatus} onChange={(event) => setFilters((current) => ({ ...current, placementStatus: event.target.value }))}><option value="">Tüm yerleşimler</option><option value="WAITING">Yerleşim Bekliyor</option><option value="READY">Yerleşim Hazır</option><option value="REVISION_PENDING">Revize Bekliyor</option></select><select value={filters.moldType} onChange={(event) => setFilters((current) => ({ ...current, moldType: event.target.value }))}><option value="">Tüm kalıp tipleri</option><option value="K_BOY">K-Boy</option><option value="B_BOY">B-Boy</option><option value="SPECIAL">Özel</option><option value="UNDEFINED">Belirsiz</option></select><button className="dsg-btn" onClick={load}><RefreshCw size={16} /> Yenile</button></div></section>
    {message && <div className="dsg-page-message">{message}</div>}
    <section className="dsg-card"><header className="dsg-card-head"><div><h2>Teknik Yerleşim Kuyruğu</h2><p>Model ve firma bilgileri Desen kaydından gelir; yalnız baskı bölgesi bazlı teknik iş tamamlanır.</p></div><span>{rows.length} baskı bölgesi</span></header>{loading ? <div className="dsg-loading"><LoaderCircle className="spin" /> Teknik kuyruk yükleniyor…</div> : !rows.length ? <EmptyState icon={Filter} title="Bu filtrede teknik iş yok" text="Yerleşim bekleyen baskı bölgeleri burada listelenir." /> : <><div className="dsg-tech-list"><div className="dsg-tech-row head"><span>Görsel</span><span>Model</span><span>Firma</span><span>Baskı Bölgesi</span><span>Kalıp Tipi</span><span>Kanal / Kalıp</span><span>Yerleşim</span><span>Boyahane</span><span /></div>{visibleRows.map(({ model, operation }) => <button className="dsg-tech-row" key={operation.id} onClick={() => setActive({ model, operation })}><span className="dsg-row-thumb">{model.mainImage ? <img src={assetUrl(model.mainImage.thumbnailUrl || model.mainImage.previewUrl)} alt="" /> : <FileImage />}</span><strong>{model.modelName}</strong><span>{model.companyName}</span><span>{operation.printAreaName}</span><span>{operation.moldType || "Belirsiz"}</span><span>{(operation.totals?.activeChannelCount || 0)} / {(operation.totals?.totalMoldCount || 0)}</span><StatusBadge value={operation.placementStatus}>{operation.placementStatus}</StatusBadge><StatusBadge value={operation.dyehouseStatus}>{operation.dyehouseStatus}</StatusBadge><span className="dsg-btn compact"><Pencil size={15} /> Düzenle</span></button>)}</div><Pager index={page} count={pageCount} onPrevious={() => setPage((value) => Math.max(0, value - 1))} onNext={() => setPage((value) => Math.min(pageCount - 1, value + 1))} /></>}</section>
    {active && <PlacementModal activeMainCompany={activeMainCompany} model={active.model} operation={active.operation} onClose={() => setActive(null)} onSaved={async () => { setActive(null); await load(); }} />}
  </>;
}

function PlacementModal({ activeMainCompany, model, operation, onClose, onSaved }) {
  const [draft, setDraft] = useState({ moldType: operation.moldType || "UNDEFINED", moldWidth: operation.moldWidth || "", moldHeight: operation.moldHeight || "", placementStatus: operation.placementStatus || "WAITING", productionReady: operation.productionReady || false, notes: operation.notes || "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const placement = model.files.find((item) => item.id === operation.placementFileId);
  const channelImage = model.files.find((item) => item.id === operation.channelImageFileId);
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setBusy(true); setMessage("");
    try {
      if (file) await uploadDesignWorkflowFile(activeMainCompany, model.id, operation.id, file, "PLACEMENT_IMAGE");
      await updateDesignOperation(activeMainCompany, operation.id, { ...draft, placementStatus: file ? "READY" : draft.placementStatus });
      onSaved();
    } catch (error) { setMessage(error?.message || "Teknik kayıt tamamlanamadı."); }
    finally { setBusy(false); }
  };
  return <WideModal title="Yerleşim / Kalıp Teknik Kontrol" subtitle={`${model.modelName} · ${model.companyName} · ${operation.printAreaName}`} onClose={onClose} onSave={save} dirty footer={<><span className="dsg-foot-message">{message}</span><button className="dsg-btn ghost" onClick={onClose}>Vazgeç</button><button className="dsg-btn primary" onClick={save} disabled={busy}>Teknik Kaydı Kaydet</button></>}>
    <div className="dsg-placement-summary"><div><ImagePreview src={model.mainImage?.previewUrl} /><strong>Model Görseli</strong></div><div><ImagePreview src={channelImage?.previewUrl} /><strong>Kanal Görseli</strong></div><div><ImagePreview src={file ? URL.createObjectURL(file) : placement?.previewUrl} /><strong>Yerleşim Görseli</strong></div></div>
    <div className="dsg-editor-summary compact"><div><span>Model</span><strong>{model.modelName}</strong></div><div><span>Firma</span><strong>{model.companyName}</strong></div><div><span>Baskı Bölgesi</span><strong>{operation.printAreaName}</strong></div><div><span>Kanal / Kalıp</span><strong>{(operation.totals?.activeChannelCount || 0)} / {(operation.totals?.totalMoldCount || 0)}</strong></div><div><span>Benzersiz Boya</span><strong>{(operation.totals?.uniqueColorCount || 0)}</strong></div></div>
    <div className="dsg-form-grid four placement-form"><label>Kalıp tipi<select value={draft.moldType} onChange={(event) => update("moldType", event.target.value)}><option value="UNDEFINED">Belirsiz</option><option value="K_BOY">K-Boy</option><option value="B_BOY">B-Boy</option><option value="SPECIAL">Özel</option></select></label><label>En (cm)<input type="number" step="0.1" value={draft.moldWidth} onChange={(event) => update("moldWidth", event.target.value)} /></label><label>Boy (cm)<input type="number" step="0.1" value={draft.moldHeight} onChange={(event) => update("moldHeight", event.target.value)} /></label><label>Kontrol durumu<select value={draft.placementStatus} onChange={(event) => update("placementStatus", event.target.value)}><option value="WAITING">Yerleşim Bekliyor</option><option value="READY">Hazır</option><option value="REVISION_PENDING">Revize Bekliyor</option></select></label><label className="dsg-file-input"><Upload size={18} /> Yerleşim Görseli / PDF<input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} /><span>{file?.name || placement?.originalFileName || "Dosya seçilmedi"}</span></label><label className="span-3">Teknik Not<textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} /></label><label className="dsg-check-label"><input type="checkbox" checked={draft.productionReady} onChange={(event) => update("productionReady", event.target.checked)} /> Üretime Hazır</label></div>
  </WideModal>;
}
