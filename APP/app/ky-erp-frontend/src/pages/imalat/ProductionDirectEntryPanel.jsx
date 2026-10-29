import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Edit3, Plus, RotateCcw, Save, Search, ShieldAlert, Trash2 } from "lucide-react";
import { createProductionCenterEntry, createProductionCenterModel, getProductionCenterRecent } from "../../services/productionCenterApi";
import { validateDirectProduction, validCount } from "./productionDirectEntryValidation";
import { availableProductionRegions, filterProductionModels, productionLineNet } from "./productionDirectEntryOptions";
import "./productionDirectEntry.css";

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
const asText = (value) => String(value ?? "").trim();
const machineKey = (machine) => asText(machine?.id || machine?.machineNo || machine?.no);
const machineLabel = (machine) => [machine?.machineNo, machine?.machineName].filter(Boolean).join(" · ");
const nameOf = (model) => asText(model?.modelName || model?.modelAdi);
const modelKey = (model) => asText(model?.id || model?.modelId);
const operatorForShift = (machine, shift) => asText(shift === "Gece"
  ? (machine?.nightOperator ?? machine?.geceMakinaci ?? "")
  : (machine?.dayOperator ?? machine?.gunduzMakinaci ?? ""));
const blankEntry = () => ({ modelId: "", date: today(), quantity: "", shift: "Gündüz", machineId: "",
  ground: "", printRegion: "", printDefectQty: "0", fabricDefectQty: "0", operatorName: "" });
const MAX_QUEUED_ROWS = 100;

