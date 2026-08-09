import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  CheckCircle2,
  CircleAlert,
  CirclePlus,
  FileCheck2,
  FileText,
  History,
  ImageIcon,
  Layers3,
  Pencil,
  RefreshCcw,
  Save,
  Search,
  Settings2,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  createProductionCenterEntry,
  createProductionCenterModel,
  deleteProductionCenterEntry,
  getProductionCenter,
  getProductionCenterDictionaries,
  getProductionCenterModel,
  updateProductionCenterEntry,
} from "../../services/productionCenterApi";
import { getDesignModels } from "../../services/desenWorkflowApi";
import { assetUrl } from "../desen/DesenWorkflowShared";
import ProductionSmartEntryDrawer from "./ProductionSmartEntryDrawer";
import "./productionControlCenterV2.css";

const PAGE_SIZE = 100;
const today = () => new Date().toISOString().slice(0, 10);
const asNumber = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const qty = (value) =>
  asNumber(value).toLocaleString("tr-TR", { maximumFractionDigits: 3 });
const dateText = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value).slice(0, 10)
    : parsed.toLocaleDateString("tr-TR");
};

function machineId(machine) {
  return String(machine?.id || machine?.machineNo || machine?.no || "");
}
function machineName(machine) {
  return String(
    machine?.machineName || machine?.makineAdi || machine?.ad || machine?.machineNo || "",
  );
}
function operatorFor(machine, shift) {
  if (!machine) return "";
  return String(shift || "").toLocaleLowerCase("tr-TR").includes("gece")
    ? machine.nightOperator || machine.geceMakinaci || machine.dayOperator || ""
    : machine.dayOperator || machine.gunduzMakinaci || "";
}
function statusLabel(value) {
  return {
    NEW_MODEL: "Yeni model",
    DISPATCH_WAITING: "İrsaliye bekliyor",
    PRODUCTION_OPEN: "Üretim bekliyor",
    INVOICE_OPEN: "Fatura bekliyor",
    OVER_PRODUCTION: "Fazla üretim",
    OVER_INVOICED: "Fazla fatura",
    COMPLETED: "Tamamlandı",
  }[value] || value || "Yeni model";
}
function statusTone(value) {
  if (value === "COMPLETED") return "success";
  if (["OVER_PRODUCTION", "OVER_INVOICED"].includes(value)) return "danger";
  if (value === "INVOICE_OPEN") return "violet";
  if (value === "PRODUCTION_OPEN") return "blue";
  return "warning";
}
function imageSrc(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return assetUrl(raw);
  } catch {
    return raw;
  }
}

