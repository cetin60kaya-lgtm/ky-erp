/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createManualBoyahaneJob } from "../../../services/boyahaneManualApi";
import {
  completeBoyahaneJob,
  compareColorRecipe,
  createBoyahaneProduct,
  createBoyahaneProduction,
  createBoyahaneWorkflowLot,
  createColorRecipeVersion,
  createRegisteredColor,
  getBoyahaneJob,
  listBoyahaneJobs,
  listBoyahaneLogs,
  listBoyahaneLots,
  listBoyahaneProducts,
  listBoyahaneProductions,
  listColorRecipes,
  listRegisteredColors,
  patchBoyahaneJob,
  patchBoyahaneJobColor,
} from "../../../services/boyahaneWorkflowApi";
import ModelThumbnail from "./ModelThumbnail";
import ProductSearchInput from "./ProductSearchInput";
import { formatDate, formatKg, safeArray } from "./boyahaneFormat";
import "../boyahaneProductionSerial.css";

const OPEN_LOTS = new Set(["AVAILABLE", "ACTIVE"]);
const DONE = new Set(["COMPLETED", "CANCELLED"]);
const TABS = [
  ["prepare", "Boyası Hazırlanacaklar"],
  ["manufacturing-waiting", "İmalat Bekleyenler"],
  ["active", "Aktif İmalatlar"],
  ["completed", "Tamamlananlar"],
];

function txt(value) {
  return String(value ?? "").trim();
}

