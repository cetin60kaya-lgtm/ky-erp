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
  listBoyahaneLots,
  listBoyahaneProducts,
  listRegisteredColors,
  patchBoyahaneJobColor,
  startBoyahaneJob,
} from "../../../services/boyahaneWorkflowApi";
import AddColorModal from "./AddColorModal";
import ModelColorList from "./ModelColorList";
import ModelThumbnail from "./ModelThumbnail";
import QueueDesignModal from "./QueueDesignModal";
import { formatDate, formatKg, safeArray, statusTone } from "./boyahaneFormat";

const TABS = [
  ["waiting", "Numune Bekleyenler"],
  ["ongoing", "Devam Edenler"],
  ["approved", "Onaylananlar"],
];

function bucket(job) {
  if (String(job.status).toUpperCase() === "COMPLETED") return "approved";
  if (["ACTIVE", "PAUSED"].includes(String(job.status).toUpperCase())) return "ongoing";
  return "waiting";
}

function waitText(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const hours = Math.max(0, Math.floor((Date.now() - date.getTime()) / 3_600_000));
  return hours < 24 ? `${hours} saat` : `${Math.floor(hours / 24)} gün`;
}

function newRow(product = null, index = 0) {
  return {
    key: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    productId: product?.id || "",
    productName: product?.productName || "",
    startGram: "",
    additions: [""],
    lotId: "",
  };
}

