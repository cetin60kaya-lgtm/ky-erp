/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addBoyahaneJobColor,
  compareColorRecipe,
  completeBoyahaneJob,
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
  startBoyahaneJob,
} from "../../../services/boyahaneWorkflowApi";
import AddColorModal from "./AddColorModal";
import ManualBoyahaneJobModal from "./ManualBoyahaneJobModal";
import ModelColorList from "./ModelColorList";
import ModelThumbnail from "./ModelThumbnail";
import ProductSearchInput from "./ProductSearchInput";
import QueueDesignModal from "./QueueDesignModal";
import { formatDate, formatKg, safeArray, statusTone } from "./boyahaneFormat";

const PAINT_TYPES = ["SUBAZLI", "PIGMENT", "ECOPLAST", "SİLİKON", "AŞINDIRMA", "FİKSATÖR", "UV", "DİĞER"];
const LOT_STATUS = new Set(["AVAILABLE", "ACTIVE"]);

function normalized(value) {
  return String(value || "")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9]+/g, "");
}

function isSampleJob(row) {
  return ["SAMPLE", "TRIAL"].includes(
    String(row?.jobType || row?.workflowType || row?.type || "").toUpperCase(),
  );
}

function samePaint(row, type) {
  const key = normalized(type);
  return [row?.dyeType, row?.paintType, ...safeArray(row?.paintTypes)].some(
    (value) => normalized(value) === key,
  );
}

function versionRank(row) {
  return Number(String(row?.version || "").match(/\d+/)?.[0] || 0);
}

function pickRecipe(rows, preferred, paintType) {
  const filtered = safeArray(rows).filter((row) => samePaint(row, paintType));
  return (
    filtered.find((row) => String(row.id) === String(preferred || "")) ||
    filtered.find((row) => String(row.status).toUpperCase() === "ACTIVE") ||
    [...filtered].sort((a, b) => versionRank(b) - versionRank(a))[0] ||
    null
  );
}

function findRegistered(rows, color, paintType, pantone, colorName) {
  const direct = rows.find(
    (row) => String(row.id) === String(color?.registeredColorId || ""),
  );
  if (direct && samePaint(direct, paintType)) return direct;
  const candidates = rows.filter((row) => samePaint(row, paintType));
  const p = normalized(pantone || color?.pantone);
  const c = normalized(colorName || color?.colorName);
  return (
    candidates.find(
      (row) => p && normalized(row.pantone) === p && (!c || normalized(row.colorName) === c),
    ) ||
    candidates.find((row) => p && normalized(row.pantone) === p) ||
    candidates.find((row) => c && normalized(row.colorName) === c) ||
    null
  );
}

function defaultLot(productId, lots) {
  return (
    lots.find(
      (row) =>
        String(row.inventoryId || row.productId) === String(productId) &&
        row.isDefault &&
        LOT_STATUS.has(String(row.status).toUpperCase()),
    ) ||
    lots.find(
      (row) =>
        String(row.inventoryId || row.productId) === String(productId) &&
        LOT_STATUS.has(String(row.status).toUpperCase()),
    ) ||
    null
  );
}

function blankRow(product, index, lots, locked = false) {
  return {
    key: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    productId: product?.id || "",
    productName: product?.productName || "",
    gram: "",
    additions: [""],
    lotId: defaultLot(product?.id, lots)?.id || "",
    locked,
  };
}

function productOrder(row) {
  const explicit = Number(row?.defaultRecipeOrder || row?.recipeOrder || 0);
  if (explicit > 0) return explicit;
  const text = normalized(`${row?.productName || ""} ${row?.tradeName || ""} ${row?.code || ""}`);
  if (text.includes("S10CLEAR") || text === "S10") return 1;
  if (text.includes("S20WHITE") || text.includes("S20BEYAZ") || text === "S20") return 2;
  return 0;
}

function configuredBaseProducts(products, paintType) {
  const matching = products
    .filter((row) => samePaint(row, paintType) && productOrder(row) > 0)
    .sort((a, b) => productOrder(a) - productOrder(b));
  if (matching.length) return matching.slice(0, 2);
  if (normalized(paintType) !== "SUBAZLI") return [];
  const find = (aliases) =>
    products.find((row) => {
      const text = normalized(`${row.productName || ""} ${row.tradeName || ""} ${row.code || ""}`);
      return aliases.some((alias) => text.includes(normalized(alias)));
    });
  return [find(["S10 CLEAR", "S 10 CLEAR", "S10"]), find(["S20 WHITE", "S 20 WHITE", "S20 BEYAZ", "S20"])].filter(Boolean);
}

function withBaseRows(source, products, lots, paintType) {
  const rows = safeArray(source).map((row) => ({ ...row }));
  const defaults = configuredBaseProducts(products, paintType);
  if (!defaults.length) {
    return rows.length
      ? rows.map((row) => ({ ...row, locked: false }))
      : [blankRow(null, 1, lots), blankRow(null, 2, lots), blankRow(null, 3, lots)];
  }
  const fixed = defaults.map((product, index) => {
    const position = rows.findIndex(
      (row) => String(row.productId) === String(product.id),
    );
    const existing = position >= 0 ? rows.splice(position, 1)[0] : blankRow(product, index + 1, lots, true);
    return {
      ...existing,
      productId: product.id,
      productName: product.productName,
      lotId: existing.lotId || defaultLot(product.id, lots)?.id || "",
      locked: true,
    };
  });
  const result = [...fixed, ...rows.map((row) => ({ ...row, locked: false }))];
  if (result.length === fixed.length) result.push(blankRow(null, result.length + 1, lots));
  return result;
}

