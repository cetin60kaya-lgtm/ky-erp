import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ClipboardList, RotateCcw, Save, Search, ShieldAlert } from "lucide-react";
import { createProductionCenterEntry, getProductionCenterRecent } from "../../services/productionCenterApi";
import "./productionDirectEntry.css";
import { validateDirectProduction, validCount } from "./productionDirectEntryValidation";

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
const asText = (value) => String(value ?? "").trim();
const machineKey = (machine) => asText(machine?.id || machine?.machineNo || machine?.no);
const machineLabel = (machine) => [machine?.machineNo, machine?.machineName].filter(Boolean).join(" · ");
const operatorForShift = (machine, shift) => {
  if (!machine) return "";
  return asText(shift === "Gece"
    ? (machine.nightOperator ?? machine.geceMakinaci ?? "")
    : (machine.dayOperator ?? machine.gunduzMakinaci ?? ""));
};
const normalize = (value) => asText(value).toLocaleUpperCase("tr-TR");
function regions(model) {
  return [...new Set((model?.printRegions || [])
    .map((item) => asText(typeof item === "string" ? item : item.regionName || item.name || item.printAreaName))
    .filter(Boolean))];
}
function blankEntry() {
  return { modelId: "", date: today(), quantity: "", shift: "Gündüz", machineId: "",
    ground: "", printRegion: "", printDefectQty: "0", fabricDefectQty: "0", operatorName: "" };
}
export default function ProductionDirectEntryPanel({ activeMainCompany, models = [], machines = [], onSaved, preselectModelId = "" }) {
  const [entry, setEntry] = useState(blankEntry);
  const [modelSearch, setModelSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState([]);
  const [recentError, setRecentError] = useState(false);
  const saveLock = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  const selectedModel = models.find((model) => asText(model.id || model.modelId) === entry.modelId);
  const selectedMachine = machines.find((machine) => machineKey(machine) === entry.machineId);
  const modelRegions = regions(selectedModel);
  const matchingModels = useMemo(() => {
    const q = normalize(modelSearch);
    const filtered = models.filter((model) => !model.isVirtual &&
      (!q || normalize([model.modelName, model.modelAdi, model.companyName, model.modelCode].join(" ")).includes(q)));
    return filtered.slice(0, 350);
  }, [models, modelSearch]);

  const loadRecent = useCallback(async () => {
    if (!(activeMainCompany?.slug || activeMainCompany?.id)) return;
    try {
      const result = await getProductionCenterRecent(activeMainCompany, { limit: 8 });
      setRecent(Array.isArray(result) ? result : []);
      setRecentError(false);
    } catch {
      setRecentError(true);
    }
  }, [activeMainCompany]);

  useEffect(() => { void loadRecent(); }, [loadRecent]);
  useEffect(() => {
    setEntry(blankEntry());
    setModelSearch("");
    setMessage("");
    setError("");
    requestId.current = crypto.randomUUID();
  }, [activeMainCompany?.slug, activeMainCompany?.id]);
  useEffect(() => {
    if (!preselectModelId) return;
    const model = models.find((item) => asText(item.id || item.modelId) === preselectModelId && !item.isVirtual);
    if (!model) return;
    setModelSearch(asText(model.modelName));
    setEntry((current) => ({ ...current,
      modelId: asText(model.id || model.modelId), printRegion: regions(model)[0] || "",
      ground: asText(model.groundColor) || current.ground,
    }));
  }, [preselectModelId, models]);

  const net = Number(entry.quantity || 0) - Number(entry.printDefectQty || 0) - Number(entry.fabricDefectQty || 0);
  const setField = (key, value) => {
    setMessage("");
    setError("");
    setEntry((current) => ({ ...current, [key]: value }));
  };
  const selectModel = (value) => {
    const model = models.find((item) => asText(item.id || item.modelId) === value);
    setMessage(""); setError("");
    setEntry((current) => ({ ...current, modelId: value,
      printRegion: regions(model)[0] || "", ground: asText(model?.groundColor) || current.ground }));
  };
  const selectMachine = (value) => {
    const machine = machines.find((item) => machineKey(item) === value);
    setMessage(""); setError("");
    setEntry((current) => ({ ...current, machineId: value,
      operatorName: operatorForShift(machine, current.shift) }));
  };
  const selectShift = (shift) => {
    setMessage(""); setError("");
    setEntry((current) => ({ ...current, shift, operatorName: operatorForShift(selectedMachine, shift) }));
  };
  async function save(event) {
    event.preventDefault();
    if (saveLock.current || saving) return;
    if (!(activeMainCompany?.slug || activeMainCompany?.id)) {
      setError("Önce ana firma seçin."); return;
    }
    const issue = validateDirectProduction(entry);
    if (issue) { setError(issue); return; }
    if (!selectedModel || selectedModel.isVirtual || !selectedMachine || selectedMachine.isActive === false) {
      setError("Kayıtlı model ve aktif makine seçilmelidir."); return;
    }
    const quantity = validCount(entry.quantity, true);
    const printDefectQty = validCount(entry.printDefectQty);
    const fabricDefectQty = validCount(entry.fabricDefectQty);
    saveLock.current = true;
    setSaving(true); setError("");
    try {
      await createProductionCenterEntry(activeMainCompany, {
        modelId: entry.modelId, date: entry.date, quantity, shift: entry.shift,
        machineId: entry.machineId, machineName: asText(selectedMachine.machineName || selectedMachine.makineAdi),
        ground: asText(entry.ground), printRegion: entry.printRegion,
        printDefectQty, fabricDefectQty, testQty: 0, operatorName: asText(entry.operatorName),
        requestId: requestId.current,
      });
      requestId.current = crypto.randomUUID();
      setEntry((current) => ({ ...current, quantity: "", printDefectQty: "0", fabricDefectQty: "0" }));
      setMessage(quantity.toLocaleString("tr-TR") + " adet üretim kaydedildi. Yeni satır girilebilir.");
      await Promise.allSettled([loadRecent(), onSaved?.()]);
      window.dispatchEvent(new CustomEvent("kyerp:production-refresh",
        { detail: { source: "direct-entry", modelId: entry.modelId } }));
    } catch (cause) {
      setError(cause?.message || "Üretim kaydedilemedi. Değişiklikler formda korunuyor.");
    } finally {
      saveLock.current = false; setSaving(false);
    }
  }

  return (
    <section className="pde-shell" id="direct-production-entry" aria-label="Doğrudan üretim girişi">
      <header className="pde-head">
        <div><span className="pde-eyebrow"><ClipboardList size={15} /> GÜNLÜK İMALAT KAYDI</span>
          <h2>Üretim Girişi</h2>
          <p>Excel'deki üretim alanlarıyla doğrudan fiş kaydet. Makinacı gündüz ve gece için ayrı belirlenir.</p>
        </div>
        <div className="pde-head-note"><span>10 alan</span><small>Tek fiş • Tek kaydet</small></div>
      </header>
      <form className="pde-form" onSubmit={save}>
        <div className="pde-main-grid">
          <label className="pde-model-search"><span>Model ara</span><div className="pde-input-with-icon"><Search size={15} /><input value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} placeholder="Model adıyla hızlı ara" /></div></label>
          <label className="pde-model-select"><span>Model Adı *</span><select required value={entry.modelId} onChange={(event) => selectModel(event.target.value)}><option value="">Kayıtlı model seçin</option>
            {matchingModels.map((model) => <option key={model.id} value={model.id}>{model.modelName || model.modelAdi} · {model.companyName || "Firma tanımsız"}</option>)}
            {selectedModel && !matchingModels.some((model) => model.id === selectedModel.id) && <option value={selectedModel.id}>{selectedModel.modelName} · {selectedModel.companyName || "Firma tanımsız"}</option>}
          </select></label>
          <label><span>Tarih *</span><input type="date" required value={entry.date} onChange={(event) => setField("date",event.target.value)} /></label>
          <label><span>Adet *</span><input type="number" min="1" step="1" required inputMode="numeric" value={entry.quantity} onChange={(event) => setField("quantity",event.target.value)} placeholder="0" /></label>
          <label><span>Vardiya *</span><select value={entry.shift} onChange={(event) => selectShift(event.target.value)}><option>Gündüz</option><option>Gece</option></select></label>
          <label><span>Makine No *</span><select required value={entry.machineId} onChange={(event) => selectMachine(event.target.value)}><option value="">Makine seçin</option>
            {machines.filter((machine) => machine.isActive !== false).map((machine) =>
              <option key={machineKey(machine)} value={machineKey(machine)}>{machineLabel(machine)}</option>)}</select></label>
          <label><span>Zemin</span><input value={entry.ground} onChange={(event) => setField("ground", event.target.value)} placeholder="Örn. EKRU" /></label>
          <label><span>Baskı Bölgesi *</span>{modelRegions.length ? <select required value={entry.printRegion} onChange={(event) => setField("printRegion",event.target.value)}><option value="">Bölge seçin</option>
            {modelRegions.map((region) => <option key={region} value={region}>{region}</option>)}</select> : <input required value={entry.printRegion} onChange={(event) => setField("printRegion",event.target.value)} placeholder="Ön / Arka / Kol" />}</label>
          <label><span>Baskı Sakatı</span><input type="number" min="0" step="1" inputMode="numeric" value={entry.printDefectQty} onChange={(event) => setField("printDefectQty",event.target.value)} /></label>
          <label><span>Kumaş Sakatı</span><input type="number" min="0" step="1" inputMode="numeric" value={entry.fabricDefectQty} onChange={(event) => setField("fabricDefectQty",event.target.value)} /></label>
          <label className="pde-operator"><span>Makinacı * <small>{entry.shift === "Gece" ? "Gece ayrı kayıt / elle giriş" : "Gündüz kaydı / elle giriş"}</small></span>
            <input required value={entry.operatorName} onChange={(event) => setField("operatorName",event.target.value)} placeholder={entry.shift === "Gece" ? "Gece makinacısı adını yazın" : "Makinacı adı"} /></label>
        </div>
        {selectedModel && <div className="pde-context"><span><strong>Model:</strong> {selectedModel.modelName || selectedModel.modelAdi}</span><span><strong>Firma:</strong> {selectedModel.companyName || "Belirtilmedi"}</span></div>}
        <div className="pde-bottom">
          <div className="pde-net"><small>Net sağlam adet</small><strong className={net < 0 ? "pde-negative" : ""}>{Number.isFinite(net) ? net.toLocaleString("tr-TR") : "—"}</strong><small>Adet − baskı sakatı − kumaş sakatı</small></div>
          <div className="pde-submit">
            {error && <div className="pde-error" role="alert"><ShieldAlert size={15}/>{error}</div>}
            {message && <div className="pde-success" role="status"><CheckCircle2 size={15}/>{message}</div>}
            <button type="button" className="pde-reset" onClick={() => { setEntry(blankEntry()); setModelSearch(""); setError(""); setMessage(""); requestId.current=crypto.randomUUID(); }} disabled={saving}><RotateCcw size={15}/> Temizle</button>
            <button className="pde-save" type="submit" disabled={saving || !models.length || !machines.length}><Save size={17}/>{saving ? "Kaydediliyor..." : "Üretimi Kaydet"}</button>
          </div>
        </div>
      </form>
      <section className="pde-recent" aria-label="Son kaydedilen üretimler">
        <div className="pde-recent-head"><strong>Son Üretim Kayıtları</strong><button type="button" onClick={loadRecent} title="Son üretimleri yenile"><RotateCcw size={14}/> Yenile</button></div>
        {recentError && <small role="status">Son kayıt listesi alınamadı. Üretim girişine devam edebilirsiniz.</small>}
        {recent.length ? <div className="pde-recent-scroll"><table><thead><tr><th>Tarih</th><th>Model</th><th>Adet</th><th>Makine</th><th>Vardiya</th><th>Makinacı</th></tr></thead><tbody>
          {recent.map((row, index) => <tr key={row.id || index}><td>{row.date || row.tarih}</td><td>{row.modelName || row.model || "—"}</td><td>{Number(row.grossQty || row.adet || 0).toLocaleString("tr-TR")}</td><td>{row.machineId || row.makinaNo || "—"}</td><td>{row.shift || row.vardiya || "—"}</td><td>{row.operatorName || row.makinaci || "—"}</td></tr>)}
        </tbody></table></div> : <p className="pde-empty-recent">Henüz kayıtlı üretim görünmüyor. İlk fiş burada listelenecek.</p>}
      </section>
    </section>
  );
}
