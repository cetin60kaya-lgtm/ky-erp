import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  CheckCircle2,
  CircleAlert,
  CirclePlus,
  FileCheck2,
  FileSpreadsheet,
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
  updateProductionCenterModel,
} from "../../services/productionCenterApi";
import { getDesignModels } from "../../services/desenWorkflowApi";
import { assetUrl } from "../desen/DesenWorkflowShared";
import { loadModuleData, moduleLoadMessage } from "../../utils/resilientDataLoader";
import ProductionSmartEntryDrawer from "./ProductionSmartEntryDrawer";
import ProductionHistoryImportDrawer from "./ProductionHistoryImportDrawer";
import ProductionDirectEntryPanel from "./ProductionDirectEntryPanel";
import "./productionControlCenterV2.css";

const PAGE_SIZE = 100;
const periodDates = (period) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  if (period === "LAST_30" || period === "LAST_60") start.setDate(start.getDate() - (period === "LAST_30" ? 29 : 59));
  else if (period === "THIS_MONTH") start.setDate(1);
  else if (period === "PREV_MONTH") { start.setMonth(start.getMonth() - 1, 1); end.setDate(0); }
  else return { startDate: "", endDate: "" };
  const iso = (d) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,"0"), String(d.getDate()).padStart(2,"0")].join("-");
  return { startDate: iso(start), endDate: iso(end) };
};

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
};
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