function SampleEditor({
  activeMainCompany,
  job,
  color,
  products,
  lots,
  registeredColors,
  onSaved,
  onNext,
}) {
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
    setRows(
      draftRows.length
        ? draftRows
        : [newRow(products[0], 1), newRow(products[1], 2), newRow(null, 3)],
    );
    setTrialCount(
      Math.max(1, Number(draft.trialCount || draftRows[0]?.additions?.length || 1)),
    );
    setCopies(Math.max(1, Number(draft.copies || 1)));
    setPaintType(color?.paintType || draft.paintType || "SUBAZLI");
    setPantone(color?.pantone || draft.pantone || "");
    setColorName(color?.colorName || draft.colorName || "");
    setRegisteredColorId(color?.registeredColorId || draft.registeredColorId || "");
    setMessage("");
    setError("");
  }, [color?.id, products.length]);

  const productMap = useMemo(
    () => new Map(products.map((row) => [String(row.id), row])),
    [products],
  );
  const finalGram = (row) =>
    Number(row.startGram || 0) +
    safeArray(row.additions).reduce((sum, value) => sum + Number(value || 0), 0);
  const totalGram = rows.reduce((sum, row) => sum + finalGram(row), 0);
  const unapproved = rows
    .map((row) => productMap.get(String(row.productId)))
    .filter((row) => row && row.approvalStatus !== "APPROVED");

  function updateRow(index, patch) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }

  function updateAddition(rowIndex, trialIndex, value) {
    if (Number(value) < 0) return;
    setRows((current) =>
      current.map((row, index) => {
        if (index !== rowIndex) return row;
        const additions = [...safeArray(row.additions)];
        additions[trialIndex] = value;
        return { ...row, additions };
      }),
    );
  }

  function addTrial() {
    setTrialCount((current) => current + 1);
    setRows((current) =>
      current.map((row) => ({ ...row, additions: [...safeArray(row.additions), ""] })),
    );
  }

  function removeTrial() {
    if (trialCount <= 1) return;
    setTrialCount((current) => current - 1);
    setRows((current) =>
      current.map((row) => ({ ...row, additions: safeArray(row.additions).slice(0, -1) })),
    );
  }

  async function saveDraft() {
    if (!color?.id) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await patchBoyahaneJobColor(activeMainCompany, color.id, {
        status: "DRAFT",
        jobType: "SAMPLE",
        paintType,
        pantone,
        colorName,
        registeredColorId: registeredColorId || undefined,
        sampleDraft: {
          rows,
          trialCount,
          copies,
          paintType,
          pantone,
          colorName,
          registeredColorId,
        },
      });
      setMessage("Numune taslağı kaydedildi. Taslak stok düşürmedi.");
      await onSaved?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function approveSample() {
    if (
      !window.confirm(
        "Numune fiziksel olarak hazırlandı ve sonuç onaylandı mı? Onayla birlikte gerçek lot sarfları oluşacaktır.",
      )
    ) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (!pantone.trim() || !colorName.trim()) {
        throw new Error("Pantone ve renk adı zorunludur.");
      }
      if (
        !rows.length ||
        rows.some((row) => !row.productId || !row.lotId || finalGram(row) <= 0)
      ) {
        throw new Error("Her satırda ürün, lot ve sıfırdan büyük son gramaj bulunmalıdır.");
      }

      let activeColorId = registeredColorId;
      if (!activeColorId) {
        const created = await createRegisteredColor(activeMainCompany, {
          pantone,
          colorName,
          paintType,
        });
        activeColorId = created.id;
        setRegisteredColorId(created.id);
      }

      const lines = rows.map((row) => ({
        productId: row.productId,
        productName:
          productMap.get(String(row.productId))?.productName || row.productName,
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
        sampleDraft: {
          rows,
          trialCount,
          copies,
          paintType,
          pantone,
          colorName,
          registeredColorId: activeColorId,
        },
      });
      setMessage(`${recipe.version} onaylandı; numune lot sarfları kaydedildi.`);
      await onSaved?.();
      onNext?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (!color) {
    return <div className="bh-empty large">Numune çalışmak için model rengini seçin.</div>;
  }

  return (
    <section className="bh-card bh-sample-workspace">
      <div className="bh-card-head">
        <div>
          <h2>{job.modelName} · {color.colorName || "Numune rengi"}</h2>
          <small>Denemelerde yalnız eklenen miktar yazılır; eksi değer kabul edilmez.</small>
        </div>
        <span className={`bh-status ${statusTone(color.status)}`}>{color.status}</span>
      </div>
      <div className="bh-card-body">
        {error ? <div className="bh-notice danger">{error}</div> : null}
        {message ? <div className="bh-notice success">{message}</div> : null}
        {unapproved.length ? (
          <div className="bh-notice warning">
            Onaysız ürün numunede uyarıyla kullanılabilir; imalatta onay zorunludur: {unapproved.map((row) => row.productName).join(", ")}
          </div>
        ) : null}

        <div className="bh-form-grid five">
          <label className="bh-field wide">
            <span>Kayıtlı renk / yakın renk</span>
            <select
              value={registeredColorId}
              onChange={(event) => {
                const id = event.target.value;
                const row = registeredColors.find((item) => item.id === id);
                setRegisteredColorId(id);
                if (row) {
                  setPantone(row.pantone || "");
                  setColorName(row.colorName || "");
                  setPaintType(safeArray(row.paintTypes)[0] || row.dyeType || "SUBAZLI");
                }
              }}
            >
              <option value="">Yeni renk / kayıtlı olmayan renk</option>
              {registeredColors.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.pantone || "-"} · {row.colorName || "-"}
                </option>
              ))}
            </select>
          </label>
          <label className="bh-field"><span>Renk adı</span><input value={colorName} onChange={(event) => setColorName(event.target.value)} /></label>
          <label className="bh-field"><span>Pantone</span><input value={pantone} onChange={(event) => setPantone(event.target.value)} /></label>
          <label className="bh-field"><span>Boya türü</span><select value={paintType} onChange={(event) => setPaintType(event.target.value)}>{["SUBAZLI", "PIGMENT", "ECOPLAST", "SİLİKON", "AŞINDIRMA", "FİKSATÖR", "UV", "DİĞER"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="bh-field"><span>Kat sayısı</span><input type="number" min="1" step="1" value={copies} onChange={(event) => setCopies(Math.max(1, Number(event.target.value || 1)))} /></label>
        </div>

        <div className="bh-table-wrap wide">
          <table>
            <thead><tr><th>Ürün</th><th>Başlangıç GR</th>{Array.from({ length: trialCount }, (_, index) => <th key={index}>Deneme {index + 1} Eklendi</th>)}<th>Son Toplam</th><th>Lot</th><th>İşlem</th></tr></thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const rowLots = lots.filter(
                  (lot) =>
                    String(lot.inventoryId || lot.productId) === String(row.productId) &&
                    ["AVAILABLE", "ACTIVE"].includes(String(lot.status).toUpperCase()),
                );
                return (
                  <tr key={row.key}>
                    <td>
                      <select
                        value={row.productId}
                        onChange={(event) => {
                          const product = productMap.get(event.target.value);
                          const defaultLot =
                            lots.find(
                              (lot) =>
                                String(lot.inventoryId || lot.productId) === event.target.value &&
                                lot.isDefault,
                            ) ||
                            lots.find(
                              (lot) =>
                                String(lot.inventoryId || lot.productId) === event.target.value,
                            );
                          updateRow(rowIndex, {
                            productId: event.target.value,
                            productName: product?.productName || "",
                            lotId: defaultLot?.id || "",
                          });
                        }}
                      >
                        <option value="">Ürün seç</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.productName}{product.approvalStatus !== "APPROVED" ? " · Onay bekliyor" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td><input type="number" min="0" step="0.01" value={row.startGram} onChange={(event) => updateRow(rowIndex, { startGram: event.target.value })} /></td>
                    {Array.from({ length: trialCount }, (_, trialIndex) => (
                      <td key={trialIndex}><input type="number" min="0" step="0.01" value={row.additions?.[trialIndex] || ""} onChange={(event) => updateAddition(rowIndex, trialIndex, event.target.value)} /></td>
                    ))}
                    <td><strong>{finalGram(row).toFixed(2)} g</strong></td>
                    <td><select value={row.lotId} onChange={(event) => updateRow(rowIndex, { lotId: event.target.value })}><option value="">Lot seç</option>{rowLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.lotNo} · {formatKg(lot.remainingKg)}</option>)}</select></td>
                    <td><button type="button" className="bh-btn mini danger" onClick={() => setRows((current) => current.filter((_, index) => index !== rowIndex))}>Çıkar</button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><th colSpan={2 + trialCount}>Numune toplamı</th><th>{totalGram.toFixed(2)} g × {copies}</th><th colSpan="2">{(totalGram * copies).toFixed(2)} g</th></tr></tfoot>
          </table>
        </div>
        <div className="bh-work-actions">
          <button type="button" className="bh-btn" onClick={addTrial}>+ Deneme Sütunu</button>
          <button type="button" className="bh-btn" disabled={trialCount <= 1} onClick={removeTrial}>Son Denemeyi Çıkar</button>
          <button type="button" className="bh-btn" onClick={() => setRows((current) => [...current, newRow(null, current.length + 1)])}>+ Ürün Satırı</button>
          <button type="button" className="bh-btn" disabled={busy} onClick={saveDraft}>Taslağı Kaydet</button>
          <button type="button" className="bh-btn primary" disabled={busy} onClick={approveSample}>Numuneyi Onayla ve Versiyon Oluştur</button>
        </div>
      </div>
    </section>
  );
}

