
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileImage, Search, Plus, Save, RefreshCw, X, Image as ImageIcon } from "lucide-react";
import { apiFetch } from "../../utils/api";
import { ImagePreview } from "./DesenWorkflowShared";

const text = (x) => String(x ?? "").trim();
const unique = (rows) => [...new Set(rows.map((row) => row.modelId))];
const displayRows = (rows) => {
  const groups = new Map();
  for (const row of rows || []) {
    const id = text(row.modelId);
    const item = groups.get(id) || { name: row.modelName || "Model", sizes: [], areas: [] };
    const size = text(row.sizeLabel) || "Boy belirtilmemiş";
    if (!item.sizes.includes(size)) item.sizes.push(size);
    if (row.printArea && !item.areas.includes(row.printArea)) item.areas.push(row.printArea);
    groups.set(id, item);
  }
  return [...groups.entries()].map(([id, group]) => ({ id, ...group }));
};

function PlatePreview({ assetId, slug }) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const open = async () => {
    if (busy) return;
    setBusy(true); setStatus("");
    const path = `/file-hub/files/${encodeURIComponent(assetId)}/preview`;
    const query = "?mainCompanySlug=" + encodeURIComponent(slug);
    try {
      // A cached full-canvas PNG is returned immediately. Otherwise enqueue
      // the Photoshop-free converter and retry a bounded number of times.
      await apiFetch(path + "/request" + query, { method: "POST", body: { mainCompanySlug: slug } });
      for (let i = 0; i < 12; i += 1) {
        try {
          const blob = await apiFetch(path + query, { responseType: "blob", timeoutMs: 35000 });
          if (!blob?.type?.startsWith("image/")) throw new Error("Önizleme görsel biçiminde değil.");
          setUrl(URL.createObjectURL(blob));
          setStatus(""); return;
        } catch (err) {
          if (i === 11 || err?.status === 403 || err?.status === 401) throw err;
          setStatus("Görüntü hazırlanıyor…");
          await new Promise((resolve) => setTimeout(resolve, 3500));
        }
      }
    } catch (err) {
      setStatus(err?.message || "PSD görüntüsü henüz hazırlanamadı; tekrar deneyin.");
    } finally { setBusy(false); }
  };
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return <div className="dsg-plate-preview">
    {url ? <ImagePreview src={url} alt="PSD tam yerleşim önizlemesi" /> :
      <div className="dsg-plate-no-preview"><FileImage size={28} /> Orijinal PSD değiştirilmeden önizleme oluşturulur.</div>}
    <button type="button" className="dsg-btn primary" onClick={open} disabled={busy}>
      <ImageIcon size={16} /> {busy ? "Hazırlanıyor…" : url ? "Yeniden Aç" : "PSD'yi Önizle"}
    </button>
    {status && <small role="status">{status}</small>}
  </div>;
}