function recipeRows(recipe, products, lots, paintType) {
  const mapped = safeArray(recipe?.lines).map((line, index) => {
    const productId = line.inventoryId || line.productId || "";
    const product = products.find((row) => String(row.id) === String(productId));
    return {
      key: line.id || `recipe-${index}-${Date.now()}`,
      productId,
      productName: line.productName || product?.productName || "",
      gram: Number(line.trialTotalGr ?? line.totalGr ?? line.referenceGram ?? 0),
      additions: [""],
      lotId: defaultLot(productId, lots)?.id || "",
      locked: false,
    };
  });
  return withBaseRows(mapped, products, lots, paintType);
}

function prepared(job) {
  const rows = safeArray(job?.colors).filter(
    (row) => String(row.status).toUpperCase() !== "CANCELLED",
  );
  return rows.length > 0 && rows.every((row) => String(row.status).toUpperCase() === "COMPLETED");
}

function productionBucket(job) {
  if (String(job.status).toUpperCase() === "COMPLETED") return "completed";
  if (job.enteredProductionAt || job.manufacturingStatus === "ACTIVE") return "active";
  if (prepared(job)) return "manufacturing-waiting";
  return "prepare";
}

function sampleBucket(job) {
  if (String(job.status).toUpperCase() === "COMPLETED") return "approved";
  if (["ACTIVE", "PAUSED"].includes(String(job.status).toUpperCase())) return "ongoing";
  return "waiting";
}

function waitText(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "-";
  const hours = Math.max(0, Math.floor((Date.now() - date.getTime()) / 3_600_000));
  return hours < 24 ? `${hours} saat` : `${Math.floor(hours / 24)} gün`;
}