export default function BoyahaneSamplePage({ activeMainCompany, moduleActionContext }) {
  const [jobs, setJobs] = useState([]);
  const [registeredColors, setRegisteredColors] = useState([]);
  const [products, setProducts] = useState([]);
  const [lots, setLots] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedColorId, setSelectedColorId] = useState("");
  const [tab, setTab] = useState("waiting");
  const [addColorOpen, setAddColorOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (keepSelection = true) => {
    if (!activeMainCompany?.slug) return;
    setLoading(true);
    setError("");
    try {
      const [jobRows, colorRows, productRows, lotRows] = await Promise.all([
        listBoyahaneJobs(activeMainCompany),
        listRegisteredColors(activeMainCompany),
        listBoyahaneProducts(activeMainCompany),
        listBoyahaneLots(activeMainCompany),
      ]);
      const sampleJobs = safeArray(jobRows).filter(
        (row) =>
          ["SAMPLE", "TRIAL"].includes(
            String(row.jobType || row.workflowType || row.type || "").toUpperCase(),
          ),
      );
      setJobs(sampleJobs);
      setRegisteredColors(safeArray(colorRows));
      setProducts(safeArray(productRows));
      setLots(safeArray(lotRows));
      const requested = moduleActionContext?.boyahaneJobId;
      const nextId =
        requested && sampleJobs.some((row) => row.id === requested)
          ? requested
          : keepSelection && sampleJobs.some((row) => row.id === selectedJobId)
            ? selectedJobId
            : "";
      setSelectedJobId(nextId);
      if (nextId) {
        const job = sampleJobs.find((row) => row.id === nextId);
        setSelectedColorId((current) =>
          safeArray(job?.colors).some((row) => row.id === current)
            ? current
            : safeArray(job?.colors)[0]?.id || "",
        );
      } else {
        setSelectedColorId("");
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany?.slug, moduleActionContext?.nonce, selectedJobId]);

  useEffect(() => { load(false); }, [activeMainCompany?.slug, moduleActionContext?.nonce]);

  const selectedJob = jobs.find((row) => row.id === selectedJobId) || null;
  const selectedColor = safeArray(selectedJob?.colors).find((row) => row.id === selectedColorId) || null;
  const visibleJobs = jobs.filter((job) => bucket(job) === tab);

  function openJob(job) {
    setSelectedJobId(job.id);
    setSelectedColorId(
      safeArray(job.colors).find(
        (row) => !["COMPLETED", "CANCELLED"].includes(String(row.status).toUpperCase()),
      )?.id || safeArray(job.colors)[0]?.id || "",
    );
    window.requestAnimationFrame(() =>
      document.querySelector(".bh-operation-workspace")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      }),
    );
  }

  async function refreshSelected(nextColorId) {
    if (!selectedJobId) return load();
    try {
      const row = await getBoyahaneJob(activeMainCompany, selectedJobId);
      setJobs((current) => current.map((job) => (job.id === row.id ? row : job)));
      setSelectedColorId(
        nextColorId ||
          safeArray(row.colors).find((item) => item.id === selectedColorId)?.id ||
          safeArray(row.colors)[0]?.id ||
          "",
      );
      setLots(safeArray(await listBoyahaneLots(activeMainCompany)));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function startJob(job) {
    setBusy(true);
    setError("");
    try {
      await startBoyahaneJob(activeMainCompany, job.id, true);
      await load();
      openJob({ ...job, status: "ACTIVE" });
      setTab("ongoing");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function addColor(form) {
    setBusy(true);
    setError("");
    try {
      const row = await addBoyahaneJobColor(activeMainCompany, selectedJob.id, {
        ...form,
        jobType: "SAMPLE",
      });
      setAddColorOpen(false);
      await refreshSelected(row.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelColor() {
    if (
      !selectedColor ||
      !window.confirm(
        `${selectedColor.colorName || "Renk"} silinmeyecek; iptal durumuna alınsın mı?`,
      )
    ) return;
    setBusy(true);
    setError("");
    try {
      await patchBoyahaneJobColor(activeMainCompany, selectedColor.id, {
        status: "CANCELLED",
        cancelledAt: new Date().toISOString(),
        cancelReason: "Numune işinden kullanıcı tarafından çıkarıldı",
      });
      await refreshSelected();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function finishJob() {
    if (!selectedJob || !window.confirm(`${selectedJob.modelName} numune işi kapatılsın mı?`)) return;
    setBusy(true);
    setError("");
    try {
      await completeBoyahaneJob(activeMainCompany, selectedJob.id);
      setSelectedJobId("");
      await load(false);
      setTab("approved");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function chooseNextColor() {
    if (!selectedJob?.colors?.length) return;
    const index = selectedJob.colors.findIndex((row) => row.id === selectedColorId);
    const next = [
      ...selectedJob.colors.slice(index + 1),
      ...selectedJob.colors.slice(0, index + 1),
    ].find(
      (row) => !["COMPLETED", "CANCELLED"].includes(String(row.status).toUpperCase()),
    );
    if (next) setSelectedColorId(next.id);
  }

  return (
    <div className="bh-operation-page sample">
      <section className="bh-operation-intro">
        <div>
          <small>NUMUNE MERKEZİ</small>
          <h2>Numune Çalışmaları</h2>
          <p>Numune işi imalat işinden ayrı açılır; yalnız pozitif eklemelerle çalışır ve onaylanan sonuç yeni reçete versiyonu oluşturur.</p>
        </div>
        <button type="button" className="bh-btn primary" onClick={() => setQueueOpen(true)}>+ Desenden Numune İşi Aç</button>
      </section>

      <nav className="bh-operation-tabs">
        {TABS.map(([key, label]) => (
          <button type="button" key={key} className={tab === key ? "active" : ""} onClick={() => { setTab(key); setSelectedJobId(""); }}>
            {label}<b>{jobs.filter((job) => bucket(job) === key).length}</b>
          </button>
        ))}
      </nav>
      {error ? <div className="bh-notice danger">{error}</div> : null}
      {loading ? <div className="bh-empty large">Numune işleri yükleniyor…</div> : null}

      <div className="bh-operation-card-grid">
        {visibleJobs.map((job) => (
          <article className="bh-operation-card" key={job.id}>
            <button type="button" className="bh-model-image-button" onClick={() => openJob(job)}><ModelThumbnail src={job.imageUrl} alt={job.modelName} size="large" /></button>
            <div>
              <span className={`bh-status ${statusTone(job.status)}`}>{job.status}</span>
              <h3>{job.modelName}</h3>
              <p>{job.companyName || "Firma yok"} · {job.orderNo || "Sipariş yok"}</p>
              <dl>
                <div><dt>Toplam renk</dt><dd>{safeArray(job.colors).filter((row) => row.status !== "CANCELLED").length}</dd></div>
                <div><dt>Onaylanan</dt><dd>{job.preparedColorCount || 0}</dd></div>
                <div><dt>Bekleyen</dt><dd>{job.pendingColorCount || 0}</dd></div>
                <div><dt>Son işlem</dt><dd>{formatDate(job.updatedAt)}</dd></div>
                <div><dt>Boyacı</dt><dd>{job.lastActor || "-"}</dd></div>
                <div><dt>Bekleme</dt><dd>{waitText(job.createdAt)}</dd></div>
              </dl>
              <div className="bh-row-actions">
                <button type="button" className="bh-btn primary" onClick={() => openJob(job)}>Numuneyi Aç</button>
                {String(job.status).toUpperCase() === "WAITING" ? <button type="button" className="bh-btn" disabled={busy} onClick={() => startJob(job)}>Çalışmaya Başla</button> : null}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!visibleJobs.length && !loading ? <div className="bh-empty large">Bu bölümde numune işi bulunmuyor.</div> : null}

      {selectedJob ? (
        <section className="bh-operation-workspace">
          <header className="bh-operation-model-head">
            <ModelThumbnail src={selectedJob.imageUrl} alt={selectedJob.modelName} size="large" />
            <div>
              <small>NUMUNE TAM ÇALIŞMA EKRANI</small>
              <h2>{selectedJob.modelName}</h2>
              <p>{selectedJob.companyName || "-"} · {selectedJob.orderNo || "-"} · {selectedJob.printRegion || "Tüm baskı bölgeleri"}</p>
              <div className="bh-summary-facts">
                <span>Toplam renk <b>{safeArray(selectedJob.colors).filter((row) => row.status !== "CANCELLED").length}</b></span>
                <span>Onaylanan <b>{selectedJob.preparedColorCount || 0}</b></span>
                <span>Bekleyen <b>{selectedJob.pendingColorCount || 0}</b></span>
                <span>Kanal <b>{selectedJob.channelCount || 0}</b></span>
              </div>
            </div>
            <div className="bh-head-actions">
              <button type="button" className="bh-btn" onClick={() => setSelectedJobId("")}>Listeye Dön</button>
              <button type="button" className="bh-btn primary" disabled={busy} onClick={finishJob}>Numune İşini Kapat</button>
            </div>
          </header>
          <div className="bh-work-grid">
            <ModelColorList colors={safeArray(selectedJob.colors)} selectedId={selectedColorId} onSelect={setSelectedColorId} onAdd={() => setAddColorOpen(true)} onDelete={cancelColor} />
            <SampleEditor activeMainCompany={activeMainCompany} job={selectedJob} color={selectedColor} products={products} lots={lots} registeredColors={registeredColors} onSaved={refreshSelected} onNext={chooseNextColor} />
          </div>
        </section>
      ) : null}

      {addColorOpen ? <AddColorModal colors={registeredColors} job={selectedJob} busy={busy} onCancel={() => setAddColorOpen(false)} onSave={addColor} /> : null}
      {queueOpen ? <QueueDesignModal activeMainCompany={activeMainCompany} jobMode="sample" queuedModelIds={jobs.map((row) => row.designId || row.modelCardId)} onClose={() => setQueueOpen(false)} onQueued={async (close) => { await load(false); if (close) setQueueOpen(false); }} /> : null}
    </div>
  );
}