const productionDateTime = (row) => {
  const date = row.productionLastAt || row.productionStartAt || row.lastActivityAt;
  const timestamp = String(row.productionLastTimestamp || "");
  const time = /T\d{2}:\d{2}/.test(timestamp) ? timestamp.match(/T(\d{2}:\d{2})/)?.[1] : "";
  return { date: dateText(date), time: time || "Saat kaydı yok" };
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
    ? (machine.nightOperator ?? machine.geceMakinaci ?? "")
    : (machine.dayOperator ?? machine.gunduzMakinaci ?? "");
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

function productionEntryPreferenceKey(activeMainCompany) {
  return `kyerp.production.entry-preferences.${activeMainCompany?.slug || activeMainCompany?.id || "default"}`;
}

function readProductionEntryPreferences(activeMainCompany) {
  try {
    const raw = window.localStorage.getItem(productionEntryPreferenceKey(activeMainCompany));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeProductionEntryPreferences(activeMainCompany, patch) {
  try {
    const current = readProductionEntryPreferences(activeMainCompany);
    window.localStorage.setItem(
      productionEntryPreferenceKey(activeMainCompany),
      JSON.stringify({ ...current, ...patch }),
    );
  } catch {
    // Yerel tercih kaydı başarısız olsa da üretim girişi çalışmaya devam eder.
  }
}
function defaultEntry(model, dictionaries, source = null, preferences = {}) {
  const firstMachine = dictionaries?.machines?.[0];
  const region =
    source?.printArea ||
    model?.printRegions?.[0]?.regionName ||
    model?.operationRows?.[0]?.region ||
    "Ön";
  const shift = source?.shift || preferences.shift || "G\u00fcnd\u00fcz";
  const preferredMachineId = String(preferences.machineId || "");
  const selectedMachine = source
    ? dictionaries?.machines?.find((item) => machineId(item) === String(source.machineId || ""))
    : dictionaries?.machines?.find((item) => machineId(item) === preferredMachineId) || firstMachine;
  return {
    id: source?.id || "",
    updatedAt: source?.updatedAt || "",
    requestId: source?.requestId || crypto.randomUUID(),
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
    ground: source?.ground || model?.groundColor || "",
    operatorName:
      (source ? (source.operatorName ?? "") : (selectedMachine ? operatorFor(selectedMachine, shift) : "")),
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
  const [pool, setPool] = useState("IMALATTA");
  const [period, setPeriod] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [archiveYear, setArchiveYear] = useState("2026");
  const [page, setPage] = useState(1);
  const [designOpen, setDesignOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [quickSelectedModel, setQuickSelectedModel] = useState("");
  const [openRequestToken, setOpenRequestToken] = useState(0);
  const [directEntryModalOpen, setDirectEntryModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [planDraft, setPlanDraft] = useState({ modelId: "", modelName: "", expectedQty: "", orderNo: "", groundColor: "", expectedUpdatedAt: "" });
  const [modelDraft, setModelDraft] = useState(defaultModelDraft());
  const [detail, setDetail] = useState(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entry, setEntry] = useState(defaultEntry(null, {}));
  const [saving, setSaving] = useState(false);
  const requestSeq = useRef(0);
  const saveLock = useRef(false);
  const entryModel = dictionaries.models.find((row) => String(row.id || row.modelId) === String(entry.modelId)) || null;
  const entryPrintRegions = (entryModel?.printRegions || [])
    .map((region) => typeof region === "string" ? region : region?.regionName || region?.name || region?.printAreaName || "")
    .filter(Boolean);

  const load = useCallback(async () => {
    const ticket = ++requestSeq.current;
    if (!activeMainCompany?.slug && !activeMainCompany?.id) {
      setCenter({ rows: [], summary: {}, pagination: {} });
      setDictionaries({ models: [], machines: [], operators: [], companies: [] });
      setLoading(false);
      setMessage("İmalat merkezi için ana firma seçin.");
      return;
    }
    setLoading(true);
    try {
      const tenant = activeMainCompany?.slug || activeMainCompany?.id;
      const loadResult = await loadModuleData({
        scope: `imalat:${tenant}:merkez:${search}:${status}:${pool}:${startDate}:${endDate}:${archiveYear}:${page}`,
        sources: {
          center: {
            critical: true,
            load: () => getProductionCenter(activeMainCompany, {
              search,
              status,
              pool,
              startDate,
              endDate,
              year: pool === "ARSIV" ? archiveYear : "",
              page,
              pageSize: PAGE_SIZE,
              _ts: Date.now(),
            }),
          },
          dictionaries: { fallback: {}, load: () => getProductionCenterDictionaries(activeMainCompany) },
        },
      });
      if (ticket !== requestSeq.current) return;
      if (loadResult.states.center.status !== "error") {
        const next = loadResult.data.center || { rows: [], summary: {}, pagination: {} };
        const total = Number(next.pagination?.total || 0);
        const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setCenter(next);
      }
      if (loadResult.states.dictionaries.status !== "error") {
        const dict = loadResult.data.dictionaries;
        setDictionaries({
          models: Array.isArray(dict?.models) ? dict.models : [],
          machines: Array.isArray(dict?.machines) ? dict.machines : [],
          operators: Array.isArray(dict?.operators) ? dict.operators : [],
          companies: Array.isArray(dict?.companies) ? dict.companies : [],
        });
      }
      setMessage(moduleLoadMessage(
        loadResult,
        "İmalat ana listesi yüklenemedi; son başarılı üretim verisi korunuyor.",
        "Makine veya sözlük bilgileri geçici olarak yenilenemedi; imalat listesi kullanılabilir.",
      ));
    } catch (error) {
      if (ticket === requestSeq.current) setMessage(error?.message || "İmalat merkezi yüklenemedi.");
    } finally {
      if (ticket === requestSeq.current) setLoading(false);
    }
  }, [activeMainCompany, search, status, pool, startDate, endDate, archiveYear, page]);

  useEffect(() => {
    setPage(1);
    setDetail(null);
    setEntryOpen(false);
    setQuickSelectedModel("");
    setCenter({ rows: [], summary: {}, pagination: {} });
    setDictionaries({ models: [], machines: [], operators: [], companies: [] });
  }, [activeMainCompany?.slug, activeMainCompany?.id]);
  useEffect(() => {
    const timer = window.setTimeout(load, 150);
    return () => { window.clearTimeout(timer); requestSeq.current += 1; };
  }, [load]);

  const summary = center.summary || {};

  // e-Belge'de irsaliye veya fatura değişirse üretim / kalan / faturalanan miktar güncel kalır.
  useEffect(() => {
    const refresh = () => { void load(); };
    window.addEventListener("kyerp:accounting-refresh", refresh);
    return () => window.removeEventListener("kyerp:accounting-refresh", refresh);
  }, [load]);

  async function openDetail(row) {
    setMessage("");
    try {
      const full = await getProductionCenterModel(activeMainCompany, row.id);
      setDetail(full);
    } catch (error) {
      setMessage(error?.message || "Model detayı açılamadı.");
    }
  }

  function focusQuick(model) {
    if (!model) return;
    setQuickSelectedModel(String(model.id || model.modelId || ""));
    setOpenRequestToken((current) => current + 1);
    setDirectEntryModalOpen(true);
  }

  function openEntry(model, source = null) {
    if (!model) return;
    setEntry(defaultEntry(model, dictionaries, source, readProductionEntryPreferences(activeMainCompany)));
    setEntryOpen(true);
  }

  async function saveEntry() {
    if (saveLock.current || saving) return;
    if (!(activeMainCompany?.slug || activeMainCompany?.id)) {
      setMessage("Üretim fişi için ana firma seçin.");
      return;
    }
    if (!entry.modelId || asNumber(entry.quantity) <= 0) {
      setMessage("Model ve sıfırdan büyük üretim adedi zorunludur.");
      return;
    }
    if (!entry.printRegion) {
      setMessage("Baskı bölgesi zorunludur.");
      return;
    }
    const defects = asNumber(entry.printDefectQty) + asNumber(entry.fabricDefectQty) + asNumber(entry.testQty);
    if (defects > asNumber(entry.quantity)) {
      setMessage("Sakat ve test toplamı üretim adedini aşamaz.");
      return;
    }
    saveLock.current = true;
    setSaving(true);
    try {
      if (entry.id) await updateProductionCenterEntry(activeMainCompany, entry.id, entry);
      else await createProductionCenterEntry(activeMainCompany, entry);
      setEntryOpen(false);
      setMessage(`${entry.id ? "Üretim kaydı güncellendi" : "Üretim kaydedildi"}: ${qty(entry.quantity)} adet.`);
      window.dispatchEvent(new CustomEvent("kyerp:production-refresh", { detail: { source: "imalat", modelId: entry.modelId } }));
      await load();
      if (detail?.id === entry.modelId) {
        const full = await getProductionCenterModel(activeMainCompany, entry.modelId);
        setDetail(full);
      }
    } catch (error) {
      setMessage(error?.message || "Üretim kaydı tamamlanamadı.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  async function removeEntry(row) {
    if (!window.confirm(`${qty(row.grossQty)} adet ${row.printArea || "üretim"} kaydı silinsin mi?`)) return;
    try {
      await deleteProductionCenterEntry(activeMainCompany, row.id);
      setMessage("Üretim kaydı arşivlendi.");
      window.dispatchEvent(new CustomEvent("kyerp:production-refresh", { detail: { source: "imalat", modelId: detail?.id || "" } }));
      await load();
      if (detail?.id) setDetail(await getProductionCenterModel(activeMainCompany, detail.id));
    } catch (error) {
      setMessage(error?.message || "Üretim kaydı silinemedi.");
    }
  }

  function openModelPlan(model) {
    if (!model || model.isVirtual) {
      setMessage("İşlem için kalıcı model kartı gerekiyor.");
      return;
    }
    setPlanDraft({
      modelId: model.id,
      modelName: model.modelName || "",
      expectedQty: String(model.expectedQty ?? model.incomingQty ?? 0),
      orderNo: model.orderNo || "",
      groundColor: model.groundColor || "",
      expectedUpdatedAt: model.updatedAt || "",
    });
    setPlanOpen(true);
  }

  async function saveModelPlan() {
    if (saving || !planDraft.modelId) return;
    const expectedQty = Number(planDraft.expectedQty);
    if (!Number.isFinite(expectedQty) || expectedQty < 0) {
      setMessage("Hedef üretim adedi geçersiz.");
      return;
    }
    setSaving(true);
    try {
      await updateProductionCenterModel(activeMainCompany, planDraft.modelId, {
        expectedQty, orderNo: planDraft.orderNo, groundColor: planDraft.groundColor,
        expectedUpdatedAt: planDraft.expectedUpdatedAt,
      });
      setPlanOpen(false);
      await load();
      const full = await getProductionCenterModel(activeMainCompany, planDraft.modelId);
      setDetail(full);
      setMessage("Modelin imalat planı güncellendi. Desen, irsaliye ve fatura kayıtları değiştirilmedi.");
      window.dispatchEvent(new CustomEvent("kyerp:production-refresh", { detail: { source: "imalat", modelId: planDraft.modelId } }));
    } catch (error) {
      setMessage(error?.message || "İmalat planı düzenlenemedi.");
    } finally { setSaving(false); }
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
      setDetail(null);
      focusQuick(full);
      setMessage(saved?.duplicate ? "Model zaten üretimdeydi; giriş alanı açıldı." : "Yeni model açıldı; üretim satırını girin.");
      window.dispatchEvent(new CustomEvent("kyerp:production-refresh", { detail: { source: "imalat", modelId: saved.id || saved.modelId } }));
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
      setDetail(null);
      setMessage(saved?.duplicate ? `${design.modelName} zaten üretimdeydi; mevcut kart açıldı.` : `${design.modelName} Desen Havuzundan üretime açıldı.`);
      focusQuick(full);
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
    writeProductionEntryPreferences(activeMainCompany, { machineId: String(nextId) });
  }

  function changeShift(nextShift) {
    const machine = dictionaries.machines.find((row) => machineId(row) === String(entry.machineId));
    setEntry((current) => ({
      ...current,
      shift: nextShift,
      operatorName: operatorFor(machine, nextShift),
    }));
    writeProductionEntryPreferences(activeMainCompany, { shift: nextShift });
  }

  return (
    <div className="pc2-page">
      <section className="pc2-head">
        <div>
          <span>İMALAT · TEK MERKEZ</span>
          <h1>İmalat · Üretim Girişi</h1>
          <p>Excel düzenindeki alanlarla üretimi gir, kaydet, son fişleri ve modelleri tek yerden takip et.</p>
        </div>
        <div className="pc2-actions">
          <button className="primary" type="button" onClick={() => { setDirectEntryModalOpen(true); setOpenRequestToken((current) => current + 1); }}><Layers3 size={16} /> Üretim Girişi</button>
          <button type="button" onClick={() => setDesignOpen(true)}><ImageIcon size={16} /> Desenlerden Model Al</button>
          <button type="button" onClick={() => setModelOpen(true)}><CirclePlus size={16} /> Yeni Model</button>
          <details className="pc2-more-actions"><summary>Diğer işlemler</summary><div className="pc2-more-menu"><button type="button" onClick={() => { setSmartOpen(true); }}><Zap size={16} /> Metinden Akıllı Seri Giriş</button><button type="button" onClick={() => setHistoryOpen(true)}><FileSpreadsheet size={16} /> Geçmiş CSV Al</button></div></details>
        </div>
      </section>

      {message ? <div className="pc2-notice"><CircleAlert size={17} /> {message}</div> : null}

      <ProductionDirectEntryPanel activeMainCompany={activeMainCompany} models={dictionaries.models} machines={dictionaries.machines} companies={dictionaries.companies} preselectModelId={quickSelectedModel} openRequestToken={openRequestToken} modalOpen={directEntryModalOpen} onClose={() => setDirectEntryModalOpen(false)} onSaved={load} onModelCreated={load} />

      <div className="pc2-workspace" style={{display:"grid",gridTemplateColumns:"minmax(185px, 215px) minmax(0, 1fr)",gap:16,alignItems:"start"}}>
        <nav aria-label="İmalat iş bölümleri" style={{display:"grid",gap:8,padding:12,background:"var(--surface, #fff)",border:"1px solid #dbe3ef",borderRadius:12,position:"sticky",top:12}}>
          <strong style={{fontSize:12,color:"#52637b",padding:"6px 8px"}}>İMALAT İŞLEMLERİ</strong>
          {[["IMALATTA","İmalatta","Üretimi süren işler"],["IRSALIYE","İrsaliye Bekleyen","Yeni sevk eşleşmeleri"],["TAMAMLANAN","Tamamlanan","Biten üretimler"],["FATURA","Fatura Kontrol","Fatura mutabakatı"]].map(([key,label,description]) =>
            <button key={key} type="button" aria-current={pool===key?"page":undefined} onClick={()=>{setPool(key);setStatus("ALL");setPage(1);}} style={{textAlign:"left",display:"grid",gap:3,padding:"12px 10px",borderRadius:9,border:pool===key?"1px solid #2b65c9":"1px solid #e0e7f1",background:pool===key?"#eaf2ff":"#fff",color:"#19365c",cursor:"pointer"}}>
              <strong>{label}</strong><small style={{fontSize:11,color:"#61718a"}}>{description}</small>
            </button>
          )}
          <small style={{padding:8,color:"#61718a"}}>Geçmiş üretimler: İmalat → Rapor</small>
        </nav>
        <div style={{minWidth:0,display:"grid",gap:12}}>
          <header style={{padding:"14px 18px",border:"1px solid #dbe3ef",borderRadius:12,background:"#fff"}}>
            <h2 style={{margin:"0 0 4px",fontSize:19}}>{({IMALATTA:"Aktif İmalat",IRSALIYE:"İrsaliye Bekleyen İşler",TAMAMLANAN:"Tamamlanan Üretimler",FATURA:"Fatura Kontrol ve Mutabakat"})[pool]}</h2>
            <p style={{margin:0,color:"#64748b",fontSize:13}}>{({IMALATTA:"Yalnız üretimi devam eden modeller. Yeni üretim girişi bu bölümden yapılır.",IRSALIYE:"İrsaliye bağlantısı eksik yeni üretimler; geçmişte tamamlanan fişler bu listeye alınmaz.",TAMAMLANAN:"Tamamlanmış üretim kayıtları, tarih ve saat bilgileriyle izlenir.",FATURA:"Üretilen net adet, faturalanan adet ve açık fatura miktarı karşılaştırılır."})[pool]}</p>
          </header>
      <section className="pc2-toolbar pc2-period-toolbar" aria-label="Üretim dönem filtresi">
        <label>Dönem <select aria-label="Üretim dönemi" value={period} onChange={(event) => {
          const next = event.target.value; const dates = periodDates(next);
          setPeriod(next); setStartDate(dates.startDate); setEndDate(dates.endDate); setPage(1);
        }}>
          <option value="ALL">Tüm tarihler</option><option value="LAST_30">Son 30 gün</option>
          <option value="LAST_60">Son 60 gün</option><option value="THIS_MONTH">Bu ay</option>
          <option value="PREV_MONTH">Geçen ay</option><option value="CUSTOM">Özel tarih</option>
        </select></label>
        {period === "CUSTOM" ? <div className="pc2-period-dates">
          <label>Başlangıç <input type="date" aria-label="Başlangıç tarihi" max={endDate || undefined} value={startDate} onChange={(e)=>{setStartDate(e.target.value);setPage(1);}} /></label>
          <label>Bitiş <input type="date" aria-label="Bitiş tarihi" min={startDate || undefined} value={endDate} onChange={(e)=>{setEndDate(e.target.value);setPage(1);}} /></label>
        </div> : null}
        {pool === "ARSIV" ? <label>Arşiv yılı <select value={archiveYear} onChange={(e)=>{setArchiveYear(e.target.value);setPage(1);}}>{Array.from({length:9},(_,i)=>String(2026-i)).map(year=><option key={year} value={year}>{year}</option>)}</select></label> : null}
        {period !== "ALL" ? <button type="button" onClick={()=>{setPeriod("ALL");setStartDate("");setEndDate("");setPage(1);}}>Filtreyi sıfırla</button> : null}
        <span className="pc2-period-note">Tarih seçimi yalnızca listedeki kayıtları filtreler.</span>
      </section>
      {pool === "ARSIV" ? <p className="pc2-notice">Geçmiş üretim fişleri Tamamlanan havuzunda da görünür. Bu, yalnız üretimin geçmişte tamamlandığı anlamına gelir; irsaliye veya fatura onayı değildir.</p> : null}
      <p className="pc2-metrics-caption">Seçili bölüm ve dönemin kayıt özeti</p>
      <section className="pc2-metrics">
        <Metric label="Listelenen model" value={summary.modelCount || 0} helper="Seçili havuz ve dönem" />
        <Metric label="Gelen adet" value={qty(summary.totalIncomingQty)} helper="Eşleşen irsaliye / manuel hedef" />
        <Metric label="Net tamamlanan" value={qty(summary.totalCompletedNetQty)} helper="Sakat ve test düşülmüş" tone="success" />
        {pool === "IMALATTA" ? <Metric label="Üretim bekleyen" value={summary.modelCount || 0} helper="Aktif üretim kartları" tone="blue" /> : null}
        {pool === "IRSALIYE" ? <Metric label="İrsaliye bekleyen" value={summary.modelCount || 0} helper="Bu bölümdeki işler" tone="warning" /> : null}
        {pool === "FATURA" ? <Metric label="Fatura kontrolü" value={summary.modelCount || 0} helper="Fatura kalanlı modeller" tone="warning" /> : null}
        <Metric label="Kontrol gerekli" value={summary.controlCount || 0} helper="Fazla üretim / fatura" tone={summary.controlCount ? "danger" : "success"} />
      </section>

      <section className="pc2-toolbar">
        <label className="pc2-search"><Search size={16} /><input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Model, firma, sipariş veya irsaliye ara" /></label>
        <select aria-label="Duruma göre filtrele" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
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

      <nav aria-label="İmalat kayıt sayfaları" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, padding: "10px 0" }}>
        <button type="button" disabled={loading || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>← Önceki</button>
        <span>Sayfa {page} · {center.pagination?.total ?? center.rows?.length ?? 0} toplam kayıt</span>
        <button type="button" disabled={loading || (center.rows || []).length < PAGE_SIZE || (Number(center.pagination?.total || 0) > 0 && page * PAGE_SIZE >= Number(center.pagination.total))} onClick={() => setPage((value) => value + 1)}>Sonraki →</button>
      </nav>

      <section className="pc2-table-card">
        <div className="pc2-table-wrap">
          <table>
            <thead><tr><th>Görsel</th><th>Model / Firma</th><th>Üretim tarihi / saat</th><th>Gelen</th><th>Üretim</th><th>Net</th><th>Kalan</th><th>{pool === "FATURA" ? "Faturalanan / Açık" : "Faturalanan"}</th><th>Durum</th><th /></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={10}>İmalat verileri yükleniyor…</td></tr> : null}
              {!loading && !(center.rows || []).length ? <tr><td colSpan={9}><div className="pc2-empty"><Boxes size={28} /><strong>İmalat merkezi temiz ve boş.</strong><span>Desenlerden Model Al ile ilk modeli üretime aç.</span><button className="primary" onClick={() => setDesignOpen(true)}><ImageIcon size={16} /> Desenlerden Model Al</button></div></td></tr> : null}
              {(center.rows || []).map((row) => (
                <tr key={row.id}>
                  <td><button className="pc2-thumb" type="button" onClick={() => openDetail(row)}>{row.imageUrl ? <img src={imageSrc(row.imageUrl)} alt={row.modelName} /> : <ImageIcon size={22} />}</button></td>
                  <td><strong>{row.modelName}</strong><small>{row.companyName || "Firma bekliyor"}</small></td>
                  <td><strong>{productionDateTime(row).date}</strong><small>{productionDateTime(row).time}</small></td>
                  <td>{qty(row.incomingQty)}</td>
                  <td>{qty(row.completedGrossQty)}</td>
                  <td>{qty(row.completedNetQty)}</td>
                  <td>{qty(row.productionRemainingQty)}</td>
                  <td>{qty(row.invoicedQty)}{pool === "FATURA" ? <small>Açık: {qty(row.invoiceRemainingQty)}</small> : null}</td>
                  <td><span className={`pc2-status ${statusTone(row.legacyApproved ? "COMPLETED" : row.status)}`}>{row.legacyApproved ? "Tamamlandı · Eski üretim" : statusLabel(row.status)}</span></td>
                  <td><div className="pc2-row-actions">{pool === "IMALATTA" ? <button className="primary" type="button" onClick={() => focusQuick(row)}><Layers3 size={14} /> Üretim Gir</button> : null}<button type="button" onClick={() => openDetail(row)}>Detay</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

        </div>
      </div>

      <ProductionHistoryImportDrawer
        open={historyOpen}
        activeMainCompany={activeMainCompany}
        onClose={() => setHistoryOpen(false)}
        onImported={load}
      />

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
        open={planOpen}
        title="İmalat Planını Düzenle"
        subtitle={planDraft.modelName}
        onClose={() => setPlanOpen(false)}
        footer={<><button type="button" onClick={() => setPlanOpen(false)}>Vazgeç</button><button className="primary" type="button" disabled={saving} onClick={saveModelPlan}><Save size={15} /> {saving ? "Kaydediliyor" : "Planı Kaydet"}</button></>}
      >
        <div className="pc2-form-grid two">
          <label>Hedef üretim adedi<input type="number" min="0" value={planDraft.expectedQty} onChange={(event) => setPlanDraft((current) => ({ ...current, expectedQty: event.target.value }))} /></label>
          <label>Sipariş no<input value={planDraft.orderNo} onChange={(event) => setPlanDraft((current) => ({ ...current, orderNo: event.target.value }))} /></label>
          <label>Zemin rengi<input value={planDraft.groundColor} onChange={(event) => setPlanDraft((current) => ({ ...current, groundColor: event.target.value }))} /></label>
        </div>
        <div className="pc2-notice"><CircleAlert size={16} /> Model adı, firma ve baskı bölgeleri Desen Havuzu'ndan; belge adetleri e-Belge'den gelir. Bağlı irsaliye/faturası olan modelde sipariş numarası kilitlidir.</div>
      </Drawer>

      <Drawer
        open={entryOpen}
        title={entry.id ? "Üretim Kaydını Düzenle" : "Üretim Girişi"}
        subtitle={dictionaries.models.find((row) => row.id === entry.modelId)?.modelName || detail?.modelName || "Seçili model"}
        onClose={() => setEntryOpen(false)}
        footer={<><button type="button" onClick={() => setEntryOpen(false)}>Vazgeç</button><button className="primary" type="button" onClick={saveEntry} disabled={saving}><Save size={15} /> {saving ? "Kaydediliyor" : entry.id ? "Değişikliği Kaydet" : "Üretimi Kaydet"}</button></>}
      >
        <div className="pc2-form-grid two">
          <label>Model<input value={entryModel?.modelName || entryModel?.name || ""} readOnly /></label>
          <label>Tarih<input type="date" value={entry.date} onChange={(event) => setEntry((current) => ({ ...current, date: event.target.value }))} /></label>
          <label>Baskı bölgesi{entryPrintRegions.length ? (<select value={entry.printRegion} onChange={(event) => setEntry((current) => ({ ...current, printRegion: event.target.value }))}>{entryPrintRegions.map((region) => <option key={region} value={region}>{region}</option>)}</select>) : (<input value={entry.printRegion} onChange={(event) => setEntry((current) => ({ ...current, printRegion: event.target.value }))} />)}</label>
          <label>Üretim adedi *<input type="number" min="0" value={entry.quantity} onChange={(event) => setEntry((current) => ({ ...current, quantity: event.target.value }))} autoFocus /></label>
          <label>Makine<select value={entry.machineId} onChange={(event) => changeEntryMachine(event.target.value)}><option value="">Makine seçin</option>{dictionaries.machines.map((machine) => <option key={machineId(machine)} value={machineId(machine)}>{machine.machineNo || machine.no} - {machineName(machine)}</option>)}</select></label>
          <label>Zemin<input value={entry.ground} onChange={(event) => setEntry((current) => ({ ...current, ground: event.target.value }))} placeholder="Zemin rengi" /></label>
          <label>Vardiya<select value={entry.shift} onChange={(event) => changeShift(event.target.value)}><option>Gündüz</option><option>Gece</option></select></label>
          <label>Makinacı<input value={entry.operatorName} onChange={(event) => setEntry((current) => ({ ...current, operatorName: event.target.value }))} placeholder="Bilinmiyorsa boş bırak, sonra tamamla" /></label>
          <label>Parti / irsaliye<input value={entry.batchNo} onChange={(event) => setEntry((current) => ({ ...current, batchNo: event.target.value }))} title="Bu fişin parti etiketi; asıl irsaliye belgesi değişmez" /></label>
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
        footer={<><button type="button" onClick={() => setDetail(null)}>Kapat</button><button type="button" onClick={() => openModelPlan(detail)}><Pencil size={15} /> İmalat Planı</button><button className="primary" type="button" onClick={() => { focusQuick(detail); setDetail(null); }}><Layers3 size={15} /> Üretim Gir</button></>}
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
