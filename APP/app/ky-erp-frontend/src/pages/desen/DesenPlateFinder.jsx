
import { useCallback, useEffect, useMemo, useState } from "react";
import { FileImage, Search, Plus, Save, X, Image as ImageIcon } from "lucide-react";
import { apiFetch } from "../../utils/api";
import { ImagePreview } from "./DesenWorkflowShared";

const text = (x) => String(x ?? "").trim();
const unique = (rows) => [...new Set((rows || []).map((row) => row.modelId))];
const showCm = (value) => value === null || value === undefined || value === "" ? "" :
  Number(value).toLocaleString("tr-TR", {maximumFractionDigits:3});
const relativeCm = (item,reference) => {
  if (!reference || item===reference || !reference.widthCm || !reference.heightCm ||
      !item.widthCm || !item.heightCm) return "";
  const widthChange = (Number(item.widthCm)/Number(reference.widthCm)-1)*100;
  const heightChange = (Number(item.heightCm)/Number(reference.heightCm)-1)*100;
  const printPercent = (value) => (value>0 ? "+" : "") +
    value.toLocaleString("tr-TR",{maximumFractionDigits:2}) + "%";
  if(Math.abs(widthChange-heightChange)<0.5)
    return "Orijinale göre " + printPercent((widthChange+heightChange)/2);
  return "Orijinale göre en " + printPercent(widthChange) +
    ", boy " + printPercent(heightChange) + " (orantı farklı)";
};
const describeSize = (item, reference) => {
  const dimension = item.widthCm && item.heightCm
    ? showCm(item.widthCm) + " × " + showCm(item.heightCm) + " cm"
    : "En–boy ölçüsü girilmedi";
  const use = item.allGarmentSizes ? "Tüm ürün bedenleri"
    : item.garmentSizes?.length ? "Ürün: " + item.garmentSizes.join(", ")
    : "Uygulanacak ürün bedenleri bilinmiyor";
  return [item.sizeLabel || "Varyant",item.printedSizeRank && item.printedSizeRank !== item.sizeLabel ? item.printedSizeRank : "",dimension,relativeCm(item,reference),
    item.artworkPart ? "Parça: "+item.artworkPart : "",
    use].filter(Boolean).join(" · ");
};
const displayRows = (rows) => {
  const groups = new Map();
  for (const item of rows || []) {
    const id = text(item.modelId);
    const group = groups.get(id) || {name:item.modelName || "Model",variants:[],areas:[]};
    const reference = (rows || []).find((row) => row.modelId===item.modelId &&
      (row.artworkPart || "")===(item.artworkPart || "") &&
      (row.printArea || "")===(item.printArea || "") && row.isReferenceSize===true);
    const label = describeSize(item,reference);
    if (!group.variants.includes(label)) group.variants.push(label);
    if (item.printArea && !group.areas.includes(item.printArea)) group.areas.push(item.printArea);
    groups.set(id,group);
  }
  return [...groups.entries()].map(([id,group])=>({id,...group}));
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

function PlateEditor({ plate, models, slug, focusedModelId, onSaved }) {
  const [entries, setEntries] = useState(plate.entries.map((row) => ({...row,garmentSizesText:(row.garmentSizes || []).join(", ")})));
  const [plateCode, setPlateCode] = useState(plate.plateCode || "");
  const [shelfLabel, setShelfLabel] = useState(plate.shelfLabel || "");
  const [acceptRevision, setAcceptRevision] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [placementFiles,setPlacementFiles] = useState([]);
  const [placementFileId,setPlacementFileId] = useState("");
  const [ocrCandidates,setOcrCandidates] = useState([]);
  const [ocrBusy,setOcrBusy] = useState(false);
  useEffect(()=>{
    let live=true;
    apiFetch("/desen/plates/"+encodeURIComponent(plate.assetId)+
      "/placement-pdfs?mainCompanySlug="+encodeURIComponent(slug))
      .then((res)=>{if(live)setPlacementFiles(res?.data?.items||[]);})
      .catch(()=>{if(live)setPlacementFiles([]);});
    return ()=>{live=false};
  },[plate.assetId,slug]);
  const scanPlacement = async () => {
    if(!placementFileId || ocrBusy)return;
    setOcrBusy(true);setNotice("");setOcrCandidates([]);
    try {
      const result=await apiFetch("/desen/plates/"+encodeURIComponent(plate.assetId)+"/interpret-placement",{
        method:"POST",body:{mainCompanySlug:slug,placementAssetId:placementFileId},timeoutMs:120000
      });
      const list=result?.data?.measurements||[];
      if(!list.length){setNotice("PDF yazılarından güvenilir en × boy çifti okunamadı; elle kontrol edin.");return;}
      setOcrCandidates(list.map((row)=>({...row,modelId:focusedModelId||""})));
    }catch(error){setNotice(error?.message||"PDF yorumlanamadı.");}
    finally{setOcrBusy(false);}
  };
  const adoptObservation = (row) => {
    if(!row.modelId){setNotice("Bu ebat hangi modele ait? Önce model seçin.");return;}
    setEntries((rows)=>{
      if(rows.some((existing)=>existing.modelId===row.modelId &&
        Number(existing.widthCm)===row.widthCm && Number(existing.heightCm)===row.heightCm &&
        (existing.artworkPart||"")===(row.artworkPart||"")))return rows;
      let n=rows.length+1;
      while(rows.some((existing)=>existing.sizeCode==="OCR_"+n))n+=1;
      return [...rows,{modelId:row.modelId,sizeCode:"OCR_"+n,sizeLabel:"Ölçü "+n,
        widthCm:row.widthCm,heightCm:row.heightCm,artworkPart:row.artworkPart||"",
        printArea:"",garmentSizes:row.garmentSizes||[],
        garmentSizesText:(row.garmentSizes||[]).join(", "),
        allGarmentSizes:row.allGarmentSizes===true,isReferenceSize:false}];
    });
  };

  const edit = (index, patch) => setEntries((all) => all.map((row, i) => i === index ? {...row,...patch} : row));
  const add = () => setEntries((rows) => {
    let n=rows.length+1;
    while(rows.some((row)=>row.sizeCode==="VARIANT_"+n))n+=1;
    return [...rows, {modelId:models[0]?.modelId || "",sizeCode:"VARIANT_"+n,
      sizeLabel:"",widthCm:"",heightCm:"",artworkPart:"",garmentSizesText:"",
      garmentSizes:[],allGarmentSizes:false,isReferenceSize:false,printArea:""}];
  });
  const useSuggestions = () => setEntries((rows) => [
    ...rows, ...plate.suggestions.filter((row) => !rows.some((existing) =>
      existing.modelId === row.modelId && existing.sizeCode === row.sizeCode &&
      existing.sizeLabel === row.sizeLabel && existing.printArea === row.printArea
    )).map((row) => ({...row,widthCm:null,heightCm:null,artworkPart:"",
      garmentSizesText:"",garmentSizes:[],allGarmentSizes:false,isReferenceSize:false}))
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
            modelId:row.modelId, sizeCode:row.sizeCode, sizeLabel:row.sizeLabel, printArea:row.printArea || "",
            artworkPart:row.artworkPart || "",widthCm:row.widthCm,heightCm:row.heightCm,
            garmentSizes:row.allGarmentSizes ? [] : (row.garmentSizesText ?? (row.garmentSizes || []).join(",")).split(/[,;]+/).map(text).filter(Boolean),
            allGarmentSizes:row.allGarmentSizes === true,isReferenceSize:row.isReferenceSize === true
          })),
        },
      });
      if (result?.ok) onSaved?.();
    } catch (err) {setNotice(err?.message || "Kayıt başarısız.");}
    finally {setSaving(false);}
  };
  return <div className="dsg-plate-editor">
    <p><strong>Yetkili kalıp düzeltme</strong> · PSD dosya adı değiştirilmez. Her satır bir modelin desen en × boy ölçüsüdür (cm). S/M/L, yaş ve ay değerleri yalnız ürün bedenidir; aynı ölçü birden fazla ürüne uygulanabilir. Boy sayısı sınırsızdır.</p>
    <div className="dsg-plate-ocr">
      <strong>Drive yerleşim PDF'sinden ölçü önerisi</strong>
      <small>Yazıları mevcut görsel okuma servisi yorumlar. Çekme, dikiş payı ve ürün bedenleri desen eni/boyu sayılmaz. Sonuçlar yalnız öneridir.</small>
      {placementFiles.length ? <>
        <select aria-label="İlişkili yerleşim PDF seç" value={placementFileId}
          onChange={(e)=>{setPlacementFileId(e.target.value);setOcrCandidates([]);}}>
          <option value="">İlişkili yerleşim PDF'sini seç</option>
          {placementFiles.map((row)=><option key={row.assetId} value={row.assetId}>{row.fileName}</option>)}
        </select>
        <button type="button" className="dsg-btn" onClick={scanPlacement} disabled={!placementFileId||ocrBusy}>
          {ocrBusy?"PDF okunuyor…":"PDF ölçülerini yorumla"}
        </button>
      </>:<small>Bu PSD'yle modeli eşleşen indeksli yerleşim PDF bulunamadı.</small>}
      {ocrCandidates.map((row,index)=><div className="dsg-plate-ocr-candidate" key={index}>
        <span><b>{row.artworkPart || "Desen"}</b>: {showCm(row.widthCm)} × {showCm(row.heightCm)} cm;
          {" "}{row.allGarmentSizes?"tüm ürün bedenlerinde":(row.garmentSizes||[]).join(", ")||"beden grubu belirsiz"}</span>
        <select aria-label="Ölçü adayını modele bağla" value={row.modelId||""}
          onChange={(e)=>setOcrCandidates((prev)=>prev.map((item,i)=>i===index?{...item,modelId:e.target.value}:item))}>
          <option value="">Model seç</option>
          {models.map((model)=><option key={model.modelId} value={model.modelId}>{model.modelName}</option>)}
        </select>
        <button type="button" className="dsg-btn" onClick={()=>adoptObservation(row)}>Öneriyi düzenlemeye al</button>
      </div>)}
    </div>
    <div className="dsg-plate-editor-metadata">
      <label>Raf / fiziksel yer <input value={shelfLabel} maxLength={120} onChange={(e)=>setShelfLabel(e.target.value)} placeholder="Örn: Raf 4, göz 12" /></label>
      <label>Kalıp kodu <input value={plateCode} maxLength={100} onChange={(e)=>setPlateCode(e.target.value)} /></label>
    </div>
    <div className="dsg-plate-edit-list">
      {entries.map((row,index)=><div className="dsg-plate-edit-entry" key={index}>
        <div className="dsg-plate-edit-row">
          <label>Model
            <select aria-label="Model seç" value={row.modelId} onChange={(e)=>edit(index,{modelId:e.target.value})}>
              <option value="">Model seç</option>
              {models.map((model)=><option key={model.modelId} value={model.modelId}>{model.modelName}</option>)}
            </select>
          </label>
          <label>Desen varyantı
            <input aria-label="Desen boy adı" value={row.sizeLabel || ""} maxLength={80}
              placeholder="Örn: Orijinal / Küçük / Büyük / 3. ebat"
              onChange={(e)=>edit(index,{sizeLabel:e.target.value,
                sizeCode:row.sizeCode==="UNSPECIFIED"?"VARIANT_"+(index+1):row.sizeCode||"VARIANT_"+(index+1)})} />
          </label>
          <label>Desen eni (cm)
            <input aria-label="Desen eni santimetre" inputMode="decimal" value={row.widthCm ?? ""}
              placeholder="Örn: 17,93" onChange={(e)=>edit(index,{widthCm:e.target.value})} />
          </label>
          <label>Desen boyu (cm)
            <input aria-label="Desen boyu santimetre" inputMode="decimal" value={row.heightCm ?? ""}
              placeholder="Örn: 23" onChange={(e)=>edit(index,{heightCm:e.target.value})} />
          </label>
        </div>
        <div className="dsg-plate-edit-row">
          <label>Baskı parçası
            <input aria-label="Desen parçası" maxLength={80} placeholder="Örn: Ana desen / Kuyruk"
              value={row.artworkPart || ""} onChange={(e)=>edit(index,{artworkPart:e.target.value})} />
          </label>
          <label>Ürün bedenleri (virgülle ayır)
            <input aria-label="Uygulanacak ürün bedenleri" placeholder="Örn: 1-3 ay, 3-6 ay veya S, M"
              disabled={row.allGarmentSizes}
              value={row.garmentSizesText ?? (row.garmentSizes || []).join(", ")}
              onChange={(e)=>edit(index,{garmentSizesText:e.target.value})} />
          </label>
          <label>Baskı yeri
            <select aria-label="Baskı bölgesi" value={row.printArea || ""}
              onChange={(e)=>edit(index,{printArea:e.target.value})}>
              <option value="">Bilinmiyor</option><option value="FRONT">Ön</option>
              <option value="BACK">Arka</option><option value="NECK">Ense</option>
              <option value="SLEEVE">Kol</option><option value="OTHER">Diğer</option>
            </select>
          </label>
          <button type="button" className="dsg-btn" aria-label="Satırı kaldır"
            onClick={()=>setEntries((rows)=>rows.filter((_,i)=>i!==index))}>
            <X size={15} /> Kaldır
          </button>
        </div>
        <div className="dsg-plate-flags">
          <label><input type="checkbox" checked={row.allGarmentSizes===true}
            onChange={(e)=>edit(index,{allGarmentSizes:e.target.checked,garmentSizesText:e.target.checked?"":row.garmentSizesText})} />
            Aynı desen ölçüsü tüm ürün bedenlerinde kullanılır</label>
          <label><input type="checkbox" checked={row.isReferenceSize===true}
            onChange={(e)=>edit(index,{isReferenceSize:e.target.checked})} />
            Bu, müşteriden gelen / ilk çalışılan referans ebat</label>
        </div>
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
          <b>{row.name}:</b> {row.variants.join(" / ")}
        </span>)}</div>
        <small>{plate.status==="CONFIRMED" ? "En–boy cm doğrulandı" : plate.status==="MEASUREMENT_PENDING" ? "Model ilişkisi kayıtlı, santimetre ölçüsü eksik" : plate.status==="GARMENT_SIZES_PENDING" ? "Desen cm ölçüsü var, uygulanacak ürün bedenleri eksik" : plate.status==="REVISION_REVIEW" ? "PSD değişti: yeniden kontrol gerekli" : "Otomatik model adayı — en ve boy cm doğrulanmadı"} · {plate.uniqueModels||unique(plate.suggestions).length} model</small>
        <button type="button" className="dsg-btn primary" onClick={()=>choosePlate(plate.assetId)}>Kalıbı ve PSD'yi gör</button>
      </article>)}
    </div>}
    {active && <div className="dsg-plate-detail" role="region" aria-label="Ortak kalıp detayları">
      <div className="dsg-plate-detail-head"><div><h3>{active.fileName}</h3><p>{active.relativePath || "Dosya yolu bulunamadı"} · {active.shelfLabel || "Raf belirtilmedi"}</p></div>
        <button type="button" className="dsg-btn" onClick={()=>{setActive(null);setEditing(false);}}><X size={16}/> Kapat</button></div>
      <small>{active.status==="CONFIRMED" ? "Onaylanan baskı ölçüleri (cm) ve ürün bedenleri" : active.status==="MEASUREMENT_PENDING" ? "Model ilişkisi kaydedilmiş, bazı en–boy ölçüleri bekliyor" : active.status==="GARMENT_SIZES_PENDING" ? "En–boy belli, ancak hangi ürün bedenlerinde kullanılacağı belirlenmedi" : "Model adayı — desen ölçüleri doğrulanmalı"}</small>
      {displayRows(active.entries.length ? active.entries : active.suggestions).map((row)=>
        <p key={row.id}><strong>{row.name}</strong>: {row.variants.join(" / ")} {row.areas.length ? "· "+row.areas.join(", ") : ""}</p>)}
      <PlatePreview key={active.assetId} assetId={active.assetId} slug={slug} />
      <button type="button" className="dsg-btn" onClick={()=>setEditing((value)=>!value)}>{editing ? "Düzenlemeyi kapat" : "Yetkili düzeltme / raf ve boy bilgisi"}</button>
      {editing && <PlateEditor key={active.assetId+"-"+active.revision} plate={active} models={models} slug={slug} focusedModelId={effectiveId}
        onSaved={()=>{choosePlate(active.assetId);setEditing(false);}} />}
    </div>}
  </section>;
}
