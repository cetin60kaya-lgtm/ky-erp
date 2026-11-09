import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, apiGet, apiUpload } from "../../utils/api";
import "./model-files-panel.css";

const CATEGORIES = [
  ["MODEL_IMAGE", "Model Görseli — JPG / PNG"],
  ["MODEL_SOURCE", "Gelen Model Dosyaları — AI / PDF / TIFF / PSD"],
  ["OUTGOING_DESIGN", "Giden PSD — Birden fazla model / BOY"],
  ["PLACEMENT", "Yerleşim / Kalıp PDF"],
  ["DELIVERY_NOTE", "DDM — İrsaliye"],
  ["INVOICE", "HKN — Fatura"],
];
const PRINT_AREAS = [["", "Baskı bölgesi seçilmedi"], ["FRONT", "Ön"], ["BACK", "Arka"], ["ARM", "Kol"], ["OTHER", "Diğer"]];
const extOf = (name) => String(name || "").split(".").pop().toLowerCase();
const initialRole = (name) => {
  const value = String(name || "");
  const ext = extOf(value);
  if (/^DDM\s*\d{8,}/i.test(value)) return "DELIVERY_NOTE";
  if (/^HKN\s*\d{8,}/i.test(value)) return "INVOICE";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "MODEL_IMAGE";
  if (["psd", "psb"].includes(ext)) return "OUTGOING_DESIGN";
  if (["ai", "tif", "tiff", "eps", "svg", "zip"].includes(ext)) return "MODEL_SOURCE";
  return "MODEL_SOURCE";
};
const rowsOf = (data) => Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
const filePath = (id, fileId) => `/model-files/${encodeURIComponent(id)}/file/${encodeURIComponent(fileId)}`;

