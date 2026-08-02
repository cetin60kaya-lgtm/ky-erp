/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addBoyahaneJobColor,
  completeBoyahaneJob,
  createBoyahaneProduction,
  createColorRecipeVersion,
  createRegisteredColor,
  getBoyahaneJob,
  listBoyahaneJobs,
  listBoyahaneLogs,
  listBoyahaneLots,
  listBoyahaneProducts,
  listBoyahaneProductions,
  listRegisteredColors,
  patchBoyahaneJob,
  patchBoyahaneJobColor,
  startBoyahaneJob,
} from "../../../services/boyahaneWorkflowApi";
import AddColorModal from "./AddColorModal";
import ModelColorList from "./ModelColorList";
import ModelThumbnail from "./ModelThumbnail";
import QueueDesignModal from "./QueueDesignModal";
import RecipeWorkspace from "./RecipeWorkspace";
import { formatDate, formatKg, safeArray, statusTone } from "./boyahaneFormat";

const SAMPLE_TABS = [
  ["waiting", "Numune Bekleyenler"],
  ["ongoing", "Devam Edenler"],
  ["approved", "Onaylananlar"],
];

const PRODUCTION_TABS = [
  ["prepare", "Boyası Hazırlanacaklar"],
  ["manufacturing-waiting", "İmalat Bekleyenler"],
  ["active", "Aktif İmalatlar"],
  ["completed", "Tamamlananlar"],
];

function modeOf(job) {
  const value = String(job?.jobType || job?.workflowType || job?.type || "").toUpperCase();
  return value === "SAMPLE" || value === "TRIAL" ? "sample" : "production";
}

function prepared(job) {
  const rows = safeArray(job?.colors).filter((row) => String(row.status).toUpperCase() !== "CANCELLED");
  return rows.length > 0 && rows.every((row) => String(row.status).toUpperCase() === "COMPLETED");
}

function sampleBucket(job) {
  if (String(job.status).toUpperCase() === "COMPLETED" || job.sampleApprovedAt) return "approved";
  if (["ACTIVE", "PAUSED"].includes(String(job.status).toUpperCase())) return "ongoing";
  return "waiting";
}

function productionBucket(job) {
  if (String(job.status).toUpperCase() === "COMPLETED") return "completed";
  if (job.enteredProductionAt || job.manufacturingStatus === "ACTIVE") return "active";
  if (prepared(job)) return "manufacturing-waiting";
  return "prepare";
}

function waitText(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const hours = Math.max(0, Math.floor((Date.now() - date.getTime()) / 3_600_000));
  return hours < 24 ? `${hours} saat` : `${Math.floor(hours / 24)} gün`;
}

function newSampleRow(product = null, index = 0) {
  return {
    key: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    productId: product?.id || "",
    productName: product?.productName || "",
    startGram: "",
    additions: [""],
    lotId: "",
  };
}

