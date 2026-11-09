import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiGet, apiUpload } from "../../utils/api";
import "./model-files-panel.css";
import { folderSubpath, modelSourceFileType, modelFileCategory } from "./model-folder-path";

const CATEGORIES = [
  ["MODEL_IMAGE", "Model Görseli — JPG / PNG"],
  ["MODEL_SOURCE", "Gelen Model Dosyaları — AI / PDF / TIFF / PSD"],
  ["OUTGOING_DESIGN", "Giden PSD — Birden fazla model / BOY"],
  ["PLACEMENT", "Yerleşim / Kalıp PDF"],
];
const PRINT_AREAS = [["", "Baskı bölgesi seçilmedi"], ["FRONT", "Ön"], ["BACK", "Arka"], ["ARM", "Kol"], ["OTHER", "Diğer"]];
async function filesFromDrop(dataTransfer) {
  const entries=[...(dataTransfer.items||[])].map((item)=>item.webkitGetAsEntry?.()).filter(Boolean);
  if(!entries.some((entry)=>entry.isDirectory))return [...(dataTransfer.files||[])].map((file)=>({file,relative:""}));
  const out=[];
  async function read(entry,path) {
    if(entry.isFile){
      const file=await new Promise((resolve,reject)=>entry.file(resolve,reject));
      out.push({file,relative:path+entry.name});
    }else if(entry.isDirectory){
      const reader=entry.createReader();
      for(;;){
        const batch=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));
        if(!batch.length)break;
        for(const child of batch)await read(child,path+entry.name+"/");
      }
    }
  }
  for(const entry of entries)await read(entry,"");
  return out;
}
const rowsOf = (data) => Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
const filePath = (id, fileId) => `/model-files/${encodeURIComponent(id)}/file/${encodeURIComponent(fileId)}`;