function PlateEditor({ plate, models, slug, onSaved }) {
  const [entries, setEntries] = useState(plate.entries.map((row) => ({...row})));
  const [plateCode, setPlateCode] = useState(plate.plateCode || "");
  const [shelfLabel, setShelfLabel] = useState(plate.shelfLabel || "");
  const [acceptRevision, setAcceptRevision] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const edit = (index, patch) => setEntries((all) => all.map((row, i) => i === index ? {...row,...patch} : row));
  const add = () => setEntries((rows) => [
    ...rows, { modelId:models[0]?.modelId || "", sizeCode:"CUSTOM", sizeLabel:"", printArea:"" }
  ]);
  const useSuggestions = () => setEntries((rows) => [
    ...rows, ...plate.suggestions.filter((row) => !rows.some((existing) =>
      existing.modelId === row.modelId && existing.sizeCode === row.sizeCode &&
      existing.sizeLabel === row.sizeLabel && existing.printArea === row.printArea
    )).map((row) => ({...row}))
  ]);
  const save = async () => {
    setSaving(true); setNotice("");
    try {
      if (!entries.length) throw new Error("Kalıptaki modelleri ve boyları önce girin.");
      const result = await apiFetch("/desen/plates/"+encodeURIComponent(plate.assetId), {
        method:"PUT", body: {
          mainCompanySlug:slug, expectedRevision:plate.revision,
          plateCode, shelfLabel, acceptSourceRevision:acceptRevision,
          entries:entries.map((row) => ({
            modelId:row.modelId, sizeCode:row.sizeCode, sizeLabel:row.sizeLabel, printArea:row.printArea || ""
          })),
        },
      });
      if (result?.ok) onSaved?.();
    } catch (err) {setNotice(err?.message || "Kayıt başarısız.");}
    finally {setSaving(false);}
  };
  return <div className="dsg-plate-editor">
    <p><strong>Yetkili kalıp düzeltme</strong> · PSD dosya adı değiştirilmez. Eklediğiniz her satır bir modelin bir boyudur. 1, 2, 3 veya daha fazla boy girebilirsiniz.</p>
    <div className="dsg-plate-editor-metadata">
      <label>Raf / fiziksel yer <input value={shelfLabel} maxLength={120} onChange={(e)=>setShelfLabel(e.target.value)} placeholder="Örn: Raf 4, göz 12" /></label>
      <label>Kalıp kodu <input value={plateCode} maxLength={100} onChange={(e)=>setPlateCode(e.target.value)} /></label>
    </div>
    <div className="dsg-plate-edit-list">
      {entries.map((row, index) => <div className="dsg-plate-edit-row" key={index}>
        <select aria-label="Model seç" value={row.modelId} onChange={(e)=>edit(index,{modelId:e.target.value})}>
          <option value="">Model seç</option>
          {models.map((model) => <option key={model.modelId} value={model.modelId}>{model.modelName}</option>)}
        </select>
        <input aria-label="Boy adı" value={row.sizeLabel || ""} placeholder="Örn: 3. boy, XS, 48-52" maxLength={80}
          onChange={(e)=>edit(index,{sizeLabel:e.target.value,sizeCode: row.sizeCode === "UNSPECIFIED" ? "CUSTOM" : row.sizeCode || "CUSTOM"})} />
        <select aria-label="Baskı bölgesi" value={row.printArea || ""} onChange={(e)=>edit(index,{printArea:e.target.value})}>
          <option value="">Bölge belirtilmedi</option><option value="FRONT">Ön</option><option value="BACK">Arka</option>
          <option value="NECK">Ense</option><option value="SLEEVE">Kol</option><option value="OTHER">Diğer</option>
        </select>
        <button type="button" className="dsg-btn" aria-label="Satırı kaldır" onClick={()=>setEntries((rows)=>rows.filter((_,i)=>i!==index))}><X size={15} /></button>
      </div>)}
    </div>
    <div className="dsg-plate-editor-actions">
      <button type="button" className="dsg-btn" onClick={add}><Plus size={15} /> Boy / model satırı ekle</button>
      {plate.suggestions?.length>0 && <button type="button" className="dsg-btn" onClick={useSuggestions}>Dosya adındaki adayları düzenlemeye al</button>}
    </div>
    {plate.sourceRevised && <label className="dsg-plate-revision">
      <input type="checkbox" checked={acceptRevision} onChange={(e)=>setAcceptRevision(e.target.checked)} />
      PSD değişti; yeni görüntüdeki model ve boyları kontrol ettim.
    </label>}
    {notice && <p role="alert" className="dsg-file-error">{notice}</p>}
    <button type="button" className="dsg-btn primary" disabled={saving || (plate.sourceRevised && !acceptRevision)} onClick={save}>
      <Save size={15} /> {saving ? "Kaydediliyor…" : "Ortak kalıp ve boyları doğrula"}
    </button>
  </div>;
}