function Drawer({ open, title, subtitle, onClose, children, footer, wide = false }) {
  if (!open) return null;
  return (
    <div className="pc2-layer" onMouseDown={onClose} role="presentation">
      <aside
        className={`pc2-drawer ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="pc2-drawer-head">
          <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button type="button" className="pc2-icon" onClick={onClose} aria-label="Kapat"><X size={19} /></button>
        </header>
        <div className="pc2-drawer-body">{children}</div>
        {footer ? <footer className="pc2-drawer-foot">{footer}</footer> : null}
      </aside>
    </div>
  );
}

function defaultModelDraft() {
  return {
    modelName: "",
    modelCode: "",
    companyId: "",
    expectedQty: "",
    printRegions: "Ön",
    orderNo: "",
    dispatchNo: "",
  };
}

function defaultEntry(model, dictionaries, source = null) {
  const firstMachine = dictionaries?.machines?.[0];
  const region =
    source?.printArea ||
    model?.printRegions?.[0]?.regionName ||
    model?.operationRows?.[0]?.region ||
    "Ön";
  const shift = source?.shift || "Gündüz";
  const selectedMachine = source
    ? dictionaries?.machines?.find((item) => machineId(item) === String(source.machineId || ""))
    : firstMachine;
  return {
    id: source?.id || "",
    modelId: model?.id || source?.modelId || "",
    date: source?.date || today(),
    printRegion: region,
    quantity: source?.grossQty || "",
    printDefectQty: source?.printDefectQty || "",
    fabricDefectQty: source?.fabricDefectQty || "",
    testQty: source?.testQty || "",
    machineId: selectedMachine ? machineId(selectedMachine) : source?.machineId || "",
    machineName: selectedMachine ? machineName(selectedMachine) : source?.machineName || "",
    shift,
    operatorName:
      source?.operatorName ||
      (selectedMachine ? operatorFor(selectedMachine, shift) : ""),
    batchNo: source?.batchNo || model?.defaultDispatchNo || "GENEL",
    dispatchNo: source?.dispatchNo || model?.defaultDispatchNo || "",
    orderNo: source?.orderNo || model?.orderNo || "",
    note: source?.note || "",
  };
}

export default function ProductionControlCenterPageV2({ activeMainCompany }) {
  const [center, setCenter] = useState({ rows: [], summary: {}, pagination: {} });
  const [dictionaries, setDictionaries] = useState({ models: [], machines: [], operators: [], companies: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [designOpen, setDesignOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelDraft, setModelDraft] = useState(defaultModelDraft());
  const [detail, setDetail] = useState(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entry, setEntry] = useState(defaultEntry(null, {}));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug && !activeMainCompany?.id) return;
    setLoading(true);
    try {
      const [result, dict] = await Promise.all([
        getProductionCenter(activeMainCompany, {
          search,
          status,
          page: 1,
          pageSize: PAGE_SIZE,
          _ts: Date.now(),
        }),
        getProductionCenterDictionaries(activeMainCompany),
      ]);
      setCenter(result || { rows: [], summary: {}, pagination: {} });
      setDictionaries({
        models: Array.isArray(dict?.models) ? dict.models : [],
        machines: Array.isArray(dict?.machines) ? dict.machines : [],
        operators: Array.isArray(dict?.operators) ? dict.operators : [],
        companies: Array.isArray(dict?.companies) ? dict.companies : [],
      });
      setMessage("");
    } catch (error) {
      setMessage(error?.message || "İmalat merkezi yüklenemedi.");
      setCenter({ rows: [], summary: {}, pagination: {} });
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(load, 150);
    return () => window.clearTimeout(timer);
  }, [load]);

  const summary = center.summary || {};

  async function openDetail(row) {
    setMessage("");
    try {
      const full = await getProductionCenterModel(activeMainCompany, row.id);
      setDetail(full);
    } catch (error) {
      setMessage(error?.message || "Model detayı açılamadı.");
    }
  }

  function openEntry(model, source = null) {
    if (!model) return;
    if (!dictionaries.machines.length) {
      setMessage("Önce Makine ve Vardiya Ayarları ekranından en az bir aktif makine tanımlayın.");
      return;
    }
    setEntry(defaultEntry(model, dictionaries, source));
    setEntryOpen(true);
  }

  async function saveEntry() {
    if (!entry.modelId || asNumber(entry.quantity) <= 0) {
      setMessage("Model ve sıfırdan büyük üretim adedi zorunludur.");
      return;
    }
    if (!entry.machineId || !entry.operatorName || !entry.printRegion) {
      setMessage("Baskı bölgesi, makine ve makinacı zorunludur.");
      return;
    }
    const defects = asNumber(entry.printDefectQty) + asNumber(entry.fabricDefectQty) + asNumber(entry.testQty);
    if (defects > asNumber(entry.quantity)) {
      setMessage("Sakat ve test toplamı üretim adedini aşamaz.");
      return;
    }
    setSaving(true);
    try {
      if (entry.id) await updateProductionCenterEntry(activeMainCompany, entry.id, entry);
      else await createProductionCenterEntry(activeMainCompany, entry);
      setEntryOpen(false);
      setMessage(`${entry.id ? "Üretim kaydı güncellendi" : "Üretim kaydedildi"}: ${qty(entry.quantity)} adet.`);
      await load();
      if (detail?.id === entry.modelId) {
        const full = await getProductionCenterModel(activeMainCompany, entry.modelId);
        setDetail(full);
      }
    } catch (error) {
      setMessage(error?.message || "Üretim kaydı tamamlanamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(row) {
    if (!window.confirm(`${qty(row.grossQty)} adet ${row.printArea || "üretim"} kaydı silinsin mi?`)) return;
    try {
      await deleteProductionCenterEntry(activeMainCompany, row.id);
      setMessage("Üretim kaydı silindi.");
      await load();
      if (detail?.id) setDetail(await getProductionCenterModel(activeMainCompany, detail.id));
    } catch (error) {
      setMessage(error?.message || "Üretim kaydı silinemedi.");
    }
  }

  async function saveManualModel() {
    if (!modelDraft.modelName.trim()) {
      setMessage("Model adı zorunludur.");
      return;
    }
    setSaving(true);
    try {
      const company = dictionaries.companies.find((row) => row.id === modelDraft.companyId);
      const saved = await createProductionCenterModel(activeMainCompany, {
        ...modelDraft,
        companyName: company?.name || "",
        expectedQty: asNumber(modelDraft.expectedQty),
        sourceModule: "IMALAT_MANUAL",
      });
      setModelOpen(false);
      setModelDraft(defaultModelDraft());
      await load();
      const full = await getProductionCenterModel(activeMainCompany, saved.id || saved.modelId);
      setDetail(full);
      setMessage(saved?.duplicate ? "Model zaten üretimdeydi; mevcut kayıt açıldı." : "Yeni model üretime açıldı.");
    } catch (error) {
      setMessage(error?.message || "Model üretime açılamadı.");
    } finally {
      setSaving(false);
    }
  }

  async function takeDesignToProduction(design) {
    setSaving(true);
    try {
      const regions = (design.operations || [])
        .map((operation) => operation.printAreaName)
        .filter(Boolean);
      const saved = await createProductionCenterModel(activeMainCompany, {
        designModelId: design.id,
        modelName: design.modelName,
        modelCode: design.modelCode || "",
        companyId: design.companyId || "",
        companyName: design.companyName || "",
        expectedQty: 0,
        printRegions: regions.length ? regions : ["Ön"],
        imageUrl: design.mainImage?.previewUrl || design.mainImage?.thumbnailUrl || "",
        sourceModule: "DESEN_HAVUZU",
      });
      setDesignOpen(false);
      await load();
      const full = await getProductionCenterModel(activeMainCompany, saved.id || saved.modelId);
      setDetail(full);
      setMessage(saved?.duplicate ? `${design.modelName} zaten üretimdeydi; mevcut kart açıldı.` : `${design.modelName} Desen Havuzundan üretime açıldı.`);
      if (dictionaries.machines.length) openEntry(full);
    } catch (error) {
      setMessage(error?.message || "Desen modeli üretime alınamadı.");
    } finally {
      setSaving(false);
    }
  }

  function changeEntryMachine(nextId) {
    const machine = dictionaries.machines.find((row) => machineId(row) === String(nextId));
    setEntry((current) => ({
      ...current,
      machineId: nextId,
      machineName: machineName(machine),
      operatorName: operatorFor(machine, current.shift),
    }));
  }

  function changeShift(nextShift) {
    const machine = dictionaries.machines.find((row) => machineId(row) === String(entry.machineId));
    setEntry((current) => ({
      ...current,
      shift: nextShift,
      operatorName: operatorFor(machine, nextShift) || current.operatorName,
    }));
  }

  return (
    <div className="pc2-page">
      <section className="pc2-head">
        <div>
          <span>İMALAT · TEK MERKEZ</span>
          <h1>Model ve Üretim Merkezi</h1>
          <p>Desen Havuzundan modeli seç, üretime aç ve aynı ekrandan adet girişini yap.</p>
        </div>
        <div className="pc2-actions">
          <button className="primary" type="button" onClick={() => setDesignOpen(true)}><ImageIcon size={16} /> Desenlerden Model Al</button>
          <button type="button" onClick={() => setModelOpen(true)}><CirclePlus size={16} /> Yeni Model</button>
          <button type="button" onClick={() => setSmartOpen(true)}><Zap size={16} /> Akıllı Seri Giriş</button>
        </div>
      </section>

      {message ? <div className="pc2-notice"><CircleAlert size={17} /> {message}</div> : null}

      <section className="pc2-metrics">
        <Metric label="Üretimde model" value={summary.modelCount || 0} helper="Yalnız gerçekten açılan modeller" />
        <Metric label="Gelen adet" value={qty(summary.totalIncomingQty)} helper="Eşleşen irsaliye / manuel hedef" />
        <Metric label="Net tamamlanan" value={qty(summary.totalCompletedNetQty)} helper="Sakat ve test düşülmüş" tone="success" />
        <Metric label="Üretim bekleyen" value={summary.productionOpenCount || 0} helper="Eksik üretim" tone="blue" />
        <Metric label="İrsaliye bekleyen" value={summary.dispatchWaitingCount || 0} helper="Üretim var, irsaliye yok" tone="warning" />
        <Metric label="Kontrol gerekli" value={summary.controlCount || 0} helper="Fazla üretim / fatura" tone={summary.controlCount ? "danger" : "success"} />
      </section>

      <section className="pc2-toolbar">
        <label className="pc2-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Model, firma, sipariş veya irsaliye ara" /></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="ALL">Tüm durumlar</option>
          <option value="NEW_MODEL">Yeni model</option>
          <option value="DISPATCH_WAITING">İrsaliye bekliyor</option>
          <option value="PRODUCTION_OPEN">Üretim bekliyor</option>
          <option value="INVOICE_OPEN">Fatura bekliyor</option>
          <option value="COMPLETED">Tamamlandı</option>
          <option value="OVER_PRODUCTION">Fazla üretim</option>
        </select>
        <span>{center.pagination?.total || center.rows?.length || 0} kayıt</span>
        <button type="button" onClick={load} disabled={loading}><RefreshCcw size={15} /> Yenile</button>
      </section>

      <section className="pc2-table-card">
        <div className="pc2-table-wrap">
          <table>
            <thead><tr><th>Görsel</th><th>Model / Firma</th><th>Gelen</th><th>Üretim</th><th>Net</th><th>Kalan</th><th>Faturalanan</th><th>Durum</th><th /></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9}>İmalat verileri yükleniyor…</td></tr> : null}
              {!loading && !(center.rows || []).length ? <tr><td colSpan={9}><div className="pc2-empty"><Boxes size={28} /><strong>İmalat merkezi temiz ve boş.</strong><span>Desenlerden Model Al ile ilk modeli üretime aç.</span><button className="primary" onClick={() => setDesignOpen(true)}><ImageIcon size={16} /> Desenlerden Model Al</button></div></td></tr> : null}
              {(center.rows || []).map((row) => (
                <tr key={row.id}>
                  <td><button className="pc2-thumb" type="button" onClick={() => openDetail(row)}>{row.imageUrl ? <img src={imageSrc(row.imageUrl)} alt={row.modelName} /> : <ImageIcon size={22} />}</button></td>
                  <td><strong>{row.modelName}</strong><small>{row.companyName || "Firma bekliyor"}</small></td>
                  <td>{qty(row.incomingQty)}</td>
                  <td>{qty(row.completedGrossQty)}</td>
                  <td>{qty(row.completedNetQty)}</td>
                  <td>{qty(row.productionRemainingQty)}</td>
                  <td>{qty(row.invoicedQty)}</td>
                  <td><span className={`pc2-status ${statusTone(row.status)}`}>{statusLabel(row.status)}</span></td>
                  <td><div className="pc2-row-actions"><button className="primary" type="button" onClick={() => openEntry(row)}><Layers3 size={14} /> Üretim Gir</button><button type="button" onClick={() => openDetail(row)}>Detay</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ProductionSmartEntryDrawer
        open={smartOpen}
        activeMainCompany={activeMainCompany}
        onClose={() => setSmartOpen(false)}
        onSaved={load}
      />

      <DesignPickerDrawer
        open={designOpen}
        activeMainCompany={activeMainCompany}
        onClose={() => setDesignOpen(false)}
        onChoose={takeDesignToProduction}
        saving={saving}
      />

      <Drawer
        open={modelOpen}
        title="Yeni Model Aç"
        subtitle="Desende henüz olmayan veya hızlı başlanacak işi manuel üretime aç."
        onClose={() => setModelOpen(false)}
        footer={<><button type="button" onClick={() => setModelOpen(false)}>Vazgeç</button><button type="button" className="primary" onClick={saveManualModel} disabled={saving}><Save size={15} /> {saving ? "Kaydediliyor" : "Modeli Aç"}</button></>}
      >
        <div className="pc2-form-grid two">
          <label>Model adı *<input value={modelDraft.modelName} onChange={(event) => setModelDraft((current) => ({ ...current, modelName: event.target.value }))} autoFocus /></label>
          <label>Firma<select value={modelDraft.companyId} onChange={(event) => setModelDraft((current) => ({ ...current, companyId: event.target.value }))}><option value="">Firma bekliyor</option>{dictionaries.companies.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          <label>Hedef / gelen adet<input type="number" min="0" value={modelDraft.expectedQty} onChange={(event) => setModelDraft((current) => ({ ...current, expectedQty: event.target.value }))} placeholder="İrsaliye yoksa boş bırak" /></label>
          <label>Baskı bölgeleri<input value={modelDraft.printRegions} onChange={(event) => setModelDraft((current) => ({ ...current, printRegions: event.target.value }))} placeholder="Ön, Arka, Kol" /></label>
          <label>Sipariş no<input value={modelDraft.orderNo} onChange={(event) => setModelDraft((current) => ({ ...current, orderNo: event.target.value }))} /></label>
          <label>İrsaliye no<input value={modelDraft.dispatchNo} onChange={(event) => setModelDraft((current) => ({ ...current, dispatchNo: event.target.value }))} /></label>
        </div>
      </Drawer>

      <Drawer
        open={entryOpen}
        title={entry.id ? "Üretim Kaydını Düzenle" : "Üretim Girişi"}
        subtitle={dictionaries.models.find((row) => row.id === entry.modelId)?.modelName || detail?.modelName || "Seçili model"}
        onClose={() => setEntryOpen(false)}
        footer={<><button type="button" onClick={() => setEntryOpen(false)}>Vazgeç</button><button className="primary" type="button" onClick={saveEntry} disabled={saving}><Save size={15} /> {saving ? "Kaydediliyor" : entry.id ? "Değişikliği Kaydet" : "Üretimi Kaydet"}</button></>}
      >
        <div className="pc2-form-grid two">
          <label>Model<select value={entry.modelId} onChange={(event) => { const model = dictionaries.models.find((row) => row.id === event.target.value); setEntry(defaultEntry(model, dictionaries)); }}><option value="">Model seçin</option>{dictionaries.models.map((model) => <option key={model.id} value={model.id}>{model.modelName}</option>)}</select></label>
          <label>Tarih<input type="date" value={entry.date} onChange={(event) => setEntry((current) => ({ ...current, date: event.target.value }))} /></label>
          <label>Baskı bölgesi<input value={entry.printRegion} onChange={(event) => setEntry((current) => ({ ...current, printRegion: event.target.value }))} /></label>
          <label>Üretim adedi *<input type="number" min="0" value={entry.quantity} onChange={(event) => setEntry((current) => ({ ...current, quantity: event.target.value }))} autoFocus /></label>
          <label>Makine<select value={entry.machineId} onChange={(event) => changeEntryMachine(event.target.value)}><option value="">Makine seçin</option>{dictionaries.machines.map((machine) => <option key={machineId(machine)} value={machineId(machine)}>{machine.machineNo || machine.no} - {machineName(machine)}</option>)}</select></label>
          <label>Vardiya<select value={entry.shift} onChange={(event) => changeShift(event.target.value)}><option>Gündüz</option><option>Gece</option></select></label>
          <label>Makinacı<input value={entry.operatorName} onChange={(event) => setEntry((current) => ({ ...current, operatorName: event.target.value }))} /></label>
          <label>Parti / irsaliye<input value={entry.batchNo} onChange={(event) => setEntry((current) => ({ ...current, batchNo: event.target.value }))} /></label>
          <label>Baskı sakatı<input type="number" min="0" value={entry.printDefectQty} onChange={(event) => setEntry((current) => ({ ...current, printDefectQty: event.target.value }))} /></label>
          <label>Kumaş sakatı<input type="number" min="0" value={entry.fabricDefectQty} onChange={(event) => setEntry((current) => ({ ...current, fabricDefectQty: event.target.value }))} /></label>
          <label>Test<input type="number" min="0" value={entry.testQty} onChange={(event) => setEntry((current) => ({ ...current, testQty: event.target.value }))} /></label>
          <label>Net sağlam<input value={qty(Math.max(0, asNumber(entry.quantity) - asNumber(entry.printDefectQty) - asNumber(entry.fabricDefectQty) - asNumber(entry.testQty)))} disabled /></label>
        </div>
        <label className="pc2-note">Not<textarea value={entry.note} onChange={(event) => setEntry((current) => ({ ...current, note: event.target.value }))} /></label>
        {!dictionaries.machines.length ? <div className="pc2-notice warning"><Settings2 size={16} /> Makine tanımı yok. Makine ve Vardiya Ayarları ekranından makine ekleyin.</div> : null}
      </Drawer>

      <Drawer
        open={Boolean(detail)}
        title={detail?.modelName || "Model"}
        subtitle={`${detail?.companyName || "Firma bekliyor"} · ${statusLabel(detail?.status)}`}
        onClose={() => setDetail(null)}
        wide
        footer={<><button type="button" onClick={() => setDetail(null)}>Kapat</button><button className="primary" type="button" onClick={() => openEntry(detail)}><Layers3 size={15} /> Üretim Gir</button></>}
      >
        {detail ? <ModelDetail detail={detail} onEdit={(row) => openEntry(detail, row)} onDelete={removeEntry} /> : null}
      </Drawer>
    </div>
  );
}

function Metric({ label, value, helper, tone = "" }) {
  return <article className={`pc2-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{helper}</small></article>;
}

function ModelDetail({ detail, onEdit, onDelete }) {
  return (
    <div className="pc2-detail">
      <section className="pc2-detail-top">
        <div className="pc2-detail-image">{detail.imageUrl ? <img src={imageSrc(detail.imageUrl)} alt={detail.modelName} /> : <ImageIcon size={44} />}</div>
        <div className="pc2-detail-metrics">
          <Metric label="Gelen" value={qty(detail.incomingQty)} helper={`${detail.dispatchCount || 0} irsaliye`} />
          <Metric label="Brüt tamamlanan" value={qty(detail.completedGrossQty)} helper={`Operasyon ${qty(detail.grossOperationQty)}`} />
          <Metric label="Net sağlam" value={qty(detail.completedNetQty)} helper={`Sakat/Test ${qty(detail.defectQty)}`} tone="success" />
          <Metric label="Faturalanan" value={qty(detail.invoicedQty)} helper={`Bekleyen ${qty(detail.invoiceRemainingQty)}`} />
        </div>
      </section>

      <section className="pc2-panel">
        <header><div><h3><Layers3 size={17} /> Baskı bölgeleri</h3><p>Her bölge ayrı takip edilir.</p></div></header>
        <div className="pc2-region-grid">{(detail.operationRows || []).map((row) => <article key={row.region}><strong>{row.region}</strong><b>{qty(row.producedQty)} adet</b><small>Net {qty(row.netQty)} · Kalan {qty(row.remainingQty)}</small><span className={`pc2-status ${statusTone(row.status)}`}>{statusLabel(row.status)}</span></article>)}</div>
      </section>

      <section className="pc2-panel">
        <header><div><h3><History size={17} /> Üretim geçmişi</h3><p>Kayıtları buradan düzelt veya sil.</p></div></header>
        <div className="pc2-table-wrap"><table><thead><tr><th>Tarih</th><th>Bölge</th><th>Brüt</th><th>Net</th><th>Makine</th><th>Vardiya</th><th>Makinacı</th><th /></tr></thead><tbody>{(detail.productionEntries || []).length ? detail.productionEntries.map((row) => <tr key={row.id}><td>{dateText(row.date)}</td><td>{row.printArea}</td><td>{qty(row.grossQty)}</td><td>{qty(row.netQty)}</td><td>{row.machineName || row.machineId || "-"}</td><td>{row.shift || "-"}</td><td>{row.operatorName || "-"}</td><td><div className="pc2-row-actions"><button type="button" onClick={() => onEdit(row)}><Pencil size={14} /> Düzenle</button><button className="danger" type="button" onClick={() => onDelete(row)}><Trash2 size={14} /> Sil</button></div></td></tr>) : <tr><td colSpan={8}>Henüz üretim kaydı yok.</td></tr>}</tbody></table></div>
      </section>

      <section className="pc2-detail-split">
        <MiniList title="Gelen İrsaliyeler" icon={FileText} rows={detail.dispatches || []} empty="Eşleşen irsaliye yok" render={(row) => `${row.documentNo || "Belge"} · ${qty(row.quantity)} adet`} />
        <MiniList title="Kesilen Faturalar" icon={FileCheck2} rows={detail.invoices || []} empty="Eşleşen fatura yok" render={(row) => `${row.documentNo || "Belge"} · ${qty(row.quantity)} adet`} />
      </section>
    </div>
  );
}

function MiniList({ title, icon: Icon, rows, empty, render }) {
  return <section className="pc2-panel"><header><div><h3><Icon size={17} /> {title}</h3></div></header>{rows.length ? <div className="pc2-mini-list">{rows.slice(0, 8).map((row, index) => <div key={row.id || row.lineId || index}><span>{dateText(row.date)}</span><strong>{render(row)}</strong></div>)}</div> : <div className="pc2-mini-empty">{empty}</div>}</section>;
}

function DesignPickerDrawer({ open, activeMainCompany, onClose, onChoose, saving }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    getDesignModels(activeMainCompany, { sort: "updated_desc" })
      .then((payload) => { if (active) setRows(Array.isArray(payload?.rows) ? payload.rows : []); })
      .catch((requestError) => { if (active) setError(requestError?.message || "Desen Havuzu açılamadı."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [activeMainCompany, open]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleUpperCase("tr-TR");
    if (!needle) return rows;
    return rows.filter((row) => `${row.modelName || ""} ${row.companyName || ""}`.toLocaleUpperCase("tr-TR").includes(needle));
  }, [query, rows]);

  return (
    <Drawer open={open} title="Desenlerden Model Al" subtitle="Desen Havuzundaki gerçek modeli seç; İmalat kartı otomatik açılsın." onClose={onClose} wide>
      <div className="pc2-design-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Model veya firma ara" autoFocus /><span>{visible.length} desen</span></div>
      {error ? <div className="pc2-notice"><CircleAlert size={16} /> {error}</div> : null}
      {loading ? <div className="pc2-loading">Desen Havuzu yükleniyor…</div> : null}
      {!loading && !visible.length ? <div className="pc2-empty"><ImageIcon size={28} /><strong>Desen bulunamadı.</strong></div> : null}
      <div className="pc2-design-grid">{visible.map((model) => (
        <article key={model.id}>
          <div className="pc2-design-image">{model.mainImage ? <img src={assetUrl(model.mainImage.thumbnailUrl || model.mainImage.previewUrl)} alt={model.modelName} /> : <ImageIcon size={34} />}</div>
          <div className="pc2-design-copy"><strong>{model.modelName}</strong><span>{model.companyName || "Firma bekliyor"}</span><small>{(model.operations || []).map((operation) => operation.printAreaName).filter(Boolean).join(" · ") || "Ön"}</small></div>
          <button className="primary" type="button" disabled={saving} onClick={() => onChoose(model)}><CheckCircle2 size={15} /> Seç ve Üretime Aç</button>
        </article>
      ))}</div>
    </Drawer>
  );
}