export default function ModelFilesPanel({ modelId, modelName = "", activeMainCompany, models = [], onUploaded }) {
  const slug = String(activeMainCompany?.slug || activeMainCompany?.id || "").trim();
  const fileInput = useRef(null);
  const [files, setFiles] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [role, setRole] = useState("MODEL_SOURCE");
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

  const pickFiles = (selection) => {
    const list = [...(selection || [])].filter((item) => item instanceof File);
    if (!list.length) return;
    setIncoming(list);
    setRole(initialRole(list[0]?.name));
    setAssignments([{ key: "primary", modelId: String(modelId), boy: "", printArea: "" }]);
    setError(""); setNotice(""); setExpanded(true);
  };
  const isPsd = role === "OUTGOING_DESIGN";
  const setAssignment = (key, field, value) => setAssignments((prev) => prev.map((a) => a.key === key ? { ...a, [field]: value } : a));
  const addAssignment = () => setAssignments((prev) => [...prev, { key: String(Date.now()) + "-" + prev.length, modelId: String(modelId), boy: "", printArea: "" }]);
  const removeAssignment = (key) => setAssignments((prev) => prev.filter((a) => a.key !== key));

  async function save() {
    if (!incoming.length || !modelId || !slug || busy) return;
    if (isPsd && assignments.some((a) => !a.modelId || !a.boy.trim())) {
      setError("Giden PSD için her model bağlantısında BOY yazılmalıdır."); return;
    }
    if (incoming.some((f) => f.size > 24 * 1024 * 1024)) {
      setError("24 MB üzeri büyük PSD/PSB dosyalarını mevcut Drive giden desenler klasörüyle senkronize edin; bu form küçük dosyalar içindir."); return;
    }
    setError(""); setNotice(""); setBusy(true);
    let completed = 0;
    try {
      for (const file of incoming) {
        setBusyFile(file.name);
        const form = new FormData();
        form.append("file", file);
        form.append("fileRole", role);
        if (isPsd) form.append("assignments", JSON.stringify(assignments.map(({ modelId: id, boy, printArea }) => ({ modelId: id, boy: boy.trim(), printArea }))));
        const result = await apiUpload(`/model-files/${encodeURIComponent(modelId)}/upload?mainCompanySlug=${encodeURIComponent(slug)}`, form);
        const item = result?.data || result;
        if (item?.archived !== true) throw new Error("Drive arşivleme doğrulanamadı.");
        completed++;
      }
      setNotice(`${completed} dosya Drive arşivine eklendi. Model bağlantıları oluşturuldu.`);
      setIncoming([]);
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
        <div><strong>Model Dosya Arşivi</strong><small>Google Drive · Tek dosya, tüm ilgili model kartlarında görünür</small></div>
        <div className="ky-model-files-actions">
          <button type="button" onClick={refresh} disabled={loading || busy}>{loading ? "Okunuyor…" : "Yenile"}</button>
          <button type="button" onClick={() => setExpanded((v) => !v)} disabled={busy} aria-expanded={expanded}>{expanded ? "Kapat" : "Dosya Ekle"}</button>
        </div>
      </div>
      <div
        className={`ky-model-files-drop ${drag ? "is-dragging" : ""}`}
        onDragEnter={(ev) => { ev.preventDefault(); setDrag(true); }}
        onDragOver={(ev) => { ev.preventDefault(); }}
        onDragLeave={(ev) => { ev.preventDefault(); setDrag(false); }}
        onDrop={(ev) => { ev.preventDefault(); setDrag(false); pickFiles(ev.dataTransfer.files); }}
      >
        <input ref={fileInput} type="file" hidden multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.xml,.psd,.psb,.ai,.eps,.svg,.zip,.tif,.tiff" onChange={(ev) => { pickFiles(ev.target.files); ev.target.value = ""; }} />
        <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}>Dosya Seç veya Buraya Sürükle</button>
        <small>Dosya adı ve model adı yazmak zorunda değilsiniz. Büyük PSD için Drive senkronu kullanılır.</small>
      </div>
      {expanded && incoming.length > 0 && (
        <div className="ky-model-files-editor">
          <label>Dosya türü
            <select value={role} onChange={(ev) => setRole(ev.target.value)} disabled={busy}>{CATEGORIES.map(([code, title]) => <option key={code} value={code}>{title}</option>)}</select>
          </label>
          <div className="ky-model-files-selected">{incoming.map((f) => <span key={f.name + f.size}>{f.name} · {(f.size / 1048576).toFixed(1)} MB</span>)}</div>
          {isPsd && <>
            <p><strong>PSD içindeki modeller, boylar ve baskı bölgeleri</strong> — Dosya bir kez Drive'a kaydedilir. Her satır aynı dosyanın ayrı ilişkisidir.</p>
            {assignments.map((item) => <div className="ky-model-files-assignment" key={item.key}>
              <label>Model
                <select value={item.modelId} disabled={busy} onChange={(ev) => setAssignment(item.key, "modelId", ev.target.value)}>
                  {options.map((m) => <option key={m.id} value={m.id}>{m.modelName || m.name || m.id}</option>)}
                </select>
              </label>
              <label>BOY <input value={item.boy} disabled={busy} onChange={(ev) => setAssignment(item.key, "boy", ev.target.value)} placeholder="Küçük Boy / Büyük Boy / Özel ölçü" /></label>
              <label>Baskı bölgesi <select value={item.printArea} disabled={busy} onChange={(ev) => setAssignment(item.key, "printArea", ev.target.value)}>{PRINT_AREAS.map(([code, title]) => <option key={code} value={code}>{title}</option>)}</select></label>
              <button type="button" onClick={() => removeAssignment(item.key)} disabled={busy || assignments.length === 1} aria-label="Model boy bağlantısını kaldır">Sil</button>
            </div>)}
            <button type="button" onClick={addAssignment} disabled={busy || assignments.length >= 30}>+ Model / Boy Ekle</button>
          </>}
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
            <div><strong>{f.fileName}</strong><small>{f.role} · {f.documentNo || ""} {f.documentStatus || ""}</small>
              {(f.variants || []).map((v, i) => <small key={i}>{v.boy || "Boy belirtilmedi"}{v.printArea ? " · " + v.printArea : ""}</small>)}
            </div><button type="button" onClick={() => openFile(f)}>Dosyayı Aç / İndir</button>
          </li>)}</ul>
        }
      </details>
    </section>
  );
}