export default function ProductionDirectEntryPanel({
  activeMainCompany, models = [], machines = [], companies = [],
  onSaved, onModelCreated, preselectModelId = "", openRequestToken = 0,
}) {
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState(blankEntry);
  const [query, setQuery] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [createdModel, setCreatedModel] = useState(null);
  const [newModelOpen, setNewModelOpen] = useState(false);
  const [newModelName, setNewModelName] = useState("");
  const [newModelCompanyId, setNewModelCompanyId] = useState("");
  const [newModelRegion, setNewModelRegion] = useState("Ön");
  const [creatingModel, setCreatingModel] = useState(false);
  const [queue, setQueue] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [recent, setRecent] = useState([]);
  const [recentError, setRecentError] = useState(false);
  const saveLock = useRef(false);
  const appliedPreselect = useRef("");
  const allModels = useMemo(() => createdModel && !models.some((m) => modelKey(m) === modelKey(createdModel))
    ? [...models, createdModel] : models, [models, createdModel]);
  const selectedModel = allModels.find((m) => modelKey(m) === entry.modelId);
  const selectedMachine = machines.find((m) => machineKey(m) === entry.machineId);
  const regions = useMemo(() => availableProductionRegions(selectedModel), [selectedModel]);
  const suggestions = useMemo(() => filterProductionModels(allModels, query, 9), [allModels, query]);
  const exactMatch = useMemo(() => allModels.some((m) => !m.isVirtual &&
    nameOf(m).localeCompare(asText(query), "tr", { sensitivity: "base" }) === 0), [allModels, query]);
  const draftNet = productionLineNet(entry);
  const queuedGross = queue.reduce((sum, line) => sum + Number(line.quantity), 0);
  const queuedNet = queue.reduce((sum, line) => sum + productionLineNet(line), 0);
  const activeTenant = activeMainCompany?.slug || activeMainCompany?.id;

  const loadRecent = useCallback(async () => {
    if (!activeTenant) return;
    try {
      const result = await getProductionCenterRecent(activeMainCompany, { limit: 8 });
      setRecent(Array.isArray(result) ? result : []);
      setRecentError(false);
    } catch {
      setRecentError(true);
    }
  }, [activeMainCompany, activeTenant]);

  useEffect(() => { void loadRecent(); }, [loadRecent]);
  useEffect(() => {
    setEntry(blankEntry());
    setOpen(false);
    setQueue([]);
    setSelectedIds([]);
    setEditingId("");
    setQuery("");
    setCreatedModel(null);
    setNewModelOpen(false);
    setError("");
    setMessage("");
    appliedPreselect.current = "";
  }, [activeMainCompany?.slug, activeMainCompany?.id]);
  useEffect(() => {
    if (!preselectModelId || appliedPreselect.current === `${openRequestToken}:${preselectModelId}`) return;
    const model = allModels.find((m) => modelKey(m) === preselectModelId && !m.isVirtual);
    if (!model) return;
    appliedPreselect.current = `${openRequestToken}:${preselectModelId}`;
    setEntry((current) => ({ ...current, modelId: modelKey(model),
      printRegion: availableProductionRegions(model)[0],
      ground: asText(model.groundColor) || current.ground }));
    setQuery(nameOf(model));
    setSuggestionsOpen(false);
    setOpen(true);
  }, [preselectModelId, openRequestToken, allModels]);
  useEffect(() => {
    if (openRequestToken > 0) setOpen(true);
  }, [openRequestToken]);

  function clearFeedback() { setError(""); setMessage(""); }
  function field(key, value) {
    clearFeedback();
    setEntry((current) => ({ ...current, [key]: value }));
  }
  function pickModel(model) {
    setEntry((current) => ({ ...current,
      modelId: modelKey(model), printRegion: availableProductionRegions(model)[0],
      ground: asText(model.groundColor) || current.ground }));
    setQuery(nameOf(model));
    setSuggestionsOpen(false);
    setNewModelOpen(false);
    clearFeedback();
  }
  function changeQuery(value) {
    setQuery(value);
    setEntry((current) => ({ ...current, modelId: "", printRegion: "Ön" }));
    setSuggestionIndex(0);
    setSuggestionsOpen(true);
    setNewModelOpen(false);
    clearFeedback();
  }
  function handleSearchKey(event) {
    if (event.key === "Escape") { setSuggestionsOpen(false); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSuggestionsOpen(true);
      setSuggestionIndex((current) => Math.max(0, Math.min(suggestions.length - 1,
        current + (event.key === "ArrowDown" ? 1 : -1))));
    }
    if (event.key === "Enter" && suggestionsOpen && suggestions.length) {
      event.preventDefault();
      pickModel(suggestions[suggestionIndex] || suggestions[0]);
    }
  }
  function changeMachine(id) {
    const machine = machines.find((m) => machineKey(m) === id);
    setEntry((current) => ({ ...current, machineId: id, operatorName: operatorForShift(machine, current.shift) }));
    clearFeedback();
  }
  function changeShift(shift) {
    setEntry((current) => ({ ...current, shift, operatorName: operatorForShift(selectedMachine, shift) }));
    clearFeedback();
  }
  function openNewModel() {
    setNewModelName(asText(query));
    setNewModelCompanyId("");
    setNewModelRegion("Ön");
    setNewModelOpen(true);
    setSuggestionsOpen(false);
    setOpen(true);
    clearFeedback();
  }
  async function createModel() {
    if (creatingModel || saving) return;
    const modelName = asText(newModelName);
    if (modelName.length < 2) { setError("Yeni model adı en az iki karakter olmalıdır."); return; }
    const company = companies.find((c) => asText(c.id) === newModelCompanyId);
    const same = allModels.find((m) => !m.isVirtual &&
      nameOf(m).localeCompare(modelName, "tr", { sensitivity: "base" }) === 0 &&
      asText(m.companyId) === newModelCompanyId);
    if (same) { pickModel(same); setMessage("Bu model zaten kayıtlı; mevcut model seçildi."); return; }
    setCreatingModel(true);
    clearFeedback();
    try {
      const created = await createProductionCenterModel(activeMainCompany, {
        modelName, companyId: newModelCompanyId,
        companyName: company?.name || company?.firmaAdi || "",
        expectedQty: 0, printRegions: newModelRegion,
        sourceModule: "IMALAT_MANUAL",
      });
      if (!modelKey(created)) throw new Error("Yeni modelin kimliği alınamadı, ekranı yenileyin.");
      const next = { ...created, modelName, companyName: company?.name || company?.firmaAdi || "",
        companyId: newModelCompanyId, printRegions: [{ regionName: newModelRegion }] };
      setCreatedModel(next);
      pickModel(next);
      setMessage(created?.duplicate ? "Mevcut model bulundu ve seçildi." : "Yeni model oluşturuldu. Üretim satırını girebilirsiniz.");
      await onModelCreated?.();
    } catch (cause) {
      setError(cause?.message || "Model oluşturulamadı; girilen ad korundu.");
    } finally { setCreatingModel(false); }
  }
  function clearEntry() {
    setEntry(blankEntry()); setQuery(""); setEditingId("");
    setSuggestionsOpen(false); setNewModelOpen(false); clearFeedback();
  }
  function stage(event) {
    event.preventDefault();
    if (saving || creatingModel) return;
    if (!activeTenant) { setError("Önce ana firma seçin."); return; }
    const issue = validateDirectProduction(entry);
    if (issue) { setError(issue); return; }
    if (!selectedModel || selectedModel.isVirtual || !selectedMachine || selectedMachine.isActive === false) {
      setError("Kayıtlı model ve aktif makine seçin."); return;
    }
    if (!regions.includes(entry.printRegion)) { setError("Model için geçerli bir baskı bölgesi seçin."); return; }
    if (!editingId && queue.length >= MAX_QUEUED_ROWS) {
      setError("En fazla 100 satır hazırlanabilir. Önce mevcut satırları kaydedin."); return;
    }
    const row = {
      ...entry,
      id: editingId || crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      modelName: nameOf(selectedModel),
      companyName: asText(selectedModel.companyName),
      machineName: asText(selectedMachine.machineName || selectedMachine.makineAdi),
      quantity: validCount(entry.quantity, true),
      printDefectQty: validCount(entry.printDefectQty),
      fabricDefectQty: validCount(entry.fabricDefectQty),
    };
    setQueue((current) => editingId ? current.map((line) => line.id === editingId ? row : line) : [...current, row]);
    setEditingId("");
    setEntry((current) => ({ ...current, quantity: "", printDefectQty: "0", fabricDefectQty: "0" }));
    setMessage(editingId ? "Satır güncellendi; toplu kayıt bekliyor." : "Satır eklendi; toplu kayıt bekliyor.");
    setError("");
  }
  function editLine(row) {
    setEntry({ modelId: row.modelId, date: row.date, shift: row.shift,
      quantity: String(row.quantity), machineId: row.machineId, ground: row.ground,
      printRegion: row.printRegion, printDefectQty: String(row.printDefectQty),
      fabricDefectQty: String(row.fabricDefectQty), operatorName: row.operatorName });
    setQuery(row.modelName);
    setEditingId(row.id);
    setSuggestionsOpen(false);
    setOpen(true);
    clearFeedback();
  }
  function removeSelected() {
    if (!selectedIds.length || saving) return;
    setQueue((current) => current.filter((row) => !selectedIds.includes(row.id)));
    if (selectedIds.includes(editingId)) setEditingId("");
    setSelectedIds([]); clearFeedback();
  }
  function clearQueue() {
    if (saving || !queue.length) return;
    if (!window.confirm("Henüz kaydedilmemiş tüm üretim satırlarını temizlemek istiyor musunuz?")) return;
    setQueue([]); setSelectedIds([]); setEditingId(""); clearFeedback();
  }
  async function saveAll() {
    if (saveLock.current || saving || creatingModel || !queue.length) return;
    if (!activeTenant) { setError("Önce ana firma seçin."); return; }
    if (editingId) { setError("Düzenlediğiniz satır için önce Satırı Güncelle'ye basın."); return; }
    saveLock.current = true; setSaving(true); setProgress(0); clearFeedback();
    let saved = 0;
    let failure = "";
    // Her satır kendi kalıcı requestId'sini kullanır. Ağ kesilirse kalan satırlar
    // aynı kimlikle yeniden denenir; başarılı satırlar listeden anında çıkar.
    for (const row of queue) {
      try {
        await createProductionCenterEntry(activeMainCompany, {
          modelId: row.modelId, date: row.date, quantity: row.quantity,
          shift: row.shift, machineId: row.machineId, machineName: row.machineName,
          ground: row.ground, printRegion: row.printRegion,
          printDefectQty: row.printDefectQty, fabricDefectQty: row.fabricDefectQty,
          testQty: 0, operatorName: row.operatorName,
          requestId: row.requestId,
        });
        saved += 1;
        setProgress(saved);
        setQueue((current) => current.filter((item) => item.id !== row.id));
        setSelectedIds((current) => current.filter((id) => id !== row.id));
      } catch (cause) {
        failure = cause?.message || "Kayıt sırasında bağlantı veya doğrulama hatası oluştu.";
        break; // Hatalı satır ve henüz gönderilmemiş satırlar korunur.
      }
    }
    saveLock.current = false; setSaving(false);
    if (saved) {
      await Promise.allSettled([loadRecent(), onSaved?.()]);
      window.dispatchEvent(new CustomEvent("kyerp:production-refresh", { detail: { source: "production-serial-entry" } }));
    }
    if (failure) setError(saved ? saved + " satır kaydedildi. Kalan satırlar korundu: " + failure : failure);
    else setMessage(saved + " üretim satırı başarıyla kaydedildi.");
  }

  const selectAll = queue.length > 0 && selectedIds.length === queue.length;
  return (
    <section className="pde-shell" id="direct-production-entry" aria-label="Günlük üretim girişi">
      <header className="pde-head">
        <button type="button" className="pde-head-trigger" disabled={saving || creatingModel}
          aria-expanded={open} aria-controls="pde-expandable" onClick={() => setOpen((value) => !value)}>
          <span className="pde-head-title">
            <span className="pde-eyebrow"><ClipboardList size={15}/> GÜNLÜK ÜRETİM</span>
            <strong className="pde-heading">Üretim Girişi</strong>
            <span className="pde-head-subtitle">{open
              ? "Modeli yaz, kayıtlı olanı seç; satırları hazırla ve toplu kaydet."
              : "Model: " + (nameOf(selectedModel) || "Seçilmedi") + " · " + entry.date + " · " + queuedGross.toLocaleString("tr-TR") + " hazır adet"}</span>
          </span>
          <span className="pde-head-actions">
            <span className="pde-count">{queue.length} hazır satır</span>
            <span className="pde-toggle">
              {open ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
              {open ? "Daralt" : "Girişi Aç"}
            </span>
          </span>
        </button>
      </header>
      {open && <div id="pde-expandable">
        <form className="pde-form" onSubmit={stage}>
          <div className="pde-main-grid">
            <div className="pde-model-search pde-field">
              <label htmlFor="pde-model-input">Model Adı *</label>
              <div className="pde-combobox">
                <div className="pde-input-with-icon"><Search size={15}/>
                  <input id="pde-model-input" autoComplete="off" role="combobox" aria-autocomplete="list"
                    aria-expanded={suggestionsOpen} aria-controls="pde-model-options"
                    value={query} onChange={(event) => changeQuery(event.target.value)}
                    onFocus={() => setSuggestionsOpen(true)} onKeyDown={handleSearchKey}
                    placeholder="Model adını yazın; kayıtlı modeller gelsin" />
                </div>
                {suggestionsOpen && <div className="pde-combobox-menu" id="pde-model-options" role="listbox">
                  {suggestions.map((model, index) =>
                    <button key={modelKey(model)} type="button" role="option"
                      aria-selected={modelKey(model) === entry.modelId}
                      className={index === suggestionIndex ? "pde-option pde-active" : "pde-option"}
                      onMouseDown={(event) => event.preventDefault()} onClick={() => pickModel(model)}>
                      <span>{nameOf(model)}</span><small>{model.companyName || "Firma tanımsız"}</small>
                      {modelKey(model) === entry.modelId && <Check size={14}/>}
                    </button>)}
                  {!suggestions.length && <div className="pde-no-match">Kayıtlı model bulunamadı.</div>}
                  {asText(query).length >= 2 && !exactMatch &&
                    <button type="button" className="pde-create-choice"
                      onMouseDown={(event) => event.preventDefault()} onClick={openNewModel}>
                      <Plus size={15}/> Yeni model oluştur: <strong>{asText(query)}</strong>
                    </button>}
                </div>}
              </div>
            </div>
            <label><span>Tarih *</span><input type="date" value={entry.date} required
              onChange={(event) => field("date", event.target.value)}/></label>
            <label><span>Makine No / Adı *</span><select value={entry.machineId} required
              onChange={(event) => changeMachine(event.target.value)}>
                <option value="">Makine seç</option>
                {machines.filter((m) => m.isActive !== false).map((m) =>
                  <option value={machineKey(m)} key={machineKey(m)}>{machineLabel(m)}</option>)}
              </select></label>
            <label><span>Vardiya *</span><select value={entry.shift} onChange={(event) => changeShift(event.target.value)}>
              <option>Gündüz</option><option>Gece</option></select></label>
            <label><span>Adet *</span><input type="number" min="1" step="1" value={entry.quantity}
              onChange={(event) => field("quantity", event.target.value)} placeholder="0" inputMode="numeric"/></label>
            <label><span>Zemin</span><input value={entry.ground} onChange={(event) => field("ground", event.target.value)}
              placeholder="Örn. EKRU"/></label>
            <label><span>Baskı Bölgesi *</span><select required value={entry.printRegion}
              onChange={(event) => field("printRegion", event.target.value)}>
              <option value="">Bölge seçin</option>
              {regions.map((region) => <option key={region} value={region}>{region}</option>)}
            </select></label>
            <label><span>Baskı Sakatı</span><input type="number" min="0" step="1"
              value={entry.printDefectQty} inputMode="numeric"
              onChange={(event) => field("printDefectQty", event.target.value)}/></label>
            <label><span>Kumaş Sakatı</span><input type="number" min="0" step="1"
              value={entry.fabricDefectQty} inputMode="numeric"
              onChange={(event) => field("fabricDefectQty", event.target.value)}/></label>
            <label className="pde-operator"><span>Makinacı * <small>{entry.shift === "Gece" ? "Gece — ayrı kayıt / elle yazılabilir" : "Gündüz — elle yazılabilir"}</small></span>
              <input required value={entry.operatorName} onChange={(event) => field("operatorName", event.target.value)}
                placeholder="Makinacıyı girin"/></label>
          </div>
          {newModelOpen && <section className="pde-new-model" aria-label="Yeni model oluştur">
            <div className="pde-new-title"><strong>Yeni Model</strong><span>Kayıtlı model yoksa burada oluştur; üretim girişine devam et.</span></div>
            <div className="pde-new-fields">
              <label><span>Model Adı *</span><input value={newModelName}
                onChange={(event) => setNewModelName(event.target.value)} maxLength={150}/></label>
              <label><span>Firma</span><select value={newModelCompanyId}
                onChange={(event) => setNewModelCompanyId(event.target.value)}>
                <option value="">Firma seçilmedi — daha sonra eşleştir</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name || company.firmaAdi}</option>)}
              </select></label>
              <label><span>İlk Baskı Bölgesi</span><select value={newModelRegion}
                onChange={(event) => setNewModelRegion(event.target.value)}>
                {availableProductionRegions(null).map((region) => <option key={region}>{region}</option>)}
              </select></label>
            </div>
            <div className="pde-new-actions">
              <button type="button" onClick={() => setNewModelOpen(false)} disabled={creatingModel}>Vazgeç</button>
              <button type="button" onClick={createModel} disabled={creatingModel || saving}>
                <Plus size={15}/>{creatingModel ? "Oluşturuluyor..." : "Modeli Oluştur ve Seç"}</button>
            </div>
          </section>}
          {selectedModel && <div className="pde-context">
            <span><strong>Model:</strong> {nameOf(selectedModel)}</span>
            <span><strong>Firma:</strong> {selectedModel.companyName || "Henüz eşleştirilmedi"}</span>
          </div>}
          <div className="pde-bottom">
            <div className="pde-net"><small>Net sağlam</small><strong className={draftNet < 0 ? "pde-negative" : ""}>
              {Number.isFinite(draftNet) ? draftNet.toLocaleString("tr-TR") : "—"}</strong>
              <small>Adet − baskı sakatı − kumaş sakatı</small></div>
            <div className="pde-submit">
              <button type="button" className="pde-reset" disabled={saving || creatingModel} onClick={clearEntry}>
                <RotateCcw size={15}/> Yeni Kayıt</button>
              {editingId && <button type="button" className="pde-reset" onClick={() => { setEditingId(""); clearFeedback(); }}>Düzenlemeyi İptal Et</button>}
              <button className="pde-save" type="submit" disabled={saving || creatingModel || !allModels.length || !machines.length}>
                <Plus size={16}/>{editingId ? "Satırı Güncelle" : "Satır Ekle"}</button>
            </div>
          </div>
        </form>
        <div className="pde-queue">
          <div className="pde-queue-head"><div><strong>Seri Giriş Listesi</strong>
            <small>{queue.length} hazır satır • {queuedGross.toLocaleString("tr-TR")} adet • {queuedNet.toLocaleString("tr-TR")} net</small>
          </div><div className="pde-queue-actions">
            <button type="button" onClick={removeSelected} disabled={!selectedIds.length || saving}>
              <Trash2 size={14}/> Seçiliyi Sil</button>
            <button type="button" onClick={clearQueue} disabled={!queue.length || saving}>
              <RotateCcw size={14}/> Tümünü Temizle</button>
            <button type="button" className="pde-bulk-save" onClick={saveAll} disabled={!queue.length || saving || creatingModel}>
              <Save size={15}/>{saving ? progress + " / " + queue.length + " Kaydediliyor" : "Toplu Kaydet (" + queue.length + ")"}</button>
          </div></div>
          {queue.length ? <div className="pde-queue-scroll"><table><thead><tr>
            <th><input aria-label="Tüm hazır satırları seç" type="checkbox" checked={selectAll}
              onChange={(e) => setSelectedIds(e.target.checked ? queue.map((r) => r.id) : [])} disabled={saving}/></th>
            <th>Model</th><th>Tarih</th><th>Makine</th><th>Vardiya</th><th>Adet</th><th>Zemin</th><th>Bölge</th>
            <th>Baskı Sakat</th><th>Kumaş Sakat</th><th>Net</th><th>Makinacı</th><th>İşlem</th>
          </tr></thead><tbody>{queue.map((row) => <tr key={row.id}>
            <td><input aria-label={row.modelName + " satırını seç"} type="checkbox"
              checked={selectedIds.includes(row.id)} disabled={saving}
              onChange={(e) => setSelectedIds((current) => e.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id))}/></td>
            <td><strong>{row.modelName}</strong><small>{row.companyName || ""}</small></td>
            <td>{row.date}</td><td>{row.machineName || row.machineId}</td><td>{row.shift}</td>
            <td>{Number(row.quantity).toLocaleString("tr-TR")}</td><td>{row.ground || "—"}</td><td>{row.printRegion}</td>
            <td>{row.printDefectQty}</td><td>{row.fabricDefectQty}</td><td>{productionLineNet(row).toLocaleString("tr-TR")}</td>
            <td>{row.operatorName}</td><td><button type="button" disabled={saving} onClick={() => editLine(row)}>
              <Edit3 size={13}/> Düzenle</button></td>
          </tr>)}</tbody></table></div>
          : <div className="pde-queue-empty">Üstteki alanları doldurup <strong>Satır Ekle</strong> deyin; satırlar burada birikir. Kaydetmeden D1'e yazılmaz.</div>}
          {error && <div className="pde-error" role="alert"><ShieldAlert size={15}/>{error}</div>}
          {message && <div className="pde-success" role="status"><CheckCircle2 size={15}/>{message}</div>}
          {saving && <p className="pde-progress" role="status">Kayıtlar sırayla ve güvenli biçimde işleniyor. İşlem sırasında sayfayı kapatmayın.</p>}
        </div>
      <section className="pde-recent" aria-label="Son kaydedilen üretimler">
        <div className="pde-recent-head"><strong>Son Kaydedilen Üretimler</strong>
          <button type="button" onClick={loadRecent} title="Son üretimleri yenile"><RotateCcw size={14}/> Yenile</button></div>
        {recentError && <small role="status">Son üretim listesi alınamadı. Giriş alanını kullanabilirsiniz.</small>}
        {recent.length ? <div className="pde-recent-scroll"><table><thead><tr>
          <th>Tarih</th><th>Model</th><th>Adet</th><th>Makine</th><th>Vardiya</th><th>Makinacı</th>
        </tr></thead><tbody>{recent.map((row, index) => <tr key={row.id || index}>
          <td>{row.date || row.tarih}</td><td>{row.modelName || row.model || "—"}</td>
          <td>{Number(row.grossQty || row.adet || 0).toLocaleString("tr-TR")}</td>
          <td>{row.machineId || row.makinaNo || "—"}</td><td>{row.shift || row.vardiya || "—"}</td>
          <td>{row.operatorName || row.makinaci || "—"}</td>
        </tr>)}</tbody></table></div>
        : <p className="pde-empty-recent">Henüz kayıtlı üretim görünmüyor. İlk kaydedilen fiş burada listelenecek.</p>}
      </section>
      </div>}
    </section>
  );
}