function num(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function norm(value) {
  return txt(value)
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9ÇĞÖŞÜ#]+/g, "");
}

function isProduction(row) {
  return !["SAMPLE", "TRIAL"].includes(
    txt(row?.jobType || row?.workflowType || row?.type).toUpperCase(),
  );
}

function colorsOf(job) {
  return safeArray(job?.colors).filter(
    (row) => txt(row?.status).toUpperCase() !== "CANCELLED",
  );
}

function isPrepared(job) {
  const rows = colorsOf(job);
  return rows.length > 0 && rows.every((row) => DONE.has(txt(row.status).toUpperCase()));
}

function bucket(job) {
  if (txt(job?.status).toUpperCase() === "COMPLETED") return "completed";
  if (job?.enteredProductionAt || txt(job?.manufacturingStatus).toUpperCase() === "ACTIVE") return "active";
  if (isPrepared(job)) return "manufacturing-waiting";
  return "prepare";
}

function samePaint(row, paintType) {
  const key = norm(paintType);
  return [row?.dyeType, row?.paintType, ...safeArray(row?.paintTypes)].some(
    (value) => norm(value) === key,
  );
}

function isSubazli(value) {
  return norm(value) === "SUBAZLI";
}

function sourceType(row) {
  const value = txt(row?.sourceType || row?.colorSource).toUpperCase();
  if (value === "REFERENCE") return "REFERENCE";
  if (["VISUAL", "RGB", "HEX"].includes(value)) return "VISUAL";
  return row?.pantone ? "PANTONE" : "VISUAL";
}

function sourceLabel(row) {
  const value = sourceType(row);
  if (value === "REFERENCE") return "Renk referansına göre";
  if (value === "VISUAL") return "Görsel / RGB’ye göre";
  return "Pantoneye göre";
}

function recipeLines(recipe) {
  return safeArray(recipe?.lines).filter(
    (line) =>
      line &&
      (line.productId || line.inventoryId || line.productName) &&
      num(line.referenceGram ?? line.totalGr ?? line.trialTotalGr) > 0,
  );
}

function versionRank(row) {
  return Number(txt(row?.version).match(/\d+/)?.[0] || 0);
}

function bestRecipe(rows, preferredId, paintType) {
  const filtered = safeArray(rows).filter((row) => samePaint(row, paintType));
  return (
    filtered.find((row) => txt(row.id) === txt(preferredId)) ||
    filtered.find((row) => txt(row.status).toUpperCase() === "ACTIVE") ||
    [...filtered].sort((a, b) => versionRank(b) - versionRank(a))[0] ||
    null
  );
}

function findRegistered(rows, color, paintType, pantone, colorName) {
  const direct = rows.find((row) => txt(row.id) === txt(color?.registeredColorId));
  if (direct && samePaint(direct, paintType)) return direct;
  const candidates = rows.filter((row) => samePaint(row, paintType));
  const p = norm(pantone || color?.pantone);
  const n = norm(colorName || color?.colorName);
  return (
    candidates.find((row) => p && norm(row.pantone) === p && (!n || norm(row.colorName) === n)) ||
    candidates.find((row) => p && norm(row.pantone) === p) ||
    candidates.find((row) => n && norm(row.colorName) === n) ||
    null
  );
}

function defaultLot(productId, lots) {
  return (
    lots.find(
      (row) =>
        txt(row.inventoryId || row.productId) === txt(productId) &&
        row.isDefault &&
        OPEN_LOTS.has(txt(row.status).toUpperCase()),
    ) ||
    lots.find(
      (row) =>
        txt(row.inventoryId || row.productId) === txt(productId) &&
        OPEN_LOTS.has(txt(row.status).toUpperCase()),
    ) ||
    null
  );
}

function productMatch(products, aliases) {
  const keys = aliases.map(norm);
  return products.find((row) => {
    const values = [row?.productName, row?.tradeName, row?.code].map(norm);
    return keys.some((key) => values.some((value) => value === key || value.includes(key)));
  });
}

function rowKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function blankRow(product, lots, extra = {}) {
  return {
    key: rowKey("row"),
    productId: product?.id || "",
    productName: product?.productName || "",
    referenceGram: "",
    lotId: defaultLot(product?.id, lots)?.id || "",
    fixed: false,
    label: "",
    ...extra,
  };
}

function newRows(products, lots, paintType) {
  if (!isSubazli(paintType)) return [blankRow(null, lots, { label: "Bileşen 1" })];
  const s10 = productMatch(products, ["S 10 CLEAR", "S10 CLEAR", "S 10 ŞEFFAF", "S10 ŞEFFAF", "S10"]);
  const s20 = productMatch(products, ["S 20 WHITE", "S20 WHITE", "S 20 BEYAZ", "S20 BEYAZ", "S20"]);
  return [
    blankRow(s10, lots, { fixed: true, label: "Sabit 1", productName: s10?.productName || "S 10 CLEAR" }),
    blankRow(s20, lots, { fixed: true, label: "Sabit 2", productName: s20?.productName || "S 20 WHITE" }),
    blankRow(null, lots, { label: "Renk 1" }),
    blankRow(null, lots, { label: "Renk 2" }),
  ];
}

function rowsFromRecipe(recipe, products, lots) {
  return recipeLines(recipe).map((line, index) => {
    const requested = txt(line.productId || line.inventoryId);
    const product =
      products.find((row) => txt(row.id) === requested) ||
      products.find((row) => norm(row.productName) === norm(line.productName));
    const productId = product?.id || requested;
    return {
      key: line.id || rowKey(`recipe-${index}`),
      productId,
      productName: line.productName || product?.productName || "",
      referenceGram: num(line.referenceGram ?? line.totalGr ?? line.trialTotalGr),
      lotId: line.lotId || defaultLot(productId, lots)?.id || "",
      fixed: false,
      label: "",
    };
  });
}

function productionLines(row) {
  const source = safeArray(row?.items).length ? safeArray(row.items) : safeArray(row?.lines);
  return source.map((line, index) => ({
    id: line.id || `${row?.id || "history"}-${index}`,
    productId: line.productId || line.inventoryId || "",
    productName: line.productNameSnapshot || line.productName || "",
    referenceGram: num(line.referenceGram ?? line.totalGr ?? line.trialTotalGr),
    lotId: line.lotId || "",
    lotNo: line.lotNoSnapshot || line.lotNo || "",
  }));
}

function sameColorProduction(row, registered, color) {
  if (registered?.id && txt(row?.colorId) === txt(registered.id)) return true;
  const p = norm(color?.pantone || registered?.pantone);
  const n = norm(color?.colorName || registered?.colorName);
  return Boolean(
    (p && norm(row?.pantoneSnapshot || row?.pantone) === p) ||
      (n && norm(row?.colorNameSnapshot || row?.colorName) === n),
  );
}

function ProductionWorkspace({ activeMainCompany, job, data, onBack, onReload }) {
  const { products, lots, registeredColors, productions, logs } = data;
  const modelColors = colorsOf(job);
  const [colorId, setColorId] = useState(modelColors[0]?.id || "");
  const color = modelColors.find((row) => txt(row.id) === txt(colorId)) || modelColors[0] || null;
  const [paintType, setPaintType] = useState(color?.paintType || "SUBAZLI");
  const [pantone, setPantone] = useState(color?.pantone || "");
  const [colorName, setColorName] = useState(color?.colorName || "");
  const [registered, setRegistered] = useState(null);
  const [recipes, setRecipes] = useState([]);
  const [rows, setRows] = useState([]);
  const [pulledRecipe, setPulledRecipe] = useState(null);
  const [targetKg, setTargetKg] = useState(color?.plannedKg || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [rf, setRf] = useState({ enabled: false, kg: "", tl: "" });

  const productMap = useMemo(
    () => new Map(products.map((row) => [txt(row.id), row])),
    [products],
  );
  const recommended = bestRecipe(recipes, color?.recipeId, paintType);
  const referenceTotal = rows.reduce((sum, row) => sum + num(row.referenceGram), 0);
  const multiplier = num(targetKg) > 0 && referenceTotal > 0 ? (num(targetKg) * 1000) / referenceTotal : 1;
  const preparedTotalKg = (referenceTotal * multiplier) / 1000;
  const history = useMemo(
    () =>
      productions
        .filter((row) => sameColorProduction(row, registered, color))
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    [productions, registered?.id, color?.id, pantone, colorName],
  );
  const modelLogs = useMemo(() => {
    const ids = new Set([txt(job.id), ...modelColors.map((row) => txt(row.id))]);
    const modelKey = norm(job.modelName);
    return logs
      .filter(
        (row) =>
          ids.has(txt(row.entityId)) ||
          (modelKey && norm(row.description || row.note).includes(modelKey)),
      )
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 8);
  }, [logs, job.id]);

  const syncColor = useCallback(async () => {
    if (!color) return;
    const type = color.paintType || "SUBAZLI";
    const nextPantone = color.pantone || "";
    const nextName = color.colorName || "";
    setPaintType(type);
    setPantone(nextPantone);
    setColorName(nextName);
    setTargetKg(color.plannedKg || "");
    setPulledRecipe(null);
    setMessage("");
    setError("");
    setRf({ enabled: false, kg: "", tl: "" });
    const draft = color.productionDraft || {};
    if (safeArray(draft.rows).length) {
      setRows(
        safeArray(draft.rows).map((row) => ({
          ...row,
          key: row.key || rowKey("draft"),
          lotId: row.lotId || defaultLot(row.productId, lots)?.id || "",
        })),
      );
      setTargetKg(draft.targetKg ?? color.plannedKg ?? "");
    } else {
      setRows(newRows(products, lots, type));
    }
    const found = findRegistered(registeredColors, color, type, nextPantone, nextName);
    setRegistered(found || null);
    if (!found) {
      setRecipes([]);
      return;
    }
    try {
      setRecipes(safeArray(await listColorRecipes(activeMainCompany, found.id)));
    } catch (requestError) {
      setError(requestError.message);
      setRecipes([]);
    }
  }, [color?.id, products, lots, registeredColors]);

  useEffect(() => {
    syncColor();
  }, [syncColor]);

  function updateRow(index, patch) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function selectProduct(index, productId) {
    const product = productMap.get(txt(productId));
    updateRow(index, {
      productId,
      productName: product?.productName || "",
      lotId: defaultLot(productId, lots)?.id || "",
    });
  }

  function pullRecipe(recipe) {
    const mapped = rowsFromRecipe(recipe, products, lots);
    if (!mapped.length) {
      setRows(newRows(products, lots, paintType));
      setPulledRecipe(null);
      setMessage("Bu versiyonda bileşen gramajı yok; standart başlangıç şablonu açıldı.");
      return;
    }
    setRows(mapped);
    setPulledRecipe(recipe);
    setMessage(`${recipe.version || "V1"} reçetesi çalışma alanına çekildi.`);
    setError("");
  }

  function pullHistory(row) {
    const recipe = recipes.find((item) => txt(item.id) === txt(row.recipeId));
    if (recipe) {
      pullRecipe(recipe);
      return;
    }
    const lines = productionLines(row);
    if (!lines.length) return;
    setRows(
      lines.map((line) => ({
        key: line.id || rowKey("history"),
        productId: line.productId,
        productName: line.productName,
        referenceGram: line.referenceGram,
        lotId: defaultLot(line.productId, lots)?.id || line.lotId || "",
        fixed: false,
        label: "",
      })),
    );
    setPulledRecipe({ id: row.recipeId || "", version: row.version || row.versionSnapshot || "Geçmiş" });
    setMessage(`${row.modelName || row.modelSnapshot || "Geçmiş model"} reçetesi çalışma alanına çekildi.`);
  }

  async function refreshRegistered(nextType = paintType, nextPantone = pantone, nextName = colorName) {
    setBusy(true);
    setError("");
    try {
      const found = findRegistered(registeredColors, color, nextType, nextPantone, nextName);
      setRegistered(found || null);
      if (!found) {
        setRecipes([]);
        setPulledRecipe(null);
        setRows(newRows(products, lots, nextType));
        setMessage("Kayıtlı renk bulunamadı; boya türü standart şablonu açıldı.");
      } else {
        const nextRecipes = safeArray(await listColorRecipes(activeMainCompany, found.id));
        setRecipes(nextRecipes);
        setMessage("Kayıtlı renk bulundu; bileşenleri kontrol edip istediğin reçeteyi çek.");
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function usableLines() {
    return rows
      .filter((row) => row.productId || num(row.referenceGram) > 0 || row.lotId)
      .map((row) => ({
        productId: row.productId,
        inventoryId: row.productId,
        productName: productMap.get(txt(row.productId))?.productName || row.productName,
        referenceGram: num(row.referenceGram),
        totalGr: num(row.referenceGram),
        trialTotalGr: num(row.referenceGram),
        lotId: row.lotId,
      }));
  }

  function validate() {
    const lines = usableLines();
    if (!color) throw new Error("Renk seçilmedi.");
    if (!colorName.trim()) throw new Error("Renk adı boş olamaz.");
    if (!lines.length) throw new Error("Reçete bileşenleri boş olamaz.");
    for (const [index, line] of lines.entries()) {
      if (!line.productId) throw new Error(`${index + 1}. satırda ürün seçilmedi.`);
      if (line.referenceGram <= 0) throw new Error(`${index + 1}. satır gramajı sıfırdan büyük olmalı.`);
      if (!line.lotId) throw new Error(`${index + 1}. satırda lot seçilmedi.`);
    }
    if (num(targetKg) <= 0) throw new Error("Hedef KG sıfırdan büyük olmalı.");
    if (isSubazli(paintType) && rows.length < 4) throw new Error("SUBAZLI reçete en az 4 standart satırla çalışmalıdır.");
    return lines;
  }

  async function ensureRegisteredColor() {
    if (registered?.id) return registered;
    const created = await createRegisteredColor(activeMainCompany, {
      pantone,
      colorName,
      paintType,
      dyeType: paintType,
      sourceType: sourceType(color),
      colorSource: sourceType(color),
      colorHex: color?.colorHex || "",
      referenceName: color?.referenceName || "",
      referenceCode: color?.referenceCode || "",
      referenceNote: color?.referenceNote || "",
    });
    setRegistered(created);
    await patchBoyahaneJobColor(activeMainCompany, color.id, {
      registeredColorId: created.id,
      pantone,
      colorName,
      paintType,
    });
    return created;
  }

  async function saveDraft() {
    setBusy(true);
    setError("");
    try {
      await patchBoyahaneJobColor(activeMainCompany, color.id, {
        paintType,
        pantone,
        colorName,
        productionDraft: {
          paintType,
          pantone,
          colorName,
          targetKg: num(targetKg),
          rows,
          savedAt: new Date().toISOString(),
        },
      });
      setMessage("İmalat reçetesi taslak olarak kaydedildi.");
      await onReload(job.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveRf(recipe) {
    if (!rf.enabled || num(rf.kg) <= 0) return;
    const now = new Date();
    const stamp = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getFullYear()).slice(-2)}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const kg = num(rf.kg);
    const product = await createBoyahaneProduct(activeMainCompany, {
      productName: `RF - ${job.modelName} - ${colorName} - ${stamp}`,
      tradeName: `${pantone || colorName} · ${paintType} · ${recipe?.version || "V1"}`,
      code: `RF-${norm(job.modelName).slice(0, 10)}-${stamp}`,
      supplierName: "HAKAN BASKI BOYAHANE",
      dyeType: "RF BOYA",
      unit: "KG",
      currentPrice: num(rf.tl) > 0 ? num(rf.tl) / kg : 0,
      currency: "TRY",
      approvalStatus: "APPROVED",
      source: "RF_PREPARED",
      note: `${job.modelName} / ${colorName} / ${pantone}. İlk hazırlama sarfı tekrar düşülmez.`,
    });
    await createBoyahaneWorkflowLot(activeMainCompany, {
      inventoryId: product.id,
      productId: product.id,
      productName: product.productName,
      lotNo: `RF-${stamp}`,
      entryKg: kg,
      quantity: kg,
      supplierName: "HAKAN BASKI BOYAHANE",
      isDefault: true,
      source: "RF_PREPARED",
      status: "AVAILABLE",
    });
  }

  async function saveProduction() {
    setBusy(true);
    setError("");
    try {
      const lines = validate();
      const registeredRow = await ensureRegisteredColor();
      const comparison = await compareColorRecipe(activeMainCompany, registeredRow.id, {
        paintType,
        lines,
      });
      let recipe = comparison?.exactMatch ? comparison.recipe : null;
      if (!recipe) {
        recipe = await createColorRecipeVersion(activeMainCompany, registeredRow.id, {
          paintType,
          dyeType: paintType,
          jobId: job.id,
          jobColorId: color.id,
          lines,
        });
      }
      const production = await createBoyahaneProduction(activeMainCompany, {
        requestId: globalThis.crypto?.randomUUID?.() || `prod-${Date.now()}`,
        jobId: job.id,
        jobColorId: color.id,
        colorId: registeredRow.id,
        recipeId: recipe.id,
        paintType,
        pantone,
        colorName,
        version: recipe.version || "V1",
        multiplier,
        jobType: "PRODUCTION",
        companyName: job.companyName,
        orderNo: job.orderNo,
        lines,
      });
      await saveRf(recipe);
      setMessage(`Renk hazırlandı: ${formatKg(production?.totalPreparedKg || preparedTotalKg)} · ${recipe.version || "V1"}.`);
      await onReload(job.id);
      if (production?.nextColorId) setColorId(production.nextColorId);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function completeModel() {
    setBusy(true);
    setError("");
    try {
      await completeBoyahaneJob(activeMainCompany, job.id);
      await onReload(job.id);
      onBack();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const recommendedLines = recipeLines(recommended);

  return (
    <div className="bh-prod-work">
      <section className="ps-card bh-prod-model-head">
        <div className="bh-prod-model-summary">
          <ModelThumbnail src={job.imageUrl || job.designImageUrl} alt={job.modelName} size="medium" />
          <div>
            <small>İMALAT BOYASI ÇALIŞMA EKRANI</small>
            <h2>{job.modelName || "Model"}</h2>
            <p>{job.companyName || "-"} · {job.orderNo || "Sipariş no yok"}</p>
            <div className="bh-prod-badges">
              <span className="bh-prod-badge">Toplam {modelColors.length}</span>
              <span className="bh-prod-badge ok">Hazır {modelColors.filter((row) => txt(row.status).toUpperCase() === "COMPLETED").length}</span>
              <span className="bh-prod-badge warn">Kalan {modelColors.filter((row) => txt(row.status).toUpperCase() !== "COMPLETED").length}</span>
            </div>
          </div>
        </div>
        <div className="bh-prod-badges">
          <button type="button" className="bh-prod-btn" onClick={onBack}>Listeye Dön</button>
          <button type="button" className="bh-prod-btn primary" disabled={busy} onClick={completeModel}>Modeli Tamamla</button>
        </div>
      </section>

      <div className="bh-prod-work-grid">
        <aside className="ps-card bh-prod-colors">
          <div className="bh-prod-colors-head"><strong>Model Renkleri · sırayla</strong><span className="bh-prod-badge">{modelColors.length} renk</span></div>
          {modelColors.map((row) => (
            <button key={row.id} type="button" className={`bh-prod-color-item ${txt(row.id) === txt(color?.id) ? "active" : ""}`} onClick={() => setColorId(row.id)}>
              <i className="bh-prod-color-swatch" style={{ background: row.colorHex || "#dbe3ee" }} />
              <span><b>{row.colorName || "Renk"}</b><small>{row.pantone || row.referenceCode || row.colorHex || "Kod yok"} · {row.paintType || "SUBAZLI"}</small></span>
              <em className={txt(row.status).toUpperCase() === "COMPLETED" ? "done" : ""}>{txt(row.status).toUpperCase() === "COMPLETED" ? "Hazır" : "Hazırlanacak"}</em>
            </button>
          ))}
        </aside>

        <main className="bh-prod-main">
          {color ? (
            <>
              <section className="ps-card bh-prod-color-head">
                <div><h2>{pantone || color.referenceCode || color.colorHex || "RENK"} · {colorName || "Renk"}</h2><p>{sourceLabel(color)} · {paintType} · Model alt işlemi</p></div>
                <div className="bh-prod-badges"><span className={`bh-prod-badge ${registered ? "ok" : "warn"}`}>{registered ? "Kayıtlı renk var" : "Yeni renk"}</span><button type="button" className="bh-prod-btn" disabled={busy} onClick={() => refreshRegistered()}>Kayıtlı Rengi Kontrol Et</button></div>
              </section>

              <section className="ps-card bh-prod-meta">
                <label className="bh-prod-field"><span>Renk kimliği</span><input value={`${pantone || color.referenceCode || color.colorHex || ""} · ${colorName}`} readOnly /></label>
                <label className="bh-prod-field"><span>Boya türü</span><select value={paintType} onChange={(event) => { const value = event.target.value; setPaintType(value); setRows(newRows(products, lots, value)); setPulledRecipe(null); refreshRegistered(value, pantone, colorName); }}><option>SUBAZLI</option><option>PIGMENT</option><option>ECO YÜKSEK</option><option>ECOPLAST</option><option>SİLİKON</option><option>AŞINDIRMA</option><option>FİKSATÖR</option><option>UV</option><option>DİĞER</option></select></label>
                <label className="bh-prod-field"><span>Çalışma reçetesi</span><input value={pulledRecipe?.version || (recommended ? "Önizleme hazır" : "Yeni reçete")} readOnly /></label>
                <label className="bh-prod-field"><span>Hedef KG</span><input type="number" min="0" step="0.001" value={targetKg} onChange={(event) => setTargetKg(event.target.value)} /></label>
                <label className="bh-prod-field"><span>Renk adı</span><input value={colorName} onChange={(event) => setColorName(event.target.value)} /></label>
              </section>

              <div className="bh-prod-split">
                <div className="bh-prod-recipe-side">
                  {registered && recommendedLines.length ? (
                    <section className="bh-prod-preview">
                      <div className="bh-prod-preview-head"><div><strong>Son onaylı reçete bulundu · {recommended.version || "V1"}</strong><small>Önce bileşenleri gör; sonra çalışma alanına çek.</small></div><span className="bh-prod-badge ok">Önerilen</span></div>
                      <div className="bh-prod-components">{recommendedLines.map((line) => <span key={line.id || `${line.productId}-${line.productName}`} className="bh-prod-component">{line.productName || productMap.get(txt(line.productId))?.productName || "Ürün"}<b>{num(line.referenceGram ?? line.totalGr).toFixed(2)} g</b></span>)}</div>
                      <div className="bh-prod-preview-actions"><button type="button" className="bh-prod-btn green" onClick={() => pullRecipe(recommended)}>Bu Reçeteyi Çek</button></div>
                    </section>
                  ) : (
                    <section className="bh-prod-preview warn">
                      <div className="bh-prod-preview-head"><div><strong>{registered ? "Kayıtlı renk var fakat bileşenli reçete yok" : "Kayıtlı reçete yok"} · standart {paintType} başlangıcı</strong><small>{isSubazli(paintType) ? "SUBAZLI hiçbir zaman boş açılmaz: S10 CLEAR, S20 WHITE, Renk 1, Renk 2." : "Yeni reçete için bileşen ekle."}</small></div><span className="bh-prod-badge warn">Standart</span></div>
                      {isSubazli(paintType) ? <div className="bh-prod-components"><span className="bh-prod-component">1 · S10 CLEAR <b>sabit</b></span><span className="bh-prod-component">2 · S20 WHITE <b>sabit</b></span><span className="bh-prod-component">3 · Renk 1 <b>boş</b></span><span className="bh-prod-component">4 · Renk 2 <b>boş</b></span></div> : null}
                    </section>
                  )}

                  {message ? <div className="bh-prod-message ok">{message}</div> : null}
                  {error ? <div className="bh-prod-message bad">{error}</div> : null}

                  <section className="ps-card bh-prod-table-card">
                    <div className="bh-prod-table-head"><strong>Çalışma Reçetesi · bileşenler ve gerçek lotlar</strong><button type="button" className="bh-prod-btn" onClick={() => setRows((current) => [...current, blankRow(null, lots, { label: `Ek ${current.length + 1}` })])}>+ Ürün</button></div>
                    <div className="bh-prod-table-scroll">
                      <table className="bh-prod-table">
                        <thead><tr><th>#</th><th>Ürün / Bileşen</th><th>Referans GR</th><th>%</th><th>İmalat GR</th><th>Lot</th><th>Firma</th><th>Kalan KG</th><th>İşlem</th></tr></thead>
                        <tbody>
                          {rows.map((row, index) => {
                            const product = productMap.get(txt(row.productId));
                            const productLots = lots.filter((lot) => txt(lot.inventoryId || lot.productId) === txt(row.productId) && OPEN_LOTS.has(txt(lot.status).toUpperCase()));
                            const selectedLot = productLots.find((lot) => txt(lot.id) === txt(row.lotId));
                            const percentage = referenceTotal > 0 ? (num(row.referenceGram) / referenceTotal) * 100 : 0;
                            return (
                              <tr key={row.key} className={row.fixed ? "fixed" : !row.productId ? "blank" : ""}>
                                <td>{index + 1}</td>
                                <td>{row.fixed ? <><b>{row.productName}</b><span className="bh-prod-lock">{row.label}</span></> : <ProductSearchInput products={products} value={row.productId} allowUnapproved={false} placeholder={`${row.label || "Ürün"} seç`} onChange={(value) => selectProduct(index, value)} />}</td>
                                <td><input type="number" min="0" step="0.01" value={row.referenceGram} onChange={(event) => updateRow(index, { referenceGram: event.target.value })} /></td>
                                <td>{percentage.toFixed(2)}%</td>
                                <td>{(num(row.referenceGram) * multiplier).toFixed(0)}</td>
                                <td><select value={row.lotId} onChange={(event) => updateRow(index, { lotId: event.target.value })}><option value="">Lot seç</option>{productLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.lotNo || "Lot"} · {formatKg(lot.remainingKg ?? lot.remainingQuantity ?? lot.quantity)}</option>)}</select></td>
                                <td>{product?.supplierName || product?.companyName || selectedLot?.supplierName || "-"}</td>
                                <td>{selectedLot ? formatKg(selectedLot.remainingKg ?? selectedLot.remainingQuantity ?? selectedLot.quantity) : "-"}</td>
                                <td>{row.fixed ? "Sabit" : <button type="button" className="bh-prod-btn" onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Sil</button>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot><tr><th colSpan="2">Toplam</th><th className="bh-prod-total">{referenceTotal.toFixed(2)} GR</th><th>100%</th><th className="bh-prod-total">{(preparedTotalKg * 1000).toFixed(0)} GR</th><th colSpan="4">Her bileşenin lotu ayrı tutulur</th></tr></tfoot>
                      </table>
                    </div>
                  </section>
                </div>

                <aside className="ps-card bh-prod-history">
                  <h3>Renk Geçmişi · direkt görünür</h3>
                  <div className="bh-prod-history-list">
                    {history.length ? history.slice(0, 12).map((row, index) => {
                      const lines = productionLines(row);
                      return <article key={row.id} className={`bh-prod-history-card ${index === 0 ? "latest" : ""}`}><b>{row.modelName || row.modelSnapshot || "Model"} · {row.version || row.versionSnapshot || "V1"}</b><small>{formatDate(row.createdAt)} · {formatKg(row.totalPreparedKg || row.productionTotalKg)} · {row.actor || "KY ERP"}</small><div className="bh-prod-components" style={{ padding: "5px 0 0" }}>{lines.slice(0, 5).map((line) => <span key={line.id} className="bh-prod-component">{line.productName || "Ürün"}<b>{line.referenceGram.toFixed(2)}</b></span>)}</div><div className="bh-prod-history-actions"><button type="button" className="bh-prod-btn" onClick={() => setDetail(row)}>İçeriği Gör</button><button type="button" className="bh-prod-btn green" onClick={() => pullHistory(row)}>Çek</button></div></article>;
                    }) : <div className="bh-prod-empty">Bu renk için geçmiş üretim bulunmuyor.</div>}
                  </div>
                </aside>
              </div>

              <section className="ps-card bh-prod-log">
                <div className="bh-prod-log-head"><strong>Model İşlem Logu · sürekli görünür</strong><span className="bh-prod-badge">Son {modelLogs.length}</span></div>
                <div className="bh-prod-log-grid">{modelLogs.length ? modelLogs.slice(0, 8).map((row) => <div key={row.id || row.storeId} className="bh-prod-log-item"><b>{formatDate(row.createdAt)} · {row.action || row.actionType || "İşlem"}</b><span>{row.description || row.note || "Boyahane işlemi"}</span></div>) : <div className="bh-prod-log-item"><b>Henüz log yok</b><span>İlk kayıt işlemden sonra oluşacak.</span></div>}</div>
              </section>

              <div className="bh-prod-actions">
                <label className="bh-prod-rf"><input type="checkbox" checked={rf.enabled} onChange={(event) => setRf((current) => ({ ...current, enabled: event.target.checked }))} /> Hazırlanan boyanın kalanını RF ürün olarak kaydet</label>
                {rf.enabled ? <div className="bh-prod-rf-fields"><input type="number" min="0" step="0.001" placeholder="Kalan KG" value={rf.kg} onChange={(event) => setRf((current) => ({ ...current, kg: event.target.value }))} /><input type="number" min="0" step="0.01" placeholder="Toplam TL" value={rf.tl} onChange={(event) => setRf((current) => ({ ...current, tl: event.target.value }))} /></div> : null}
                <button type="button" className="bh-prod-btn" disabled={busy} onClick={saveDraft}>Taslak</button>
                <button type="button" className="bh-prod-btn green" disabled={busy} onClick={saveProduction}>{busy ? "Kaydediliyor…" : "Rengi Hazırla"}</button>
                <button type="button" className="bh-prod-btn primary" disabled={busy} onClick={saveProduction}>Kaydet + Sonraki Renk →</button>
              </div>
            </>
          ) : <div className="ps-card bh-prod-empty">Bu modelde işlenecek renk bulunmuyor.</div>}
        </main>
      </div>

      {detail ? <div className="bh-prod-modal" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><div className="bh-prod-modal-card"><div className="bh-prod-modal-head"><div><h3>{detail.modelName || detail.modelSnapshot || "Model"} · {detail.version || detail.versionSnapshot || "V1"}</h3><small>{formatDate(detail.createdAt)} · seçilen geçmiş reçete</small></div><button type="button" className="bh-prod-btn" onClick={() => setDetail(null)}>Kapat</button></div><div className="bh-prod-modal-body"><table className="bh-prod-table"><thead><tr><th>#</th><th>Bileşen</th><th>Referans GR</th><th>Lot</th></tr></thead><tbody>{productionLines(detail).map((line, index) => <tr key={line.id}><td>{index + 1}</td><td>{line.productName || "Ürün"}</td><td>{line.referenceGram.toFixed(2)}</td><td>{line.lotNo || line.lotId || "-"}</td></tr>)}</tbody></table><div className="bh-prod-modal-actions"><button type="button" className="bh-prod-btn green" onClick={() => { pullHistory(detail); setDetail(null); }}>Bu Reçeteyi Çek</button></div></div></div></div> : null}
    </div>
  );
}

export default function BoyahaneProductionSerialPage({ activeMainCompany, moduleActionContext }) {
  const [data, setData] = useState({ jobs: [], products: [], lots: [], registeredColors: [], productions: [], logs: [] });
  const [activeJobId, setActiveJobId] = useState(moduleActionContext?.boyahaneJobId || "");
  const [tab, setTab] = useState("prepare");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [newJob, setNewJob] = useState({ modelName: "", companyName: "", orderNo: "", plannedKg: "", plannedQuantity: "" });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (keepJobId = activeJobId) => {
    setLoading(true);
    setError("");
    try {
      const [jobs, products, lots, registeredColors, productions, logs] = await Promise.all([
        listBoyahaneJobs(activeMainCompany),
        listBoyahaneProducts(activeMainCompany),
        listBoyahaneLots(activeMainCompany),
        listRegisteredColors(activeMainCompany),
        listBoyahaneProductions(activeMainCompany),
        listBoyahaneLogs(activeMainCompany),
      ]);
      const productionJobs = safeArray(jobs).filter(isProduction);
      setData({ jobs: productionJobs, products: safeArray(products), lots: safeArray(lots), registeredColors: safeArray(registeredColors), productions: safeArray(productions), logs: safeArray(logs) });
      if (keepJobId) {
        try {
          const detail = await getBoyahaneJob(activeMainCompany, keepJobId);
          if (detail) setData((current) => ({ ...current, jobs: current.jobs.map((row) => txt(row.id) === txt(detail.id) ? detail : row) }));
        } catch {
          // Liste verisi yeterli; detay yüklenemezse ekran yine çalışır.
        }
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany?.slug]);

  useEffect(() => { load(moduleActionContext?.boyahaneJobId || activeJobId); }, [load, moduleActionContext?.nonce, moduleActionContext?.boyahaneJobId]);

  const activeJob = data.jobs.find((row) => txt(row.id) === txt(activeJobId)) || null;
  const visibleJobs = data.jobs.filter((row) => bucket(row) === tab);
  const counts = Object.fromEntries(TABS.map(([key]) => [key, data.jobs.filter((row) => bucket(row) === key).length]));

  async function enterManufacturing(job) {
    setError("");
    try {
      await patchBoyahaneJob(activeMainCompany, job.id, { manufacturingStatus: "ACTIVE", enteredProductionAt: job.enteredProductionAt || new Date().toISOString() });
      await load(job.id);
      setActiveJobId(job.id);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function createJob(event) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      const created = await createManualBoyahaneJob(activeMainCompany, {
        ...newJob,
        jobType: "PRODUCTION",
        workflowType: "PRODUCTION",
        plannedKg: num(newJob.plannedKg),
        plannedQuantity: num(newJob.plannedQuantity),
        channelCount: 1,
        uniqueColorCount: 1,
        colorName: "Yeni Renk",
        paintType: "SUBAZLI",
        sourceType: "VISUAL",
        colorSource: "VISUAL",
      });
      setNewJobOpen(false);
      setNewJob({ modelName: "", companyName: "", orderNo: "", plannedKg: "", plannedQuantity: "" });
      await load(created.id);
      setActiveJobId(created.id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCreating(false);
    }
  }

  if (activeJob) {
    return <div className="bh-prod-serial"><ProductionWorkspace activeMainCompany={activeMainCompany} job={activeJob} data={data} onBack={() => setActiveJobId("")} onReload={async (jobId) => { await load(jobId); }} /></div>;
  }

  return (
    <div className="bh-prod-serial">
      <section className="ps-card bh-prod-list-head"><div><small>İMALAT BOYALARI</small><h2>Model Bazlı Seri İmalat</h2><p>Bir model tek iş; renkler modelin alt işlemleri. Kayıtlı reçete önce görünür, sonra çekilir.</p></div><button type="button" className="bh-prod-btn primary" onClick={() => setNewJobOpen(true)}>+ Yeni İmalat İşi</button></section>
      {error ? <div className="bh-prod-message bad">{error}</div> : null}
      <section className="ps-card bh-prod-list-tabs">{TABS.map(([key, label]) => <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label} · {counts[key] || 0}</button>)}</section>
      {loading ? <div className="ps-card bh-prod-empty">İmalat işleri yükleniyor…</div> : visibleJobs.length ? <div className="bh-prod-model-grid">{visibleJobs.map((job) => { const rows = colorsOf(job); const ready = rows.filter((row) => txt(row.status).toUpperCase() === "COMPLETED").length; return <article key={job.id} className="ps-card bh-prod-model-card"><ModelThumbnail src={job.imageUrl || job.designImageUrl} alt={job.modelName} size="medium" /><div><h3>{job.modelName || "Model"}</h3><p>{job.companyName || "-"} · {job.orderNo || "Sipariş no yok"}</p><div className="bh-prod-badges"><span className="bh-prod-badge">{rows.length} renk</span><span className="bh-prod-badge ok">{ready} hazır</span><span className="bh-prod-badge warn">{Math.max(0, rows.length - ready)} kalan</span></div><div className="bh-prod-model-actions"><button type="button" className="bh-prod-btn primary" onClick={() => setActiveJobId(job.id)}>İşi Aç</button>{bucket(job) === "manufacturing-waiting" ? <button type="button" className="bh-prod-btn green" onClick={() => enterManufacturing(job)}>İmalata Girdi</button> : null}</div></div></article>; })}</div> : <div className="ps-card bh-prod-empty">Bu bölümde model yok.</div>}

      {newJobOpen ? <div className="bh-prod-modal" role="dialog" aria-modal="true"><form className="bh-prod-modal-card" onSubmit={createJob}><div className="bh-prod-modal-head"><div><h3>Yeni İmalat İşi Aç</h3><small>Desenden beklemeden model bazlı Boyahane işi oluştur.</small></div><button type="button" className="bh-prod-btn" onClick={() => setNewJobOpen(false)}>Kapat</button></div><div className="bh-prod-modal-body"><div className="bh-prod-new-form"><label className="bh-prod-field"><span>Model / desen adı</span><input required autoFocus value={newJob.modelName} onChange={(event) => setNewJob((current) => ({ ...current, modelName: event.target.value }))} /></label><label className="bh-prod-field"><span>Firma</span><input value={newJob.companyName} onChange={(event) => setNewJob((current) => ({ ...current, companyName: event.target.value }))} /></label><label className="bh-prod-field"><span>Sipariş no</span><input value={newJob.orderNo} onChange={(event) => setNewJob((current) => ({ ...current, orderNo: event.target.value }))} /></label><label className="bh-prod-field"><span>Planlanan boya KG</span><input type="number" min="0" step="0.001" value={newJob.plannedKg} onChange={(event) => setNewJob((current) => ({ ...current, plannedKg: event.target.value }))} /></label><label className="bh-prod-field"><span>Planlanan adet</span><input type="number" min="0" step="1" value={newJob.plannedQuantity} onChange={(event) => setNewJob((current) => ({ ...current, plannedQuantity: event.target.value }))} /></label></div><div className="bh-prod-message warn" style={{ marginTop: 8 }}>Yeni iş SUBAZLI başlarsa çalışma reçetesi otomatik S10 CLEAR, S20 WHITE, Renk 1 ve Renk 2 satırlarıyla açılır.</div><div className="bh-prod-modal-actions"><button type="button" className="bh-prod-btn" disabled={creating} onClick={() => setNewJobOpen(false)}>Vazgeç</button><button className="bh-prod-btn primary" disabled={creating}>{creating ? "İş açılıyor…" : "İmalat İşi Aç"}</button></div></div></form></div> : null}
    </div>
  );
}