export default function DesenPlateFinder({ activeMainCompany, query = "" }) {
  const slug = text(activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || activeMainCompany?.id);
  const [models, setModels] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [plates, setPlates] = useState([]);
  const [active, setActive] = useState(null);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [warning, setWarning] = useState("");
  const matched = useMemo(() => {
    const q = text(query).toLocaleUpperCase("tr-TR");
    if (q.length < 2) return [];
    return models.filter((row) => text(row.modelName).toLocaleUpperCase("tr-TR").includes(q)).slice(0,12);
  }, [models,query]);
  useEffect(() => {
    let alive=true;
    setModels([]);setPlates([]);setSelectedId("");setActive(null);
    if (!slug) return undefined;
    apiFetch("/desen/plates/models?mainCompanySlug="+encodeURIComponent(slug))
      .then((result)=>{if(alive)setModels(result?.data?.models||[]);})
      .catch((error)=>{if(alive)setWarning(error?.message||"Model listesi alınamadı.");});
    return ()=>{alive=false;};
  },[slug]);
  const exactId = matched.find((r)=>text(r.modelName).toLocaleUpperCase("tr-TR")===text(query).toLocaleUpperCase("tr-TR"))?.modelId || "";
  const effectiveId = matched.some((row)=>row.modelId === selectedId) ? selectedId : exactId;
  useEffect(() => {
    let alive=true;
    setPlates([]);setActive(null);setEditing(false);setWarning("");
    if (!slug || !effectiveId) return undefined;
    setPending(true);
    apiFetch("/desen/plates/model/"+encodeURIComponent(effectiveId)+"?mainCompanySlug="+encodeURIComponent(slug))
      .then((res)=>{if(alive)setPlates(res?.data?.plates||[]);})
      .catch((error)=>{if(alive)setWarning(error?.message||"Kalıplar bulunamadı.");})
      .finally(()=>{if(alive)setPending(false);});
    return ()=>{alive=false;};
  },[slug,effectiveId]);
  const choosePlate = useCallback(async (assetId) => {
    setEditing(false);setWarning("");
    try {
      const result=await apiFetch("/desen/plates/"+encodeURIComponent(assetId)+"?mainCompanySlug="+encodeURIComponent(slug));
      setActive(result?.data||null);
    }catch(error){setWarning(error?.message||"Kalıp bilgisi okunamadı.");}
  },[slug]);
  if (text(query).length < 2) return <section className="dsg-plate-search-panel">
    <strong>Ortak kalıp bul</strong><p>Yukarıdaki aramaya model adını yazın. Modelin boylarını, beraber çekildiği modelleri ve PSD görselini burada göreceksiniz.</p>
  </section>;
  return <section className="dsg-plate-search-panel">
    <header><strong><Search size={17} /> Ortak kalıp bul · model / boy / raf</strong><small>{matched.length} model seçeneği</small></header>
    <div className="dsg-plate-model-options">{matched.map((model)=><button type="button"
      key={model.modelId} className={effectiveId===model.modelId ? "active" : ""}
      onClick={()=>setSelectedId(model.modelId)}>{model.modelName}</button>)}</div>
    {!matched.length && <p>Bu adla kayıtlı model bulunamadı. PSD'den yeni model üretilmez.</p>}
    {pending && <p>İlgili kalıplar aranıyor…</p>}
    {warning && <p role="alert" className="dsg-file-error">{warning}</p>}
    {effectiveId && !pending && <div className="dsg-plate-results">
      {plates.length===0 ? <p>Henüz eşleşen PSD kalıbı yok. Drive indeksinin tamamlanması gerekebilir.</p> :
      plates.map((plate)=><article key={plate.assetId} className="dsg-plate-search-card">
        <div><strong>{plate.fileName}</strong><small>{plate.shelfLabel || "Raf bilgisi henüz girilmedi"} · {plate.plateCode || "Kalıp kodu yok"}</small></div>
        <div className="dsg-plate-member-summary">{displayRows(plate.entries.length ? plate.entries : plate.suggestions).map((row)=><span key={row.id}>
          <b>{row.name}:</b> {row.sizes.join(" + ")}
        </span>)}</div>
        <small>{plate.status==="CONFIRMED" ? "Boylar doğrulandı" : plate.status==="REVISION_REVIEW" ? "PSD değişti: yeniden kontrol gerekli" : "Otomatik aday — boylar doğrulanmadı"} · {plate.uniqueModels||unique(plate.suggestions).length} model</small>
        <button type="button" className="dsg-btn primary" onClick={()=>choosePlate(plate.assetId)}>Kalıbı ve PSD'yi gör</button>
      </article>)}
    </div>}
    {active && <div className="dsg-plate-detail" role="region" aria-label="Ortak kalıp detayları">
      <div className="dsg-plate-detail-head"><div><h3>{active.fileName}</h3><p>{active.relativePath || "Dosya yolu bulunamadı"} · {active.shelfLabel || "Raf belirtilmedi"}</p></div>
        <button type="button" className="dsg-btn" onClick={()=>{setActive(null);setEditing(false);}}><X size={16}/> Kapat</button></div>
      <small>{active.status==="CONFIRMED" ? "Doğrulanmış boy ilişkileri" : "Boy/model adayları — doğrulama gerekli"}</small>
      {displayRows(active.entries.length ? active.entries : active.suggestions).map((row)=>
        <p key={row.id}><strong>{row.name}</strong>: {row.sizes.join(" + ")} {row.areas.length ? "· "+row.areas.join(", ") : ""}</p>)}
      <PlatePreview key={active.assetId} assetId={active.assetId} slug={slug} />
      <button type="button" className="dsg-btn" onClick={()=>setEditing((value)=>!value)}>{editing ? "Düzenlemeyi kapat" : "Yetkili düzeltme / raf ve boy bilgisi"}</button>
      {editing && <PlateEditor key={active.assetId+"-"+active.revision} plate={active} models={models} slug={slug}
        onSaved={()=>{choosePlate(active.assetId);setEditing(false);}} />}
    </div>}
  </section>;
}