function ColorWorkspace({
  mode,
  activeMainCompany,
  job,
  color,
  registeredColors,
  products,
  lots,
  productions,
  logs,
  onSaved,
  onNext,
}) {
  const [paintType, setPaintType] = useState("SUBAZLI");
  const [pantone, setPantone] = useState("");
  const [colorName, setColorName] = useState("");
  const [registeredColorId, setRegisteredColorId] = useState("");
  const [recipes, setRecipes] = useState([]);
  const [recipeId, setRecipeId] = useState("");
  const [rows, setRows] = useState([]);
  const [multiplier, setMultiplier] = useState(1);
  const [trialCount, setTrialCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [rf, setRf] = useState({ enabled: false, kg: "", tl: "" });

  const productMap = useMemo(
    () => new Map(products.map((row) => [String(row.id), row])),
    [products],
  );
  const selectedRecipe = recipes.find((row) => String(row.id) === String(recipeId)) || null;
  const registered = registeredColors.find((row) => String(row.id) === String(registeredColorId)) || null;
  const finalGram = (row) =>
    Number(row.gram || 0) +
    (mode === "sample"
      ? safeArray(row.additions).reduce((sum, value) => sum + Number(value || 0), 0)
      : 0);
  const referenceTotal = rows.reduce((sum, row) => sum + finalGram(row), 0);
  const productionTotal = referenceTotal * Number(multiplier || 0);

  function applyRecipe(recipe, type = paintType) {
    const nextType = recipe?.dyeType || recipe?.paintType || type || "SUBAZLI";
    setPaintType(nextType);
    setRecipeId(recipe?.id || "");
    setRows(recipeRows(recipe, products, lots, nextType));
  }

  async function loadRegistered(row, preferred = color?.recipeId, type = paintType) {
    if (!row) {
      setRegisteredColorId("");
      setRecipes([]);
      setRecipeId("");
      setRows(withBaseRows([], products, lots, type));
      return;
    }
    setRegisteredColorId(row.id);
    setPantone(row.pantone || pantone || "");
    setColorName(row.colorName || colorName || "");
    const data = safeArray(await listColorRecipes(activeMainCompany, row.id));
    setRecipes(data);
    const selected = pickRecipe(data, preferred, type);
    if (selected) {
      applyRecipe(selected, type);
      setMessage(`Kayıtlı renk var: ${row.pantone || "-"} · ${row.colorName || "-"} · ${type} · ${selected.version || "V1"}. Reçete çekildi.`);
    } else {
      setRecipeId("");
      setRows(withBaseRows([], products, lots, type));
      setMessage(`Kayıtlı renk var; ${type} için yeni versiyon hazırlanacak.`);
    }
  }

  async function syncRegistered(nextType = paintType, nextPantone = pantone, nextName = colorName) {
    setBusy(true);
    setError("");
    try {
      setPaintType(nextType);
      const match = findRegistered(registeredColors, color, nextType, nextPantone, nextName);
      if (!match) {
        setRegisteredColorId("");
        setRecipes([]);
        setRecipeId("");
        setRows(withBaseRows([], products, lots, nextType));
        setMessage("Kayıtlı renk bulunamadı; yeni reçete hazırlanıyor.");
      } else {
        await loadRegistered(match, color?.recipeId, nextType);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let live = true;
    const draft = color?.sampleDraft || {};
    const type = color?.paintType || draft.paintType || "SUBAZLI";
    const nextPantone = color?.pantone || draft.pantone || "";
    const nextName = color?.colorName || draft.colorName || "";
    setPaintType(type);
    setPantone(nextPantone);
    setColorName(nextName);
    setMultiplier(mode === "sample" ? Number(draft.copies || 1) : 1);
    setTrialCount(Math.max(1, Number(draft.trialCount || 1)));
    setMessage("");
    setError("");
    setRf({ enabled: false, kg: "", tl: "" });

    const draftRows = safeArray(draft.rows).map((row, index) => ({
      ...row,
      key: row.key || `draft-${index}`,
      gram: row.gram ?? row.startGram ?? "",
      additions: safeArray(row.additions).length ? row.additions : [""],
    }));
    if (mode === "sample" && draftRows.length) {
      setRows(withBaseRows(draftRows, products, lots, type));
    }

    const match = findRegistered(registeredColors, color, type, nextPantone, nextName);
    if (!match) {
      setRegisteredColorId("");
      setRecipes([]);
      setRecipeId("");
      if (!(mode === "sample" && draftRows.length)) {
        setRows(withBaseRows([], products, lots, type));
      }
      return () => { live = false; };
    }

    setRegisteredColorId(match.id);
    listColorRecipes(activeMainCompany, match.id)
      .then((data) => {
        if (!live) return;
        const safe = safeArray(data);
        setRecipes(safe);
        const selected = pickRecipe(safe, color?.recipeId, type);
        if (selected && !(mode === "sample" && draftRows.length)) applyRecipe(selected, type);
        if (selected) setMessage(`Kayıtlı renk var: ${match.pantone || "-"} · ${match.colorName || "-"} · ${type} · ${selected.version || "V1"}.`);
      })
      .catch((requestError) => live && setError(requestError.message));
    return () => { live = false; };
  }, [color?.id, activeMainCompany?.slug, products.length, lots.length, registeredColors.length]);

  function updateRow(index, patch) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  }

  function selectProduct(index, productId) {
    const product = productMap.get(String(productId));
    updateRow(index, {
      productId,
      productName: product?.productName || "",
      lotId: defaultLot(productId, lots)?.id || "",
    });
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

  function usableRows() {
    return rows.filter((row) => row.productId || finalGram(row) > 0 || row.lotId);
  }

  function lines() {
    return usableRows().map((row) => ({
      productId: row.productId,
      productName: productMap.get(String(row.productId))?.productName || row.productName,
      referenceGram: finalGram(row),
      lotId: row.lotId,
    }));
  }

  function validate() {
    if (!pantone.trim() || !colorName.trim()) {
      throw new Error("Pantone ve renk adı zorunludur.");
    }
    const used = usableRows();
    if (!used.length || used.some((row) => !row.productId || !row.lotId || finalGram(row) <= 0)) {
      throw new Error("Kullanılan her satırda ürün, sıfırdan büyük gramaj ve lot bulunmalıdır.");
    }
  }

  async function ensureColor() {
    if (registeredColorId) return registeredColorId;
    const created = await createRegisteredColor(activeMainCompany, {
      pantone,
      colorName,
      paintType,
    });
    setRegisteredColorId(created.id);
    await patchBoyahaneJobColor(activeMainCompany, color.id, {
      registeredColorId: created.id,
      paintType,
    });
    return created.id;
  }

  async function saveRfProduct(recipe) {
    if (mode !== "production" || !rf.enabled) return null;
    const kg = Number(rf.kg || 0);
    if (kg <= 0) throw new Error("RF ürün kaydı için kalan kilogramı girin.");
    const now = new Date();
    const stamp = `${String(now.getDate()).padStart(2, "0")}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getFullYear()).slice(-2)}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
    const product = await createBoyahaneProduct(activeMainCompany, {
      productName: `RF - ${job.modelName} - ${colorName} - ${stamp}`,
      tradeName: `${pantone} · ${paintType} · ${recipe?.version || "V1"}`,
      code: `RF-${normalized(job.modelName).slice(0, 10)}-${stamp}`,
      supplierName: "HAKAN BASKI BOYAHANE",
      dyeType: "RF BOYA",
      unit: "KG",
      currentPrice: Number(rf.tl || 0) > 0 ? Number(rf.tl) / kg : 0,
      currency: "TRY",
      approvalStatus: "APPROVED",
      source: "RF_PREPARED",
      note: `${job.modelName} / ${colorName} / ${pantone}. Bileşen lotları ilk hazırlama kaydına bağlıdır.`,
    });
    const lot = await createBoyahaneWorkflowLot(activeMainCompany, {
      inventoryId: product.id,
      productId: product.id,
      lotNo: `RF-${stamp}`,
      entryKg: kg,
      quantity: kg,
      supplierName: "HAKAN BASKI BOYAHANE",
      isDefault: true,
      source: "RF_PREPARED",
      status: "AVAILABLE",
    });
    return { product, lot };
  }

  async function saveDraft() {
    setBusy(true);
    setError("");
    try {
      await patchBoyahaneJobColor(activeMainCompany, color.id, {
        status: "DRAFT",
        jobType: mode === "sample" ? "SAMPLE" : "PRODUCTION",
        paintType,
        pantone,
        colorName,
        registeredColorId: registeredColorId || undefined,
        recipeId: recipeId || undefined,
        ...(mode === "sample"
          ? {
              sampleDraft: {
                rows,
                trialCount,
                copies: Number(multiplier || 1),
                paintType,
                pantone,
                colorName,
                registeredColorId,
              },
            }
          : {}),
      });
      setMessage("Taslak kaydedildi; stok düşmedi.");
      await onSaved?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveFinal() {
    if (
      mode === "sample" &&
      !window.confirm("Numune fiziksel olarak hazırlandı ve onaylandı mı? Gerçek lot sarfları oluşacaktır.")
    ) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      validate();
      const colorId = await ensureColor();
      let recipe;
      if (mode === "sample") {
        recipe = await createColorRecipeVersion(activeMainCompany, colorId, {
          paintType,
          jobId: job.id,
          jobColorId: color.id,
          lines: lines(),
        });
      } else {
        const compared = await compareColorRecipe(activeMainCompany, colorId, {
          paintType,
          lines: lines(),
        });
        recipe = compared?.exactMatch
          ? compared.recipe
          : await createColorRecipeVersion(activeMainCompany, colorId, {
              paintType,
              jobId: job.id,
              jobColorId: color.id,
              lines: lines(),
            });
      }
      const response = await createBoyahaneProduction(activeMainCompany, {
        requestId: globalThis.crypto?.randomUUID?.() || `${mode}-${Date.now()}`,
        jobId: job.id,
        jobColorId: color.id,
        colorId,
        recipeId: recipe.id,
        pantone,
        colorName,
        paintType,
        version: recipe.version,
        multiplier: Number(multiplier || 1),
        jobType: mode === "sample" ? "SAMPLE" : "PRODUCTION",
        companyName: job.companyName,
        orderNo: job.orderNo,
        lines: lines(),
      });
      const rfRow = await saveRfProduct(recipe);
      await patchBoyahaneJobColor(activeMainCompany, color.id, {
        status: "COMPLETED",
        registeredColorId: colorId,
        recipeId: recipe.id,
        paintType,
        ...(mode === "sample"
          ? {
              sampleApprovedAt: new Date().toISOString(),
              sampleDraft: {
                rows,
                trialCount,
                copies: Number(multiplier || 1),
                paintType,
                pantone,
                colorName,
                registeredColorId: colorId,
              },
            }
          : {}),
      });
      setMessage(
        rfRow
          ? `Renk hazırlandı; ${rfRow.product.productName} ürün ve lot olarak kaydedildi.`
          : `${recipe.version} kaydedildi ve lot sarfları işlendi.`,
      );
      await onSaved?.(response?.nextColorId);
      onNext?.();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  if (!color) return <div className="bh-empty compact">Çalışmak için model rengini seçin.</div>;

  const defaultProducts = configuredBaseProducts(products, paintType);
  const colorHistory = productions.filter(
    (row) => row.colorId === registeredColorId || row.pantoneSnapshot === pantone,
  );
  const colorLogs = logs.filter(
    (row) => row.entityId === color.id || row.entityId === job.id,
  );

  return (
    <section className={`bh-card bh-recipe-workspace bh-workspace-v3 ${mode}`}>
      <div className="bh-card-head bh-card-head-with-image">
        <ModelThumbnail src={job.imageUrl} alt={job.modelName} />
        <div><h2>{job.modelName} · {color.colorName}</h2><small>{color.pantone || "Pantone yok"} / {color.paintType || "Boya türü yok"}</small></div>
        <span className={`bh-status ${statusTone(color.status)}`}>{color.status}</span>
      </div>
      <div className="bh-card-body">
        {error ? <div className="bh-notice danger">{error}</div> : null}
        {message ? <div className="bh-notice success">{message}</div> : null}

        <div className={`bh-registered-recipe-state ${registered ? "found" : "missing"}`}>
          <div>
            <strong>{registered ? "Kayıtlı renk var" : "Kayıtlı renk bulunamadı"}</strong>
            <span>{registered ? `${registered.pantone || pantone} · ${registered.colorName || colorName} · ${paintType} · ${selectedRecipe?.version || "Yeni versiyon"}` : `${pantone || "-"} · ${colorName || "-"} · ${paintType}`}</span>
          </div>
          <button type="button" className="bh-btn mini" onClick={() => syncRegistered()} disabled={busy}>Reçeteyi Tekrar Çek</button>
        </div>

        <div className="bh-form-grid five bh-recipe-meta-grid">
          <label className="bh-field wide"><span>Kayıtlı Renk</span><select value={registeredColorId} onChange={(event) => loadRegistered(registeredColors.find((row) => String(row.id) === String(event.target.value)), color?.recipeId, paintType)}><option value="">Yeni renk</option>{registeredColors.filter((row) => samePaint(row, paintType)).map((row) => <option key={row.id} value={row.id}>{row.pantone || "-"} / {row.colorName || "-"} · {paintType}</option>)}</select></label>
          <label className="bh-field"><span>Boya Türü</span><select value={paintType} onChange={(event) => syncRegistered(event.target.value, pantone, colorName)}>{PAINT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="bh-field"><span>Versiyon</span><select value={recipeId} onChange={(event) => { const recipe = recipes.find((row) => String(row.id) === String(event.target.value)); if (recipe) applyRecipe(recipe); else { setRecipeId(""); setRows(withBaseRows([], products, lots, paintType)); } }}><option value="">Yeni reçete</option>{recipes.filter((row) => samePaint(row, paintType)).map((row) => <option key={row.id} value={row.id}>{row.version} / {row.status}</option>)}</select></label>
          <label className="bh-field"><span>Renk Adı</span><input value={colorName} onChange={(event) => setColorName(event.target.value)} onBlur={() => syncRegistered(paintType, pantone, colorName)} /></label>
          <label className="bh-field"><span>Pantone</span><input value={pantone} onChange={(event) => setPantone(event.target.value)} onBlur={() => syncRegistered(paintType, pantone, colorName)} /></label>
          <label className="bh-field"><span>{mode === "sample" ? "Kat sayısı" : "Çarpan"}</span><input type="number" min="0.0001" step={mode === "sample" ? "1" : "0.0001"} value={multiplier} onChange={(event) => setMultiplier(event.target.value)} /></label>
          <label className="bh-field"><span>Referans toplam</span><input readOnly value={`${referenceTotal.toFixed(2)} GR`} /></label>
          <label className="bh-field"><span>{mode === "sample" ? "Numune toplamı" : "İmalat toplamı"}</span><input readOnly value={`${productionTotal.toFixed(2)} GR`} /></label>
        </div>

        {defaultProducts.length ? (
          <div className="bh-default-products-note">
            <strong>{paintType} varsayılan ürünleri:</strong>
            {defaultProducts.map((row, index) => <span key={row.id}>{index + 1}. {row.productName}</span>)}
            <small>Sıra, Stok, Lot ve Ürünler ekranından değiştirilir.</small>
          </div>
        ) : null}

        <div className="bh-table-wrap recipe">
          <table>
            <thead><tr><th>Sıra</th><th>Ürün / Hızlı Arama</th><th>{mode === "sample" ? "Başlangıç GR" : "Referans GR"}</th>{mode === "sample" ? Array.from({ length: trialCount }, (_, index) => <th key={index}>Deneme {index + 1} Eklendi</th>) : <><th>Yüzde</th><th>İmalat GR</th></>}<th>Son Toplam</th><th>Lot</th><th>Kalan KG</th><th>İşlem</th></tr></thead>
            <tbody>
              {rows.map((row, index) => {
                const rowLots = lots.filter(
                  (lot) =>
                    String(lot.inventoryId || lot.productId) === String(row.productId) &&
                    LOT_STATUS.has(String(lot.status).toUpperCase()),
                );
                const selectedLot = rowLots.find((lot) => String(lot.id) === String(row.lotId));
                return (
                  <tr key={row.key} className={row.locked ? "bh-fixed-product-row" : ""}>
                    <td>{index + 1}</td>
                    <td><ProductSearchInput products={products} value={row.productId} disabled={row.locked} allowUnapproved={mode === "sample"} placeholder="KNG, 20, ürün kodu veya ad" onChange={(value) => selectProduct(index, value)} />{row.locked ? <small className="bh-fixed-note">{paintType} sabit {index + 1}. ürün</small> : null}</td>
                    <td><input type="number" min="0" step="0.01" value={row.gram} onChange={(event) => updateRow(index, { gram: event.target.value })} /></td>
                    {mode === "sample" ? Array.from({ length: trialCount }, (_, trialIndex) => <td key={trialIndex}><input type="number" min="0" step="0.01" value={row.additions?.[trialIndex] || ""} onChange={(event) => updateAddition(index, trialIndex, event.target.value)} /></td>) : <><td>{referenceTotal ? ((Number(row.gram || 0) / referenceTotal) * 100).toFixed(2) : "0.00"}%</td><td>{(Number(row.gram || 0) * Number(multiplier || 0)).toFixed(2)}</td></>}
                    <td><strong>{finalGram(row).toFixed(2)} g</strong></td>
                    <td><select value={row.lotId} onChange={(event) => updateRow(index, { lotId: event.target.value })}><option value="">Lot seç</option>{rowLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.lotNo}{lot.isDefault ? " · Varsayılan" : ""}</option>)}</select></td>
                    <td>{Number(selectedLot?.remainingKg || 0).toFixed(3)}</td>
                    <td><button type="button" className="bh-btn mini danger" disabled={row.locked} onClick={() => setRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}>{row.locked ? "Sabit" : "Sil"}</button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><th colSpan={mode === "sample" ? 3 + trialCount : 5}>Toplam</th><th>{productionTotal.toFixed(2)} GR</th><th colSpan="3">{formatKg(productionTotal / 1000)}</th></tr></tfoot>
          </table>
        </div>

        {mode === "sample" ? (
          <div className="bh-work-actions">
            <button type="button" className="bh-btn" onClick={() => { setTrialCount((value) => value + 1); setRows((current) => current.map((row) => ({ ...row, additions: [...safeArray(row.additions), ""] }))); }}>+ Deneme Sütunu</button>
            <button type="button" className="bh-btn" disabled={trialCount <= 1} onClick={() => { setTrialCount((value) => value - 1); setRows((current) => current.map((row) => ({ ...row, additions: safeArray(row.additions).slice(0, -1) }))); }}>Son Denemeyi Çıkar</button>
          </div>
        ) : null}

        {mode === "production" ? (
          <div className="bh-rf-save-inline">
            <label className="bh-check-field"><input type="checkbox" checked={rf.enabled} onChange={(event) => setRf((current) => ({ ...current, enabled: event.target.checked }))} /><span>Hazırlanan boyanın kalanını RF ürün olarak kaydet</span></label>
            {rf.enabled ? <><label className="bh-field"><span>RF kalan KG</span><input type="number" min="0.001" step="0.001" value={rf.kg} onChange={(event) => setRf((current) => ({ ...current, kg: event.target.value }))} /></label><label className="bh-field"><span>Toplam TL değeri</span><input type="number" min="0" step="0.01" value={rf.tl} onChange={(event) => setRf((current) => ({ ...current, tl: event.target.value }))} /></label><small>RF, ayrı panel açmadan normal ürün ve lot olarak kaydolur.</small></> : null}
          </div>
        ) : null}

        <div className="bh-work-actions">
          <button type="button" className="bh-btn" disabled={busy} onClick={saveDraft}>Taslak Kaydet</button>
          <button type="button" className="bh-btn" onClick={() => setRows((current) => [...current, blankRow(null, current.length + 1, lots)])}>+ Ürün Satırı</button>
          <button type="button" className="bh-btn primary" disabled={busy || color.status === "COMPLETED"} onClick={saveFinal}>{mode === "sample" ? "Numuneyi Onayla ve Versiyon Oluştur" : "Rengi Hazırla ve Kaydet"}</button>
          <button type="button" className="bh-btn" onClick={onNext}>Sıradaki Renk</button>
        </div>

        <details className="bh-work-history">
          <summary>Geçmiş Kullanımlar, Lotlar ve İşlem Logları</summary>
          <div className="bh-history-grid">
            <section><h3>Renk geçmişi</h3>{colorHistory.slice(0, 12).map((row) => <p key={row.id}>{formatDate(row.createdAt)} · {row.modelSnapshot || row.modelName || "-"} · {row.versionSnapshot || row.version || "-"} · {formatKg(row.productionTotalKg || row.totalPreparedKg)}</p>)}</section>
            <section><h3>İşlem logları</h3>{colorLogs.slice(0, 12).map((row) => <p key={row.id}>{formatDate(row.createdAt)} · {row.actor || "KY ERP"} · {row.description || row.actionType}</p>)}</section>
          </div>
        </details>
      </div>
    </section>
  );
}

export default function BoyahaneWorkPageV3({
  mode = "production",
  activeMainCompany,
  moduleActionContext,
}) {
  const sampleMode = mode === "sample";
  const tabs = sampleMode
    ? [["waiting", "Numune Bekleyenler"], ["ongoing", "Devam Edenler"], ["approved", "Onaylananlar"]]
    : [["prepare", "Boyası Hazırlanacaklar"], ["manufacturing-waiting", "İmalat Bekleyenler"], ["active", "Aktif İmalatlar"], ["completed", "Tamamlananlar"]];

  const [jobs, setJobs] = useState([]);
  const [registeredColors, setRegisteredColors] = useState([]);
  const [products, setProducts] = useState([]);
  const [lots, setLots] = useState([]);
  const [productions, setProductions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedColorId, setSelectedColorId] = useState("");
  const [tab, setTab] = useState(sampleMode ? "waiting" : "prepare");
  const [addColorOpen, setAddColorOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (keepSelection = true) => {
    if (!activeMainCompany?.slug) return;
    setLoading(true);
    setError("");
    try {
      const [jobRows, colorRows, productRows, lotRows, productionRows, logRows] = await Promise.all([
        listBoyahaneJobs(activeMainCompany),
        listRegisteredColors(activeMainCompany),
        listBoyahaneProducts(activeMainCompany),
        listBoyahaneLots(activeMainCompany),
        listBoyahaneProductions(activeMainCompany),
        listBoyahaneLogs(activeMainCompany),
      ]);
      const filtered = safeArray(jobRows).filter((row) =>
        sampleMode ? isSampleJob(row) : !isSampleJob(row),
      );
      setJobs(filtered);
      setRegisteredColors(safeArray(colorRows));
      setProducts(safeArray(productRows));
      setLots(safeArray(lotRows));
      setProductions(safeArray(productionRows));
      setLogs(safeArray(logRows));
      const requested = moduleActionContext?.boyahaneJobId;
      const nextId = requested && filtered.some((row) => row.id === requested)
        ? requested
        : keepSelection && filtered.some((row) => row.id === selectedJobId)
          ? selectedJobId
          : "";
      setSelectedJobId(nextId);
      const job = filtered.find((row) => row.id === nextId);
      setSelectedColorId((current) =>
        safeArray(job?.colors).some((row) => row.id === current)
          ? current
          : safeArray(job?.colors)[0]?.id || "",
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany?.slug, moduleActionContext?.nonce, selectedJobId, sampleMode]);

  useEffect(() => { load(false); }, [activeMainCompany?.slug, moduleActionContext?.nonce, sampleMode]);

  const selectedJob = jobs.find((row) => row.id === selectedJobId) || null;
  const selectedColor = safeArray(selectedJob?.colors).find((row) => row.id === selectedColorId) || null;
  const bucket = sampleMode ? sampleBucket : productionBucket;
  const visibleJobs = jobs.filter((row) => bucket(row) === tab);

  function openJob(job) {
    setSelectedJobId(job.id);
    setSelectedColorId(
      safeArray(job.colors).find(
        (row) => !["COMPLETED", "CANCELLED"].includes(String(row.status).toUpperCase()),
      )?.id || safeArray(job.colors)[0]?.id || "",
    );
    window.requestAnimationFrame(() =>
      document.querySelector(".bh-operation-workspace")?.scrollIntoView({ block: "start" }),
    );
  }

  async function refreshSelected(nextColorId) {
    if (!selectedJobId) return load();
    const [jobRow, productRows, lotRows, productionRows, logRows] = await Promise.all([
      getBoyahaneJob(activeMainCompany, selectedJobId),
      listBoyahaneProducts(activeMainCompany),
      listBoyahaneLots(activeMainCompany),
      listBoyahaneProductions(activeMainCompany),
      listBoyahaneLogs(activeMainCompany),
    ]);
    setJobs((current) => current.map((row) => (row.id === jobRow.id ? jobRow : row)));
    setProducts(safeArray(productRows));
    setLots(safeArray(lotRows));
    setProductions(safeArray(productionRows));
    setLogs(safeArray(logRows));
    setSelectedColorId(
      nextColorId ||
        safeArray(jobRow.colors).find((row) => row.id === selectedColorId)?.id ||
        safeArray(jobRow.colors)[0]?.id ||
        "",
    );
  }

  async function startJob(job) {
    setBusy(true);
    try {
      await startBoyahaneJob(activeMainCompany, job.id, true);
      await load();
      openJob({ ...job, status: "ACTIVE" });
      if (sampleMode) setTab("ongoing");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function addColor(form) {
    setBusy(true);
    try {
      const row = await addBoyahaneJobColor(activeMainCompany, selectedJob.id, {
        ...form,
        jobType: sampleMode ? "SAMPLE" : "PRODUCTION",
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
    if (!selectedColor || !window.confirm(`${selectedColor.colorName || "Renk"} silinmeyecek; iptal durumuna alınsın mı?`)) return;
    setBusy(true);
    try {
      await patchBoyahaneJobColor(activeMainCompany, selectedColor.id, {
        status: "CANCELLED",
        cancelledAt: new Date().toISOString(),
        cancelReason: "Kullanıcı tarafından işten çıkarıldı",
      });
      await refreshSelected();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function enterManufacturing() {
    if (!selectedJob || !window.confirm(`${selectedJob.modelName} imalata girdi olarak işaretlensin mi? Kilogram tekrar sorulmayacaktır.`)) return;
    setBusy(true);
    try {
      await patchBoyahaneJob(activeMainCompany, selectedJob.id, {
        enteredProductionAt: new Date().toISOString(),
        manufacturingStatus: "ACTIVE",
      });
      await load();
      setTab("active");
      setSelectedJobId("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function finishJob() {
    if (!selectedJob || !window.confirm(`${selectedJob.modelName} işi kapatılsın mı?`)) return;
    setBusy(true);
    try {
      await completeBoyahaneJob(activeMainCompany, selectedJob.id);
      setSelectedJobId("");
      await load(false);
      setTab(sampleMode ? "approved" : "completed");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function nextColor() {
    const colors = safeArray(selectedJob?.colors);
    const index = colors.findIndex((row) => row.id === selectedColorId);
    const next = [...colors.slice(index + 1), ...colors.slice(0, index + 1)].find(
      (row) => !["COMPLETED", "CANCELLED"].includes(String(row.status).toUpperCase()),
    );
    if (next) setSelectedColorId(next.id);
  }

  async function manualCreated(created) {
    setManualOpen(false);
    setJobs((current) => [created, ...current.filter((row) => row.id !== created.id)]);
    setTab(sampleMode ? "waiting" : "prepare");
    setSelectedJobId(created.id);
    setSelectedColorId(safeArray(created.colors)[0]?.id || "");
    await load(true);
  }

  return (
    <div className={`bh-operation-page bh-work-page-v3 ${mode}`}>
      <section className="bh-operation-intro bh-work-intro-v3">
        <div><small>{sampleMode ? "NUMUNE MERKEZİ" : "İMALAT BOYALARI"}</small><h2>{sampleMode ? "Numune Çalışmaları" : "İmalat Boyaları"}</h2><p>{sampleMode ? "Kayıtlı reçete otomatik çekilir; denemelerde yalnız ekleme yapılır." : "Kayıtlı reçete otomatik çekilir; varsayılan ürün sırası Ürünler ekranından yönetilir."}</p></div>
        <div className="bh-head-actions">
          <button type="button" className="bh-btn" onClick={() => setManualOpen(true)}>+ Yeni Desen Aç</button>
          <button type="button" className="bh-btn primary" onClick={() => setQueueOpen(true)}>+ Desenden {sampleMode ? "Numune" : "İmalat"} İşi Aç</button>
        </div>
      </section>

      <nav className="bh-operation-tabs">
        {tabs.map(([key, label]) => (
          <button type="button" key={key} className={tab === key ? "active" : ""} onClick={() => { setTab(key); setSelectedJobId(""); }}>
            {label}<b>{jobs.filter((row) => bucket(row) === key).length}</b>
          </button>
        ))}
      </nav>

      {error ? <div className="bh-notice danger">{error}</div> : null}
      {loading ? <div className="bh-empty compact">İşler yükleniyor…</div> : null}

      <div className="bh-operation-card-grid bh-operation-card-grid-v3">
        {visibleJobs.map((job) => (
          <article className="bh-operation-card" key={job.id}>
            <button type="button" className="bh-model-image-button" onClick={() => openJob(job)}><ModelThumbnail src={job.imageUrl} alt={job.modelName} size="large" /></button>
            <div><span className={`bh-status ${statusTone(job.status)}`}>{job.status}</span><h3>{job.modelName}</h3><p>{job.companyName || "-"} · {job.orderNo || "-"}</p><dl><div><dt>Toplam renk</dt><dd>{safeArray(job.colors).filter((row) => row.status !== "CANCELLED").length}</dd></div><div><dt>{sampleMode ? "Onaylanan" : "Hazır"}</dt><dd>{job.preparedColorCount || 0}</dd></div><div><dt>Bekleyen</dt><dd>{job.pendingColorCount || 0}</dd></div><div><dt>Bekleme</dt><dd>{waitText(job.createdAt)}</dd></div></dl><div className="bh-row-actions"><button type="button" className="bh-btn primary" onClick={() => openJob(job)}>İşi Aç</button>{String(job.status).toUpperCase() === "WAITING" ? <button type="button" className="bh-btn" disabled={busy} onClick={() => startJob(job)}>Çalışmaya Başla</button> : null}</div></div>
          </article>
        ))}
      </div>
      {!visibleJobs.length && !loading ? <div className="bh-empty compact">Bu bölümde iş bulunmuyor.</div> : null}

      {selectedJob ? (
        <section className="bh-operation-workspace">
          <header className="bh-operation-model-head">
            <ModelThumbnail src={selectedJob.imageUrl} alt={selectedJob.modelName} size="large" />
            <div><small>{sampleMode ? "NUMUNE ÇALIŞMA EKRANI" : "İMALAT BOYASI ÇALIŞMA EKRANI"}</small><h2>{selectedJob.modelName}</h2><p>{selectedJob.companyName || "-"} · {selectedJob.orderNo || "-"}</p><div className="bh-summary-facts"><span>Toplam <b>{safeArray(selectedJob.colors).filter((row) => row.status !== "CANCELLED").length}</b></span><span>Hazır <b>{selectedJob.preparedColorCount || 0}</b></span><span>Eksik <b>{selectedJob.pendingColorCount || 0}</b></span><span>Kanal <b>{selectedJob.channelCount || 0}</b></span></div></div>
            <div className="bh-head-actions"><button type="button" className="bh-btn" onClick={() => setSelectedJobId("")}>Listeye Dön</button>{!sampleMode && prepared(selectedJob) && !selectedJob.enteredProductionAt && productionBucket(selectedJob) !== "completed" ? <button type="button" className="bh-btn primary" onClick={enterManufacturing}>İmalata Girdi</button> : null}<button type="button" className="bh-btn primary" disabled={busy} onClick={finishJob}>{sampleMode ? "Numune İşini Kapat" : "Modeli Tamamla"}</button></div>
          </header>

          {!sampleMode && productionBucket(selectedJob) === "completed" ? (
            <section className="bh-card"><div className="bh-card-head"><h2>İşlem Geçmişi</h2></div><div className="bh-card-body bh-activity-list">{logs.filter((row) => row.entityId === selectedJob.id || safeArray(selectedJob.colors).some((color) => color.id === row.entityId)).map((row) => <article key={row.id}><time>{formatDate(row.createdAt)}</time><div><strong>{row.actor || "KY ERP"}</strong><p>{row.description || row.actionType}</p></div></article>)}</div></section>
          ) : (
            <div className="bh-work-grid">
              <ModelColorList colors={safeArray(selectedJob.colors)} selectedId={selectedColorId} onSelect={setSelectedColorId} onAdd={() => setAddColorOpen(true)} onDelete={cancelColor} />
              <ColorWorkspace mode={mode} activeMainCompany={activeMainCompany} job={selectedJob} color={selectedColor} registeredColors={registeredColors} products={sampleMode ? products : products.filter((row) => row.approvalStatus === "APPROVED")} lots={lots} productions={productions} logs={logs} onSaved={refreshSelected} onNext={nextColor} />
            </div>
          )}
        </section>
      ) : null}

      {addColorOpen ? <AddColorModal colors={registeredColors} job={selectedJob} busy={busy} onCancel={() => setAddColorOpen(false)} onSave={addColor} /> : null}
      {queueOpen ? <QueueDesignModal activeMainCompany={activeMainCompany} jobMode={sampleMode ? "sample" : "production"} queuedModelIds={jobs.map((row) => row.designId || row.modelCardId)} onClose={() => setQueueOpen(false)} onQueued={async (close) => { await load(false); if (close) setQueueOpen(false); }} /> : null}
      {manualOpen ? <ManualBoyahaneJobModal activeMainCompany={activeMainCompany} mode={mode} onClose={() => setManualOpen(false)} onCreated={manualCreated} /> : null}
    </div>
  );
}