export default function ModelFilesPanel({ modelId, modelName = "", activeMainCompany, models = [], onUploaded, readOnly = false }) {
  const slug = String(activeMainCompany?.slug || activeMainCompany?.id || "").trim();
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const [files, setFiles] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [role, setRole] = useState("MODEL_SOURCE");
  const [folderMode, setFolderMode] = useState(false);
  const [folderPreview, setFolderPreview] = useState(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [psdQuery, setPsdQuery] = useState("");
  const [psdItems, setPsdItems] = useState([]);
  const [selectedPsd, setSelectedPsd] = useState(null);
  const [psdBusy, setPsdBusy] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [busyFile, setBusyFile] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [drag, setDrag] = useState(false);
  const query = useMemo(() => ({ mainCompanySlug: slug }), [slug]);

  const refresh = useCallback(async () => {
    if (!slug || !modelId) return;
    setLoading(true);
    try {
      const result = await apiGet(`/model-files/${encodeURIComponent(modelId)}`, query, { forceFresh: true });
      setFiles(rowsOf(result.data || result));
    } catch (err) {
      setError(err?.message || "Dosyalar listelenemedi.");
    } finally { setLoading(false); }
  }, [modelId, query, slug]);
  useEffect(() => { setFiles([]); setIncoming([]); setError(""); setNotice(""); refresh(); }, [refresh]);

  const options = useMemo(() => {
    const list = [{ id: String(modelId), modelName: String(modelName || "") }, ...models];
    return [...new Map(list.filter((m) => m?.id).map((m) => [String(m.id), m])).values()];
  }, [modelId, modelName, models]);

  const pickFiles = (selection, directory = false) => {
    const list=[...(selection||[])].map((entry)=>entry?.file ? entry : {file:entry,relative:entry?.webkitRelativePath||""})
      .filter((entry)=>entry.file instanceof File);
    if(!list.length)return;
    const isFolder=directory||list.some((entry)=>String(entry.relative).includes("/"));
    const suggested=modelFileCategory(list[0]?.file?.name,isFolder);
    if(["INVOICE","DELIVERY_NOTE"].includes(suggested)){
      setError("İşNet fatura ve irsaliyelerini Muhasebe > e-Belge Merkezi üzerinden yükleyin. Desen modeli teknik dosyaları burada tutulur.");
      setIncoming([]);return;
    }
    setIncoming(list);
    setSelectedPsd(null);
    setFolderMode(isFolder);
    setRole(suggested);
    setAssignments([{ key: "primary", modelId: String(modelId), boy: "", printArea: "" }]);
    setError(""); setNotice(""); setExpanded(true);
  };
  async function checkDriveFolder() {
    if(!slug||!modelId||folderBusy)return;
    setFolderBusy(true);setFolderPreview(null);setError("");setNotice("");
    try{
      const result=await apiGet(`/model-files/${encodeURIComponent(modelId)}/folder-preview`,query,{forceFresh:true});
      setFolderPreview(result?.data||result);
    }catch(err){setError(err?.message||"Drive model klasörü kontrol edilemedi.");}
    finally{setFolderBusy(false);}
  }
  async function linkDriveFolder() {
    if(!folderPreview?.found||folderBusy||readOnly)return;
    setFolderBusy(true);setError("");setNotice("");
    try{
      const result=await apiFetch(`/model-files/${encodeURIComponent(modelId)}/link-existing-folder`,{method:"POST",params:query});
      const info=result?.data||result;
      setNotice(`${info.linked||0} dosya bağlandı; ${info.alreadyLinked||0} dosya zaten bağlıydı. Drive orijinalleri değişmedi.`);
      setFolderPreview(null);
      await refresh();onUploaded?.();
    }catch(err){setError(err?.message||"Drive model klasörü bağlanamadı.");}
    finally{setFolderBusy(false);}
  }
  async function searchExistingPsd() {
    if(psdQuery.trim().length<2 || psdBusy || readOnly)return;
    setPsdBusy(true);setPsdItems([]);setSelectedPsd(null);setError("");setNotice("");
    try{
      const result=await apiGet("/model-files/library/outgoing",{...query,q:psdQuery.trim()},{forceFresh:true});
      setPsdItems(result?.data?.items||[]);
      if(!result?.data?.items?.length)setNotice("Aranan PSD indeks içinde bulunamadı. Giden desenler Drive bağlantısı ve taraması kontrol edilmeli.");
    }catch(err){setError(err?.message||"Giden PSD arşivi açılamadı.");}
    finally{setPsdBusy(false);}
  }
  async function linkExistingPsd() {
    if(!selectedPsd || psdBusy || readOnly)return;
    if(!assignments.length || assignments.some(a=>!a.modelId||!a.boy.trim())){
      setError("PSD içindeki her model için BOY alanını seçin.");return;
    }
    setPsdBusy(true);setError("");setNotice("");
    try{
      const payload=await apiFetch(`/model-files/${encodeURIComponent(modelId)}/link-existing-outgoing`,{
        method:"POST",params:query,body:{assetId:selectedPsd.id,assignments:assignments.map(({modelId:id,boy,printArea})=>({modelId:id,boy:boy.trim(),printArea}))}
      });
      const info=payload?.data||payload;
      if(info.copied!==0)throw new Error("Fiziksel kopyalama sonucu beklenmiyor; kayıt kontrol edilmeli.");
      setNotice(`${info.fileName} → ${info.linkedModels} model bağlantısı kaydedildi. PSD Drive'da yerinde kaldı.`);
      setSelectedPsd(null);setPsdItems([]);setPsdQuery("");
      await refresh();onUploaded?.();
    }catch(err){setError(err?.message||"Giden PSD bağlantısı kurulamadı.");}
    finally{setPsdBusy(false);}
  }
  const isPsd = role === "OUTGOING_DESIGN";
  const setAssignment = (key, field, value) => setAssignments((prev) => prev.map((a) => a.key === key ? { ...a, [field]: value } : a));
  const addAssignment = () => setAssignments((prev) => [...prev, { key: String(Date.now()) + "-" + prev.length, modelId: String(modelId), boy: "", printArea: "" }]);
  const removeAssignment = (key) => setAssignments((prev) => prev.filter((a) => a.key !== key));

  const assignmentEditor = (
    <div className="ky-model-psd-assignments">
      <p><strong>PSD içindeki modeller, BOY ve baskı bölgeleri</strong> — Her satır aynı fiziksel PSD'nin ayrı ilişkisidir.</p>
      {assignments.map((item) => <div className="ky-model-files-assignment" key={item.key}>
        <label>Model
          <select value={item.modelId} disabled={busy||psdBusy} onChange={(ev) => setAssignment(item.key, "modelId", ev.target.value)}>
            {options.map((m) => <option key={m.id} value={m.id}>{m.modelName || m.name || m.id}</option>)}
          </select>
        </label>
        <label>BOY <input value={item.boy} disabled={busy||psdBusy} onChange={(ev) => setAssignment(item.key, "boy", ev.target.value)} placeholder="Küçük Boy / Büyük Boy / Özel ölçü" /></label>
        <label>Baskı bölgesi <select value={item.printArea} disabled={busy||psdBusy} onChange={(ev) => setAssignment(item.key, "printArea", ev.target.value)}>{PRINT_AREAS.map(([code, title]) => <option key={code} value={code}>{title}</option>)}</select></label>
        <button type="button" onClick={() => removeAssignment(item.key)} disabled={busy||psdBusy||assignments.length===1} aria-label="Model BOY bağlantısını kaldır">Sil</button>
      </div>)}
      <button type="button" onClick={addAssignment} disabled={busy||psdBusy||assignments.length>=30}>+ Model / BOY Ekle</button>
    </div>
  );
  async function save() {
    if (!incoming.length || !modelId || !slug || busy) return;
    if (isPsd && assignments.some((a) => !a.modelId || !a.boy.trim())) {
      setError("Giden PSD için her model bağlantısında BOY yazılmalıdır."); return;
    }
    if (incoming.some(({file}) => file.size > 24 * 1024 * 1024)) {
      setError("24 MB üzeri büyük PSD/PSB dosyalarını mevcut Drive giden desenler klasörüyle senkronize edin; bu form küçük dosyalar içindir."); return;
    }
    setError(""); setNotice(""); setBusy(true);
    let completed = 0;
    try {
      for (const {file,relative} of incoming) {
        setBusyFile(file.name);
        const form = new FormData();
        form.append("file", file);
        form.append("fileRole", role);
        if(folderMode)form.append("sourceSubfolder",folderSubpath(relative));
        if (isPsd) form.append("assignments", JSON.stringify(assignments.map(({ modelId: id, boy, printArea }) => ({ modelId: id, boy: boy.trim(), printArea }))));
        const result = await apiUpload(`/model-files/${encodeURIComponent(modelId)}/upload?mainCompanySlug=${encodeURIComponent(slug)}`, form);
        const item = result?.data || result;
        if (item?.archived !== true) throw new Error("Drive arşivleme doğrulanamadı.");
        completed++;
      }
      setNotice(`${completed} dosya Drive arşivine eklendi. Model bağlantıları oluşturuldu.`);
      setIncoming([]);
      setFolderMode(false);
      setExpanded(false);
      await refresh();
      onUploaded?.();
    } catch (err) {
      setError(`${completed} dosya kaydedildi; sonraki dosyada işlem durdu: ${err?.message || "Yükleme hatası"}`);
      setIncoming((prev) => prev.slice(completed));
      await refresh();
    } finally { setBusy(false); setBusyFile(""); }
  }
  async function openFile(file) {
    setError("");
    try {
      const data = await apiFetch(filePath(modelId, file.id), { params: query, responseType: "blob", timeoutMs: 90000 });
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url; link.download = file.fileName || "dosya"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) { setError(err?.message || "Dosya açılamadı."); }
  }

  return (
    <section className="ky-model-files" aria-label="Model kartı dosyaları">
      <div className="ky-model-files-head">
        <div><strong>Model Dosya Arşivi</strong><small>Google Drive · Model klasörü teknik föy + kaynaklar birlikte; PSD tek dosya, birden çok model + BOY</small></div>
        <div className="ky-model-files-actions">
          <button type="button" onClick={refresh} disabled={loading || busy}>{loading ? "Okunuyor…" : "Yenile"}</button>
          {!readOnly && <button type="button" onClick={() => setExpanded((v) => !v)} disabled={busy} aria-expanded={expanded}>{expanded ? "Kapat" : "Dosya Ekle"}</button>}
        </div>
      </div>
      {!readOnly && <>
        <div className="ky-model-folder-import">
          <div><strong>Drive'daki mevcut model klasörü</strong><small>Örn. MAMBI klasöründeki MAMBI.pdf + MAMBI FT ÖLÇÜ.pdf — kaynaklar kopyalanmaz.</small></div>
          <button type="button" onClick={checkDriveFolder} disabled={folderBusy||busy}>{folderBusy?"Kontrol ediliyor…":"Drive Klasörünü Tara"}</button>
          {folderPreview && <div className="ky-model-folder-preview">
            <span>{folderPreview.found||0} dosya bulundu · {folderPreview.alreadyLinked||0} zaten bağlı · {folderPreview.linked||0} yeni bağlantı</span>
            {folderPreview.files?.length>0 && <small>{folderPreview.files.slice(0,5).map((f)=>f.fileName).join(" · ")}{folderPreview.found>5?" …":""}</small>}
            {folderPreview.found>0
              ? <button type="button" onClick={linkDriveFolder} disabled={folderBusy}>Bu Klasörü Model Kartına Bağla</button>
              : <small>Dosya bulunamadı. Drive File Hub taramasını ve klasör adının model adıyla eşleşmesini kontrol edin.</small>}
          </div>}
        </div>
        <details className="ky-model-psd-existing">
          <summary>Drive'da zaten bulunan giden PSD'yi bağla (büyük dosyalar için)</summary>
          <div className="ky-model-psd-search">
            <label>Dosya adı <input type="search" value={psdQuery} onChange={(ev)=>setPsdQuery(ev.target.value)} placeholder="Giden PSD dosya adında ara" /></label>
            <button type="button" disabled={psdBusy||psdQuery.trim().length<2} onClick={searchExistingPsd}>Drive Arşivinde Ara</button>
          </div>
          {!!psdItems.length && <div className="ky-model-psd-results">{psdItems.map((item)=>(
            <button type="button" key={item.id} className={selectedPsd?.id===item.id?"is-selected":""} onClick={()=>{
              setSelectedPsd(item);setRole("OUTGOING_DESIGN");
              setAssignments([{key:"primary",modelId:String(modelId),boy:"",printArea:""}]);setError("");setNotice("");
            }}>{item.fileName} · {(item.size/1048576).toFixed(1)} MB</button>
          ))}</div>}
          {selectedPsd && <div className="ky-model-files-editor">
            <strong>Seçilen PSD: {selectedPsd.fileName}</strong>
            {assignmentEditor}
            <div className="ky-model-files-actions">
              <button type="button" onClick={()=>setSelectedPsd(null)} disabled={psdBusy}>Vazgeç</button>
              <button type="button" onClick={linkExistingPsd} disabled={psdBusy}>{psdBusy?"Bağlanıyor…":"PSD Bağlantılarını Kaydet"}</button>
            </div>
          </div>}
        </details>
        <div
          className={`ky-model-files-drop ${drag ? "is-dragging" : ""}`}
          onDragEnter={(ev) => { ev.preventDefault(); setDrag(true); }}
          onDragOver={(ev) => { ev.preventDefault(); }}
          onDragLeave={(ev) => { ev.preventDefault(); setDrag(false); }}
          onDrop={async (ev) => {
            ev.preventDefault();setDrag(false);
            try{const dropped=await filesFromDrop(ev.dataTransfer);pickFiles(dropped);}
            catch(err){setError(err?.message||"Klasör okunamadı. Klasör Seç düğmesini kullanın.");}
          }}
        >
          <input ref={fileInput} type="file" hidden multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.xml,.psd,.psb,.ai,.eps,.svg,.zip,.tif,.tiff" onChange={(ev) => { pickFiles(ev.target.files); ev.target.value = ""; }} />
          <input ref={folderInput} type="file" hidden multiple webkitdirectory="" onChange={(ev) => { pickFiles(ev.target.files,true); ev.target.value = ""; }} />
          <div className="ky-model-files-actions">
            <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}>Dosya Ekle</button>
            <button type="button" onClick={() => folderInput.current?.click()} disabled={busy}>Klasör Seç</button>
          </div>
          <small>Dosyaları veya model klasörünü bu alana sürükleyebilirsiniz. Klasörün tüm dosyaları kendi adlarıyla tek model paketine girer.</small>
        </div>
      </>}
      {!readOnly && expanded && incoming.length > 0 && (
        <div className="ky-model-files-editor">
          <label>Dosya türü
            <select value={role} onChange={(ev) => setRole(ev.target.value)} disabled={busy||folderMode}>{CATEGORIES.map(([code, title]) => <option key={code} value={code}>{title}</option>)}</select>
          </label>
          <div className="ky-model-files-selected">{incoming.map(({file,relative},i) => <span key={relative + file.name + i}>{relative||file.name} · {(file.size / 1048576).toFixed(1)} MB · {folderMode?modelSourceFileType(file.name):role}</span>)}</div>
          {isPsd && assignmentEditor}
          <div className="ky-model-files-actions">
            <button type="button" onClick={() => { setIncoming([]); setExpanded(false); }} disabled={busy}>Vazgeç</button>
            <button type="button" onClick={save} disabled={busy}>{busy ? `Kaydediliyor: ${busyFile}` : `${incoming.length} Dosyayı Drive'a Kaydet`}</button>
          </div>
        </div>
      )}
      {error && <p className="ky-model-files-error" role="alert">{error}</p>}
      {notice && <p className="ky-model-files-success" role="status">{notice}</p>}
      <details className="ky-model-files-list" open={false}>
        <summary>Bağlı Dosyalar ({files.length})</summary>
        {!files.length ? <p>Henüz bu kartla ilişkilendirilen Drive dosyası yok.</p> :
          <ul>{files.map((f) => <li key={f.id}>
            <div><strong>{f.fileName}</strong><small>{f.role === "MODEL_SOURCE" ? modelSourceFileType(f.fileName) : f.role} · {f.documentNo || ""} {f.documentStatus || ""}</small>
              {(f.variants || []).map((v, i) => <small key={i}>{v.boy || "Boy belirtilmedi"}{v.printArea ? " · " + v.printArea : ""}</small>)}
            </div><button type="button" onClick={() => openFile(f)}>Dosyayı Aç / İndir</button>
          </li>)}</ul>
        }
      </details>
    </section>
  );
}