function SampleWorkspace({ activeMainCompany, job, color, products, lots, registeredColors, onSaved, onNext }) {
  const [rows, setRows] = useState([]);
  const [paintType, setPaintType] = useState("SUBAZLI");
  const [pantone, setPantone] = useState("");
  const [colorName, setColorName] = useState("");
  const [registeredColorId, setRegisteredColorId] = useState("");
  const [trialCount, setTrialCount] = useState(1);
  const [copies, setCopies] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const draft = color?.sampleDraft || {};
    const draftRows = safeArray(draft.rows).map((row, index) => ({
      ...row,
      key: row.key || `draft-${index}`,
      additions: safeArray(row.additions).length ? safeArray(row.additions) : [""],
    }));
    setRows(draftRows.length ? draftRows : [newSampleRow(products[0], 1), newSampleRow(products[1], 2), newSampleRow(null, 3)]);
    setTrialCount(Math.max(1, Number(draft.trialCount || draftRows[0]?.additions?.length || 1)));
    setCopies(Math.max(1, Number(draft.copies || 1)));
    setPaintType(color?.paintType || draft.paintType || "SUBAZLI");
    setPantone(color?.pantone || draft.pantone || "");
    setColorName(color?.colorName || draft.colorName || "");
    setRegisteredColorId(color?.registeredColorId || draft.registeredColorId || "");
    setMessage("");
    setError("");
  }, [color?.id, products.length]);

  const productMap = useMemo(() => new Map(products.map((row) => [String(row.id), row])), [products]);
  const finalGram = (row) => Number(row.startGram || 0) + safeArray(row.additions).reduce((sum, value) => sum + Number(value || 0), 0);
  const totalGram = rows.reduce((sum, row) => sum + finalGram(row), 0);

  function updateRow(index, patch) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function updateAddition(rowIndex, trialIndex, value) {
    if (Number(value) < 0) return;
    setRows((current) => current.map((row, index) => {
      if (index !== rowIndex) return row;
      const additions = [...safeArray(row.additions)];
      additions[trialIndex] = value;
      return { ...row, additions };
    }));
  }

  function addTrial() {
    setTrialCount((current) => current + 1);
    setRows((current) => current.map((row) => ({ ...row, additions: [...safeArray(row.additions), ""] })));
  }

  function removeTrial() {
    if (trialCount <= 1) return;
    setTrialCount((current) => current - 1);
    setRows((current) => current.map((row) => ({ ...row, additions: safeArray(row.additions).slice(0, -1) })));
  }

  async function saveDraft() {
    if (!color?.id) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await patchBoyahaneJobColor(activeMainCompany, color.id, {
        status: "DRAFT",
        jobType: "SAMPLE",
        paintType,
        pantone,
        colorName,
        registeredColorId: registeredColorId || undefined,
        sampleDraft: { rows, trialCount, copies, paintType, pantone, colorName, registeredColorId },
      });
      setMessage("Numune taslağı kaydedildi. Taslak stok düşürmez.");
      await onSaved?.();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function approveSample() {
    if (!window.confirm("Numune fiziksel olarak hazırlandı ve sonuç onaylandı mı? Onayla birlikte lotlardan gerçek stok düşümü yapılacaktır.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (!pantone.trim() || !colorName.trim()) throw new Error("Pantone ve renk adı zorunludur.");
      if (!rows.length || rows.some((row) => !row.productId || !row.lotId || finalGram(row) <= 0)) throw new Error("Her satırda ürün, lot ve sıfırdan büyük son gramaj bulunmalıdır.");
      let activeColorId = registeredColorId;
      if (!activeColorId) {
        const created = await createRegisteredColor(activeMainCompany, { pantone, colorName, paintType });
        activeColorId = created.id;
        setRegisteredColorId(created.id);
      }
      const lines = rows.map((row) => ({
        productId: row.productId,
        productName: productMap.get(String(row.productId))?.productName || row.productName,
        referenceGram: finalGram(row),
        lotId: row.lotId,
      }));
      const recipe = await createColorRecipeVersion(activeMainCompany, activeColorId, {
        paintType,
        jobId: job.id,
        jobColorId: color.id,
        lines,
      });
      await createBoyahaneProduction(activeMainCompany, {
        requestId: globalThis.crypto?.randomUUID?.() || `sample-${Date.now()}`,
        jobId: job.id,
        jobColorId: color.id,
        colorId: activeColorId,
        recipeId: recipe.id,
        pantone,
        colorName,
        paintType,
        version: recipe.version,
        multiplier: Number(copies || 1),
        jobType: "SAMPLE",
        companyName: job.companyName,
        orderNo: job.orderNo,
        lines,
      });
      await patchBoyahaneJobColor(activeMainCompany, color.id, {
        status: "COMPLETED",
        jobType: "SAMPLE",
        registeredColorId: activeColorId,
        recipeId: recipe.id,
        paintType,
        sampleApprovedAt: new Date().toISOString(),
        sampleDraft: { rows, trialCount, copies, paintType, pantone, colorName, registeredColorId: activeColorId },
      });
      setMessage(`${recipe.version} onaylandı; numune lot sarfları gerçek stoktan düşüldü.`);
      await onSaved?.();
      onNext?.();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  if (!color) return <div className="bh-empty large">Numune çalışmak için model rengi seçin.</div>;

  const unapproved = rows.map((row) => productMap.get(String(row.productId))).filter((row) => row && row.approvalStatus !== "APPROVED");

  return (
    <section className="bh-card bh-sample-workspace">
      <div className="bh-card-head"><div><h2>{job.modelName} · {color.colorName || "Numune rengi"}</h2><small>Numunede yalnız ekleme yapılır; eksi değer kabul edilmez.</small></div><span className={`bh-status ${statusTone(color.status)}`}>{color.status}</span></div>
      <div className="bh-card-body">
        {error ? <div className="bh-notice danger">{error}</div> : null}
        {message ? <div className="bh-notice success">{message}</div> : null}
        {unapproved.length ? <div className="bh-notice warning">Onaysız ürün numunede uyarıyla kullanılabilir; imalat reçetesinde ürün onayı zorunludur: {unapproved.map((row) => row.productName).join(", ")}</div> : null}
        <div className="bh-form-grid five">
          <label className="bh-field wide"><span>Kayıtlı renk</span><select value={registeredColorId} onChange={(event) => { const id = event.target.value; const row = registeredColors.find((item) => item.id === id); setRegisteredColorId(id); if (row) { setPantone(row.pantone || ""); setColorName(row.colorName || ""); setPaintType(safeArray(row.paintTypes)[0] || row.dyeType || "SUBAZLI"); } }}><option value="">Yeni renk / henüz kayıtlı değil</option>{registeredColors.map((row) => <option key={row.id} value={row.id}>{row.pantone || "-"} · {row.colorName || "-"}</option>)}</select></label>
          <label className="bh-field"><span>Renk adı</span><input value={colorName} onChange={(event) => setColorName(event.target.value)} /></label>
          <label className="bh-field"><span>Pantone</span><input value={pantone} onChange={(event) => setPantone(event.target.value)} /></label>
          <label className="bh-field"><span>Boya türü</span><select value={paintType} onChange={(event) => setPaintType(event.target.value)}>{["SUBAZLI", "PIGMENT", "ECOPLAST", "SİLİKON", "AŞINDIRMA", "FİKSATÖR", "UV", "DİĞER"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="bh-field"><span>Kat sayısı</span><input type="number" min="1" step="1" value={copies} onChange={(event) => setCopies(Math.max(1, Number(event.target.value || 1)))} /></label>
        </div>
        <div className="bh-table-wrap wide"><table><thead><tr><th>Ürün</th><th>Başlangıç GR</th>{Array.from({ length: trialCount }, (_, index) => <th key={index}>Deneme {index + 1} Eklendi</th>)}<th>Son Toplam</th><th>Lot</th><th>İşlem</th></tr></thead><tbody>{rows.map((row, rowIndex) => {
          const rowLots = lots.filter((lot) => String(lot.inventoryId || lot.productId) === String(row.productId) && ["AVAILABLE", "ACTIVE"].includes(String(lot.status).toUpperCase()));
          return <tr key={row.key}><td><select value={row.productId} onChange={(event) => { const product = productMap.get(event.target.value); const defaultLot = lots.find((lot) => String(lot.inventoryId || lot.productId) === event.target.value && lot.isDefault) || lots.find((lot) => String(lot.inventoryId || lot.productId) === event.target.value); updateRow(rowIndex, { productId: event.target.value, productName: product?.productName || "", lotId: defaultLot?.id || "" }); }}><option value="">Ürün seç</option>{products.map((product) => <option key={product.id} value={product.id}>{product.productName}{product.approvalStatus !== "APPROVED" ? " · Onay bekliyor" : ""}</option>)}</select></td><td><input type="number" min="0" step="0.01" value={row.startGram} onChange={(event) => updateRow(rowIndex, { startGram: event.target.value })} /></td>{Array.from({ length: trialCount }, (_, trialIndex) => <td key={trialIndex}><input type="number" min="0" step="0.01" value={row.additions?.[trialIndex] || ""} onChange={(event) => updateAddition(rowIndex, trialIndex, event.target.value)} /></td>)}<td><strong>{finalGram(row).toFixed(2)} g</strong></td><td><select value={row.lotId} onChange={(event) => updateRow(rowIndex, { lotId: event.target.value })}><option value="">Lot seç</option>{rowLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.lotNo} · {formatKg(lot.remainingKg)}</option>)}</select></td><td><button type="button" className="bh-btn mini danger" onClick={() => setRows((current) => current.filter((_, index) => index !== rowIndex))}>Çıkar</button></td></tr>;
        })}</tbody><tfoot><tr><th colSpan={2 + trialCount}>Numune toplamı</th><th>{totalGram.toFixed(2)} g × {copies}</th><th colSpan="2">{(totalGram * copies).toFixed(2)} g</th></tr></tfoot></table></div>
        <div className="bh-work-actions"><button type="button" className="bh-btn" onClick={addTrial}>+ Deneme Sütunu</button><button type="button" className="bh-btn" disabled={trialCount <= 1} onClick={removeTrial}>Son Denemeyi Çıkar</button><button type="button" className="bh-btn" onClick={() => setRows((current) => [...current, newSampleRow(null, current.length + 1)])}>+ Ürün Satırı</button><button type="button" className="bh-btn" disabled={busy} onClick={saveDraft}>Taslağı Kaydet</button><button type="button" className="bh-btn primary" disabled={busy} onClick={approveSample}>Numuneyi Onayla ve Versiyon Oluştur</button></div>
      </div>
    </section>
  );
}

function RfPanel({ activeMainCompany, job, color, jobs, onSaved }) {
  const [form, setForm] = useState({ sourceJobId: "", sourceKg: "", usedKg: "", tlValue: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!color) return null;
  const rows = safeArray(color.rfUsage);

  async function save() {
    setBusy(true); setError(""); setMessage("");
    try {
      const sourceKg = Number(form.sourceKg || 0);
      const usedKg = Number(form.usedKg || 0);
      if (!form.sourceJobId || sourceKg <= 0 || usedKg <= 0 || usedKg > sourceKg) throw new Error("Kaynak model, kaynak kg ve kullanılan kg doğru girilmelidir.");
      const remainingKg = Math.max(0, sourceKg - usedKg);
      const source = jobs.find((row) => row.id === form.sourceJobId);
      const record = {
        id: globalThis.crypto?.randomUUID?.() || `rf-${Date.now()}`,
        sourceJobId: form.sourceJobId,
        sourceModelName: source?.modelName || "",
        targetJobId: job.id,
        targetModelName: job.modelName,
        colorId: color.id,
        colorName: color.colorName,
        sourceKg,
        usedKg,
        remainingKg,
        tlValue: Number(form.tlValue || 0),
        status: remainingKg > 0 ? "RF" : "BITTI",
        createdAt: new Date().toISOString(),
      };
      await patchBoyahaneJobColor(activeMainCompany, color.id, { rfUsage: [...rows, record] });
      setMessage("RF kullanım kaydı oluşturuldu. Bileşenler ikinci kez stoktan düşülmedi.");
      setForm({ sourceJobId: "", sourceKg: "", usedKg: "", tlValue: "" });
      await onSaved?.();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return <section className="bh-card bh-rf-panel"><div className="bh-card-head"><div><h2>RF Boya Değerlendirme</h2><small>RF ayrı stok veya raf değildir; başka imalatta değerlendirilen hazırlanmış karışımdır.</small></div></div><div className="bh-card-body">{error ? <div className="bh-notice danger">{error}</div> : null}{message ? <div className="bh-notice success">{message}</div> : null}<div className="bh-form-grid five"><label className="bh-field wide"><span>Kaynak model</span><select value={form.sourceJobId} onChange={(event) => setForm((current) => ({ ...current, sourceJobId: event.target.value }))}><option value="">Kaynak modeli seç</option>{jobs.filter((row) => row.id !== job.id).map((row) => <option key={row.id} value={row.id}>{row.modelName} · {row.companyName || "-"}</option>)}</select></label><label className="bh-field"><span>Kaynak toplam KG</span><input type="number" min="0.001" step="0.001" value={form.sourceKg} onChange={(event) => setForm((current) => ({ ...current, sourceKg: event.target.value }))} /></label><label className="bh-field"><span>Bu işte kullanılan KG</span><input type="number" min="0.001" step="0.001" value={form.usedKg} onChange={(event) => setForm((current) => ({ ...current, usedKg: event.target.value }))} /></label><label className="bh-field"><span>Gerçek maliyet / TL</span><input type="number" min="0" step="0.01" value={form.tlValue} onChange={(event) => setForm((current) => ({ ...current, tlValue: event.target.value }))} /></label><button type="button" className="bh-btn primary bh-field-button" disabled={busy} onClick={save}>RF Kaydet</button></div>{rows.length ? <div className="bh-table-wrap"><table><thead><tr><th>Tarih</th><th>Kaynak model</th><th>Kullanılan model</th><th>Renk</th><th>Kullanılan</th><th>Kalan</th><th>TL</th><th>Durum</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{formatDate(row.createdAt)}</td><td>{row.sourceModelName || "-"}</td><td>{row.targetModelName || job.modelName}</td><td>{row.colorName || color.colorName}</td><td>{formatKg(row.usedKg)}</td><td>{formatKg(row.remainingKg)}</td><td>{Number(row.tlValue || 0).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}</td><td><span className={`bh-status ${row.status === "BITTI" ? "gray" : "green"}`}>{row.status === "BITTI" ? "Bitti" : "RF"}</span></td></tr>)}</tbody></table></div> : <div className="bh-empty">Bu renk için RF kullanımı yok.</div>}</div></section>;
}

export default function BoyahaneOperationsPage({ activeMainCompany, mode = "production", moduleActionContext }) {
  const [jobs, setJobs] = useState([]);
  const [registeredColors, setRegisteredColors] = useState([]);
  const [products, setProducts] = useState([]);
  const [lots, setLots] = useState([]);
  const [productions, setProductions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedColorId, setSelectedColorId] = useState("");
  const [tab, setTab] = useState(mode === "sample" ? "waiting" : "prepare");
  const [addColorOpen, setAddColorOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (keepSelection = true) => {
    if (!activeMainCompany?.slug) return;
    setLoading(true); setError("");
    try {
      const [jobRows, colorRows, productRows, lotRows, productionRows, logRows] = await Promise.all([
        listBoyahaneJobs(activeMainCompany),
        listRegisteredColors(activeMainCompany),
        listBoyahaneProducts(activeMainCompany),
        listBoyahaneLots(activeMainCompany),
        listBoyahaneProductions(activeMainCompany),
        listBoyahaneLogs(activeMainCompany),
      ]);
      const allJobs = safeArray(jobRows);
      const modeJobs = allJobs.filter((row) => modeOf(row) === mode);
      const displayJobs = modeJobs.length ? modeJobs : allJobs;
      setJobs(displayJobs);
      setRegisteredColors(safeArray(colorRows));
      setProducts(safeArray(productRows));
      setLots(safeArray(lotRows));
      setProductions(safeArray(productionRows));
      setLogs(safeArray(logRows));
      const requested = moduleActionContext?.boyahaneJobId;
      const nextId = requested && displayJobs.some((row) => row.id === requested)
        ? requested
        : keepSelection && displayJobs.some((row) => row.id === selectedJobId)
          ? selectedJobId
          : "";
      setSelectedJobId(nextId);
      if (nextId) {
        const job = displayJobs.find((row) => row.id === nextId);
        setSelectedColorId((current) => safeArray(job?.colors).some((row) => row.id === current) ? current : safeArray(job?.colors)[0]?.id || "");
      } else setSelectedColorId("");
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [activeMainCompany?.slug, mode, moduleActionContext?.nonce, moduleActionContext?.boyahaneJobId, selectedJobId]);

  useEffect(() => { setTab(mode === "sample" ? "waiting" : "prepare"); load(false); }, [activeMainCompany?.slug, mode, moduleActionContext?.nonce]);

  const selectedJob = jobs.find((row) => row.id === selectedJobId) || null;
  const selectedColor = safeArray(selectedJob?.colors).find((row) => row.id === selectedColorId) || null;
  const tabs = mode === "sample" ? SAMPLE_TABS : PRODUCTION_TABS;
  const visibleJobs = jobs.filter((job) => (mode === "sample" ? sampleBucket(job) : productionBucket(job)) === tab);

  function openJob(job) {
    setSelectedJobId(job.id);
    setSelectedColorId(safeArray(job.colors).find((row) => !["COMPLETED", "CANCELLED"].includes(String(row.status).toUpperCase()))?.id || safeArray(job.colors)[0]?.id || "");
    window.requestAnimationFrame(() => document.querySelector(".bh-operation-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function refreshSelected(nextColorId) {
    if (!selectedJobId) return load();
    try {
      const row = await getBoyahaneJob(activeMainCompany, selectedJobId);
      setJobs((current) => current.map((job) => job.id === row.id ? row : job));
      setSelectedColorId(nextColorId || safeArray(row.colors).find((item) => item.id === selectedColorId)?.id || safeArray(row.colors)[0]?.id || "");
      const [productionRows, logRows, lotRows] = await Promise.all([listBoyahaneProductions(activeMainCompany), listBoyahaneLogs(activeMainCompany), listBoyahaneLots(activeMainCompany)]);
      setProductions(safeArray(productionRows)); setLogs(safeArray(logRows)); setLots(safeArray(lotRows));
    } catch (requestError) { setError(requestError.message); }
  }

  async function startJob(job) {
    setBusy(true); setError("");
    try { await startBoyahaneJob(activeMainCompany, job.id, true); await load(); openJob({ ...job, status: "ACTIVE" }); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function addColor(form) {
    setBusy(true); setError("");
    try { const row = await addBoyahaneJobColor(activeMainCompany, selectedJob.id, { ...form, jobType: mode === "sample" ? "SAMPLE" : "PRODUCTION" }); setAddColorOpen(false); await refreshSelected(row.id); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function cancelColor() {
    if (!selectedColor || !window.confirm(`${selectedColor.colorName || "Renk"} silinmeyecek; iptal durumuna alınsın mı?`)) return;
    setBusy(true); setError("");
    try {
      await patchBoyahaneJobColor(activeMainCompany, selectedColor.id, { status: "CANCELLED", cancelledAt: new Date().toISOString(), cancelReason: "Kullanıcı tarafından model iş akışından çıkarıldı" });
      await refreshSelected();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function enterManufacturing() {
    if (!selectedJob || !window.confirm(`${selectedJob.modelName} imalata girdi olarak işaretlensin mi? Kilogram tekrar sorulmayacaktır.`)) return;
    setBusy(true); setError("");
    try {
      await patchBoyahaneJob(activeMainCompany, selectedJob.id, { enteredProductionAt: new Date().toISOString(), manufacturingStatus: "ACTIVE" });
      await load();
      setTab("active");
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function finishJob() {
    if (!selectedJob || !window.confirm(`${selectedJob.modelName} tamamlandı olarak kapatılsın mı?`)) return;
    setBusy(true); setError("");
    try { await completeBoyahaneJob(activeMainCompany, selectedJob.id); setSelectedJobId(""); await load(false); setTab(mode === "sample" ? "approved" : "completed"); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  function chooseNextColor() {
    if (!selectedJob?.colors?.length) return;
    const index = selectedJob.colors.findIndex((row) => row.id === selectedColorId);
    const next = [...selectedJob.colors.slice(index + 1), ...selectedJob.colors.slice(0, index + 1)].find((row) => !["COMPLETED", "CANCELLED"].includes(String(row.status).toUpperCase()));
    if (next) setSelectedColorId(next.id);
  }

  return (
    <div className={`bh-operation-page ${mode}`}>
      <section className="bh-operation-intro"><div><small>{mode === "sample" ? "NUMUNE MERKEZİ" : "İMALAT BOYALARI"}</small><h2>{mode === "sample" ? "Numune Çalışmaları" : "İmalat Boyaları"}</h2><p>{mode === "sample" ? "Numune reçetesi ayrı çalışma ekranında, yalnız pozitif eklemelerle ve versiyon geçmişi korunarak yürütülür." : "Modelin tüm renk kanalları birlikte izlenir; hazırlanan boya imalata girerken kilogram tekrar sorulmaz."}</p></div><button type="button" className="bh-btn primary" onClick={() => setQueueOpen(true)}>+ Desenlerden İş Ekle</button></section>

      <nav className="bh-operation-tabs">{tabs.map(([key, label]) => <button type="button" key={key} className={tab === key ? "active" : ""} onClick={() => { setTab(key); setSelectedJobId(""); }}>{label}<b>{jobs.filter((job) => (mode === "sample" ? sampleBucket(job) : productionBucket(job)) === key).length}</b></button>)}</nav>
      {error ? <div className="bh-notice danger">{error}</div> : null}
      {loading ? <div className="bh-empty large">Boyahane işleri yükleniyor…</div> : null}

      <div className="bh-operation-card-grid">{visibleJobs.map((job) => <article className="bh-operation-card" key={job.id}><button type="button" className="bh-model-image-button" onClick={() => openJob(job)}><ModelThumbnail src={job.imageUrl} alt={job.modelName} size="large" /></button><div><span className={`bh-status ${statusTone(job.status)}`}>{job.status}</span><h3>{job.modelName}</h3><p>{job.companyName || "Firma yok"} · {job.orderNo || "Sipariş yok"}</p><dl><div><dt>Toplam renk</dt><dd>{safeArray(job.colors).filter((row) => row.status !== "CANCELLED").length}</dd></div><div><dt>Hazır</dt><dd>{job.preparedColorCount || 0}</dd></div><div><dt>Eksik</dt><dd>{job.pendingColorCount || 0}</dd></div><div><dt>Hazır boya</dt><dd>{formatKg(job.preparedKg || job.plannedPaintKg)}</dd></div><div><dt>Son işlem</dt><dd>{formatDate(job.updatedAt)}</dd></div><div><dt>Bekleme</dt><dd>{waitText(job.createdAt)}</dd></div></dl><div className="bh-row-actions"><button type="button" className="bh-btn primary" onClick={() => openJob(job)}>İşi Aç</button>{["WAITING", "PAUSED"].includes(String(job.status).toUpperCase()) ? <button type="button" className="bh-btn" disabled={busy} onClick={() => startJob(job)}>Çalışmaya Başla</button> : null}</div></div></article>)}</div>
      {!visibleJobs.length && !loading ? <div className="bh-empty large">Bu bölümde kayıt bulunmuyor.</div> : null}

      {selectedJob ? <section className="bh-operation-workspace">
        <header className="bh-operation-model-head"><ModelThumbnail src={selectedJob.imageUrl} alt={selectedJob.modelName} size="large" /><div><small>{mode === "sample" ? "NUMUNE ÇALIŞMA EKRANI" : "İMALAT BOYASI ÇALIŞMA EKRANI"}</small><h2>{selectedJob.modelName}</h2><p>{selectedJob.companyName || "-"} · {selectedJob.orderNo || "-"} · {selectedJob.printRegion || "Tüm baskı bölgeleri"}</p><div className="bh-summary-facts"><span>Toplam renk <b>{safeArray(selectedJob.colors).filter((row) => row.status !== "CANCELLED").length}</b></span><span>Hazır <b>{selectedJob.preparedColorCount || 0}</b></span><span>Eksik <b>{selectedJob.pendingColorCount || 0}</b></span><span>Kanal <b>{selectedJob.channelCount || 0}</b></span></div></div><div className="bh-head-actions"><button type="button" className="bh-btn" onClick={() => setSelectedJobId("")}>Listeye Dön</button>{mode === "production" && prepared(selectedJob) && !selectedJob.enteredProductionAt ? <button type="button" className="bh-btn primary" disabled={busy} onClick={enterManufacturing}>İmalata Girdi</button> : null}<button type="button" className="bh-btn primary" disabled={busy} onClick={finishJob}>{mode === "sample" ? "Numune İşini Kapat" : "Modeli Tamamla"}</button></div></header>
        <div className="bh-work-grid"><ModelColorList colors={safeArray(selectedJob.colors)} selectedId={selectedColorId} onSelect={setSelectedColorId} onAdd={() => setAddColorOpen(true)} onDelete={cancelColor} />{mode === "sample" ? <SampleWorkspace activeMainCompany={activeMainCompany} job={selectedJob} color={selectedColor} products={products} lots={lots} registeredColors={registeredColors} onSaved={refreshSelected} onNext={chooseNextColor} /> : <RecipeWorkspace activeMainCompany={activeMainCompany} job={selectedJob} color={selectedColor} registeredColors={registeredColors} products={products.filter((row) => row.approvalStatus === "APPROVED")} lots={lots} productions={productions} logs={logs} onSaved={refreshSelected} onNext={chooseNextColor} onLotsChanged={async () => setLots(safeArray(await listBoyahaneLots(activeMainCompany)))} />}</div>
        {mode === "production" ? <RfPanel activeMainCompany={activeMainCompany} job={selectedJob} color={selectedColor} jobs={jobs} onSaved={refreshSelected} /> : null}
        {mode === "production" && selectedJob.status === "COMPLETED" ? <section className="bh-card"><div className="bh-card-head"><div><h2>İşlem Geçmişi</h2><small>Tamamlanan modelde reçete tablosu tekrar edilmez.</small></div></div><div className="bh-card-body bh-activity-list">{logs.filter((row) => row.entityId === selectedJob.id || safeArray(selectedJob.colors).some((color) => color.id === row.entityId)).map((row) => <article key={row.id}><time>{formatDate(row.createdAt)}</time><div><strong>{row.actor || "KY ERP"}</strong><p>{row.description || row.actionType}</p></div></article>)}</div></section> : null}
      </section> : null}

      {addColorOpen ? <AddColorModal colors={registeredColors} job={selectedJob} busy={busy} onCancel={() => setAddColorOpen(false)} onSave={addColor} /> : null}
      {queueOpen ? <QueueDesignModal activeMainCompany={activeMainCompany} queuedModelIds={jobs.map((row) => row.designId || row.modelCardId)} onClose={() => setQueueOpen(false)} onQueued={async (close) => { await load(false); if (close) setQueueOpen(false); }} /> : null}
    </div>
  );
}
