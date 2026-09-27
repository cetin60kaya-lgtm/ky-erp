/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from "react";
import {
  createColorRecipeVersion,
  getRegisteredColor,
  listBoyahaneProducts,
  listRegisteredColors,
} from "../../../services/boyahaneWorkflowApi";
import {
  updateRegisteredColorFormula,
  updateRegisteredColorIdentity,
} from "../../../services/boyahaneColorIdentityApi";
import {
  RECIPE_STATUS,
  formatDate,
  formatKg,
  safeArray,
  statusTone,
} from "./boyahaneFormat";
import ModelThumbnail from "./ModelThumbnail";

const SOURCE_LABELS = {
  PANTONE: "Pantoneye göre",
  REFERENCE: "Renk referansına göre",
  VISUAL: "Görsel / RGB’ye göre",
};
const SOURCE_SHORT = {
  PANTONE: "PANTONE",
  REFERENCE: "REFERANS",
  VISUAL: "RGB / HEX",
};
const COLOR_FAMILIES = ["KIRMIZI", "SARI", "MAVİ", "YEŞİL", "TURUNCU", "MOR", "PEMBE", "TURKUAZ", "BEYAZ", "SİYAH", "GRİ", "DİĞER"];
const DEFAULT_PAINT_TYPES = ["SUBAZLI", "ECO YÜKSEK", "SB KABARAN"];
const DETAIL_TABS = [
  ["overview", "Genel"],
  ["formula", "Bileşen Formülü"],
  ["recipe", "Onaylı Reçete"],
  ["history", "Geçmiş"],
  ["usage", "Kullanım"],
];

function sourceTypeOf(row) {
  return row?.sourceType || row?.colorSource || (row?.pantone ? "PANTONE" : "VISUAL");
}

function displayCode(row) {
  const sourceType = sourceTypeOf(row);
  if (sourceType === "REFERENCE") return row.referenceCode || row.referenceName || row.basePantone || row.pantone || "REFERANS";
  if (sourceType === "VISUAL") return row.colorHex || row.colorName || "RGB";
  return row.pantone || "Pantone yok";
}

function catalogFormulaOf(row) {
  const formula = row?.catalogFormula;
  return formula && safeArray(formula.lines).length ? formula : null;
}

function gramText(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(number < 10 ? 2 : 1).replace(/\.0+$/, "");
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function productNameOf(product) {
  return product?.productName || product?.tradeName || product?.name || product?.code || "";
}

function productLabel(product) {
  const name = productNameOf(product) || "Adsız ürün";
  const code = product?.code ? ` · ${product.code}` : "";
  const dye = product?.dyeType ? ` · ${product.dyeType}` : "";
  return `${name}${code}${dye}`;
}

function lineId(index) {
  return `formula-line-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
}

function editDraft(row) {
  return {
    sourceType: sourceTypeOf(row),
    colorName: row.colorName || "",
    pantone: row.pantone || row.basePantone || "",
    basePantone: row.basePantone || row.pantone || "",
    referenceName: row.referenceName || "",
    referenceCode: row.referenceCode || row.customerColorCode || "",
    referenceNote: row.referenceNote || "",
    referenceImageUrl: row.referenceImageUrl || "",
    colorHex: row.colorHex || "#cbd5e1",
    colorFamily: row.colorFamily || "DİĞER",
  };
}

function formulaVersionNumber(formula) {
  const match = String(formula?.version || "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function formulaDraftOf(row, products = []) {
  const formula = catalogFormulaOf(row);
  const sourceLines = safeArray(formula?.lines);
  const normalizedProducts = products.map((product) => ({
    product,
    normalizedName: normalizeText(productNameOf(product)),
  }));
  return {
    paintType: row?.dyeType || row?.paintType || formula?.paintType || "SUBAZLI",
    note: formula?.note || "",
    lines: sourceLines.map((line, index) => {
      const currentId = line.productId || line.inventoryId || "";
      const match = currentId
        ? products.find((product) => String(product.id) === String(currentId))
        : normalizedProducts.find((item) => item.normalizedName && item.normalizedName === normalizeText(line.productName))?.product;
      return {
        id: line.id || lineId(index),
        productId: currentId || match?.id || "",
        inventoryId: currentId || match?.id || "",
        productName: line.productName || productNameOf(match) || "",
        referenceGram: Number(line.referenceGram || 0),
      };
    }),
  };
}

function formulaTotals(draft) {
  const lines = safeArray(draft?.lines);
  const totalGr = lines.reduce((sum, line) => sum + Math.max(0, Number(line.referenceGram || 0)), 0);
  const mappedCount = lines.filter((line) => line.productId).length;
  return { totalGr, mappedCount, lineCount: lines.length };
}

function statusLabel(value) {
  return value === "PASSIVE" ? "PASİF" : "AKTİF";
}

export default function KayitliRenklerWorkspace({
  activeMainCompany,
  openModule,
  moduleActionContext,
}) {
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [paintType, setPaintType] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [colorFamily, setColorFamily] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [products, setProducts] = useState([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [formulaEditing, setFormulaEditing] = useState(false);
  const [formulaDraft, setFormulaDraft] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const safe = safeArray(await listRegisteredColors(activeMainCompany));
      setRows(safe);
      const requested = moduleActionContext?.registeredColorId;
      if (requested) {
        const detail = await getRegisteredColor(activeMainCompany, requested);
        setSelected(detail);
        setDraft(editDraft(detail));
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [activeMainCompany?.slug, moduleActionContext?.nonce]);

  const cards = useMemo(
    () => rows.flatMap((row) => {
      const types = safeArray(row.paintTypes).length
        ? safeArray(row.paintTypes)
        : [row.dyeType || row.paintType || "GENEL"];
      return types.map((type) => ({ ...row, cardPaintType: type }));
    }),
    [rows],
  );
  const paintTypes = useMemo(
    () => [...new Set([...DEFAULT_PAINT_TYPES, ...cards.map((row) => row.cardPaintType).filter(Boolean)])]
      .sort((a, b) => a.localeCompare(b, "tr-TR")),
    [cards],
  );
  const families = useMemo(
    () => [...new Set([...COLOR_FAMILIES, ...cards.map((row) => row.colorFamily).filter(Boolean)])],
    [cards],
  );

  const filtered = cards.filter((row) => {
    const text = [
      row.pantone,
      row.basePantone,
      row.colorName,
      row.customerColorCode,
      row.referenceName,
      row.referenceCode,
      row.referenceNote,
      row.colorHex,
      row.colorFamily,
      row.sourceLabel,
      row.cardPaintType,
      ...safeArray(row.catalogFormula?.lines).map((line) => line.productName),
    ].join(" ").toLocaleLowerCase("tr-TR");
    return (
      (!query || text.includes(query.toLocaleLowerCase("tr-TR"))) &&
      (!paintType || row.cardPaintType === paintType) &&
      (!sourceType || sourceTypeOf(row) === sourceType) &&
      (!colorFamily || row.colorFamily === colorFamily) &&
      (!status || row.status === status)
    );
  });

  async function open(row) {
    setError("");
    setMessage("");
    setEditing(false);
    setFormulaEditing(false);
    setDetailTab("overview");
    try {
      const detail = await getRegisteredColor(activeMainCompany, row.id);
      setSelected({ ...detail, cardPaintType: row.cardPaintType });
      setDraft(editDraft(detail));
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function refreshSelected(id = selected?.id) {
    if (!id) return null;
    const detail = await getRegisteredColor(activeMainCompany, id);
    const next = { ...detail, cardPaintType: selected?.cardPaintType || detail.dyeType || detail.paintType };
    setSelected(next);
    setDraft(editDraft(next));
    await load();
    return next;
  }

  async function saveIdentity() {
    if (!selected?.id || !draft) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await updateRegisteredColorIdentity(activeMainCompany, selected.id, {
        ...draft,
        basePantone: draft.sourceType === "REFERENCE" ? draft.pantone : "",
        pantone: draft.sourceType === "VISUAL" ? "" : draft.pantone,
        isPantoneExact: draft.sourceType === "PANTONE",
      });
      await refreshSelected(saved.id);
      setEditing(false);
      setMessage("Renk kimliği güncellendi; reçete ve kullanım geçmişi korundu.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function ensureProducts() {
    if (productsLoaded) return products;
    const safe = safeArray(await listBoyahaneProducts(activeMainCompany));
      const approved = safe
        .filter((product) => product.approvalStatus === "APPROVED" || product.isApproved === true)
        .filter((product) => product.isActive !== false && product.active !== false)
        .sort((a, b) => productNameOf(a).localeCompare(productNameOf(b), "tr-TR"));
    setProducts(approved);
    setProductsLoaded(true);
    return approved;
  }

  async function startFormulaEdit() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const loadedProducts = await ensureProducts();
      setFormulaDraft(formulaDraftOf(selected, loadedProducts));
      setFormulaEditing(true);
      setDetailTab("formula");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  function updateFormulaLine(id, patch) {
    setFormulaDraft((current) => ({
      ...current,
      lines: safeArray(current?.lines).map((line) => line.id === id ? { ...line, ...patch } : line),
    }));
  }

  function chooseProduct(lineIdValue, productId) {
    const product = products.find((item) => String(item.id) === String(productId));
    updateFormulaLine(lineIdValue, {
      productId: product?.id || "",
      inventoryId: product?.id || "",
      productName: product ? productNameOf(product) : "",
    });
  }

  function addFormulaLine(productName = "") {
    const exact = products.find((product) => normalizeText(productNameOf(product)) === normalizeText(productName));
    setFormulaDraft((current) => ({
      ...current,
      lines: [
        ...safeArray(current?.lines),
        {
          id: lineId(safeArray(current?.lines).length),
          productId: exact?.id || "",
          inventoryId: exact?.id || "",
          productName: productName || productNameOf(exact) || "",
          referenceGram: 0,
        },
      ],
    }));
  }

  function addStarterLines() {
    const existingNames = new Set(safeArray(formulaDraft?.lines).map((line) => normalizeText(line.productName)));
    ["S10 CLEAR", "S20 WHITE"].forEach((name) => {
      if (!existingNames.has(normalizeText(name))) addFormulaLine(name);
    });
  }

  function removeFormulaLine(id) {
    setFormulaDraft((current) => ({
      ...current,
      lines: safeArray(current?.lines).filter((line) => line.id !== id),
    }));
  }

  function cleanedFormulaLines() {
    return safeArray(formulaDraft?.lines)
      .map((line) => ({
        id: line.id,
        productId: line.productId || "",
        inventoryId: line.productId || line.inventoryId || "",
        productName: String(line.productName || "").trim(),
        referenceGram: Number(line.referenceGram || 0),
      }))
      .filter((line) => line.productName || line.productId || line.referenceGram > 0);
  }

  async function saveCatalogFormula() {
    if (!selected?.id || !formulaDraft) return;
    const lines = cleanedFormulaLines();
    if (lines.some((line) => !line.productName || !Number.isFinite(line.referenceGram) || line.referenceGram <= 0)) {
      setError("Her bileşende ad ve sıfırdan büyük gramaj olmalıdır.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const currentFormula = catalogFormulaOf(selected);
      const history = safeArray(selected.catalogFormulaHistory);
      const maxVersion = [currentFormula, ...history].reduce((max, item) => Math.max(max, formulaVersionNumber(item)), 0);
      const totalGr = lines.reduce((sum, line) => sum + line.referenceGram, 0);
      const nextVersion = `A${maxVersion + 1 || 1}`;
      const now = new Date().toISOString();
      const nextHistory = currentFormula
        ? [...history, { ...currentFormula, archivedAt: now, version: currentFormula.version || "IMPORT" }].slice(-30)
        : history;
      const catalogFormula = lines.length ? {
        ...(selected.catalogFormula || {}),
        version: nextVersion,
        source: "USER_EDITED",
        sourceLabel: "Kullanıcı düzenlemesi",
        paintType: formulaDraft.paintType,
        dyeType: formulaDraft.paintType,
        productionSafe: false,
        note: formulaDraft.note || "",
        totalGr,
        updatedAt: now,
        lines: lines.map((line) => ({
          ...line,
          percentage: totalGr ? line.referenceGram / totalGr * 100 : 0,
        })),
      } : null;
      await updateRegisteredColorFormula(activeMainCompany, selected.id, {
        dyeType: formulaDraft.paintType,
        paintType: formulaDraft.paintType,
        catalogFormula,
        catalogFormulaHistory: nextHistory,
      });
      const next = await refreshSelected(selected.id);
      setFormulaDraft(formulaDraftOf(next, products));
      setFormulaEditing(false);
      setDetailTab("formula");
      setMessage(lines.length ? `${nextVersion} arşiv formülü kaydedildi.` : "Arşiv bileşen formülü temizlendi; eski sürüm geçmişte korundu.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function createApprovedRecipeFromFormula() {
    if (!selected?.id || !formulaDraft) return;
    const lines = cleanedFormulaLines();
    if (!lines.length || lines.some((line) => !line.productId || line.referenceGram <= 0)) {
      setError("Onaylı reçete oluşturmak için her bileşeni onaylı stok ürünüyle eşleştir ve gramajını gir.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const recipe = await createColorRecipeVersion(activeMainCompany, selected.id, {
        paintType: formulaDraft.paintType,
        dyeType: formulaDraft.paintType,
        lines,
      });
      await refreshSelected(selected.id);
      setFormulaEditing(false);
      setDetailTab("recipe");
      setMessage(`${recipe?.version || "Yeni"} onaylı reçete oluşturuldu. Eski aktif reçete arşivlendi.`);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const recipes = safeArray(selected?.recipes).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const productions = safeArray(selected?.productions);
  const activeRecipe = recipes.find((row) => row.status === "ACTIVE") || recipes[0];
  const catalogFormula = catalogFormulaOf(selected);
  const catalogHistory = safeArray(selected?.catalogFormulaHistory).slice().reverse();
  const selectedSource = sourceTypeOf(selected);
  const formulaStats = formulaTotals(formulaDraft);
  const canCreateApprovedRecipe = formulaStats.lineCount > 0 && formulaStats.mappedCount === formulaStats.lineCount && safeArray(formulaDraft?.lines).every((line) => Number(line.referenceGram || 0) > 0);

  return (
    <div className="bh-colors-hub bh-color-memory-v3">
      <section className="bh-operation-intro bh-color-memory-intro">
        <div>
          <small>KAYITLI RENKLER</small>
          <h2>Renk ve Reçete Hafızası</h2>
          <p>Renk kartı sade özet verir; bileşen, gramaj, reçete ve geçmiş seçilen rengin çalışma alanında yönetilir.</p>
        </div>
        <div className="bh-color-intro-actions">
          <span><strong>{filtered.length}</strong> görünür kayıt</span>
          <button type="button" className="bh-btn primary" onClick={() => openModule?.("boyahane", { tabKey: "receteler" })}>+ Numuneden Yeni Renk</button>
        </div>
      </section>

      <section className="bh-report-filters bh-color-memory-filters">
        <label><span>Renk ara</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="19-4151, saks, referans, mavi, #173b77…" /></label>
        <label><span>Renk kaynağı</span><select value={sourceType} onChange={(event) => setSourceType(event.target.value)}><option value="">Tümü</option>{Object.entries(SOURCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label><span>Renk ailesi</span><select value={colorFamily} onChange={(event) => setColorFamily(event.target.value)}><option value="">Tümü</option>{families.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Boya türü</span><select value={paintType} onChange={(event) => setPaintType(event.target.value)}><option value="">Tümü</option>{paintTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>Durum</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tümü</option><option value="ACTIVE">Aktif</option><option value="PASSIVE">Pasif</option></select></label>
        <button type="button" className="bh-btn" onClick={() => { setQuery(""); setPaintType(""); setSourceType(""); setColorFamily(""); setStatus(""); }}>Temizle</button>
      </section>

      <div className="bh-color-family-shortcuts">
        {COLOR_FAMILIES.slice(0, 11).map((item) => <button type="button" key={item} className={colorFamily === item ? "active" : ""} onClick={() => setColorFamily(colorFamily === item ? "" : item)}>{item}</button>)}
      </div>

      {message ? <div className="bh-notice success">{message}</div> : null}
      {error ? <div className="bh-notice danger">{error}</div> : null}
      {loading ? <div className="bh-empty large">Kayıtlı renkler yükleniyor…</div> : null}

      <section className="bh-color-card-grid bh-color-card-grid-v3">
        {filtered.map((row) => {
          const source = sourceTypeOf(row);
          const formula = catalogFormulaOf(row);
          return (
            <button type="button" className={`bh-color-card bh-color-card-v3 source-${source.toLowerCase()}`} key={`${row.id}-${row.cardPaintType}`} onClick={() => open(row)}>
              <div className="bh-color-card-swatch" style={{ background: row.colorHex || "#cbd5e1" }} />
              <div className="bh-color-card-copy">
                <div className="bh-color-card-topline">
                  <span className={`bh-color-source-badge ${source.toLowerCase()}`}>{SOURCE_SHORT[source]}</span>
                  <span className={`bh-status ${statusTone(row.status)}`}>{statusLabel(row.status)}</span>
                </div>
                <div className="bh-color-card-title">
                  <h3>{displayCode(row)}</h3>
                  <p>{row.colorName || "Renk adı yok"}</p>
                </div>
                <div className="bh-color-card-meta-v3">
                  <span><small>Boya</small><b>{row.cardPaintType || "-"}</b></span>
                  <span><small>Versiyon</small><b>{row.activeVersion || "V1"}</b></span>
                  <span><small>Reçete</small><b>{row.recipeCount || 0}</b></span>
                </div>
                <div className="bh-color-card-footer">
                  <span className={formula ? "has-formula" : "no-formula"}>{formula ? `Formül · ${safeArray(formula.lines).length} bileşen` : "Formül yok"}</span>
                  <strong>Detay →</strong>
                </div>
              </div>
            </button>
          );
        })}
        {!filtered.length && !loading ? <div className="bh-empty large">Filtreye uygun kayıtlı renk bulunamadı.</div> : null}
      </section>

      {selected ? (
        <aside className="bh-color-detail-panel bh-color-detail-panel-v3" role="dialog" aria-modal="true">
          <div className="bh-color-detail-toolbar">
            <div><small>RENK ÇALIŞMA ALANI</small><strong>{displayCode(selected)} · {selected.colorName || "Renk"}</strong></div>
            <div className="bh-row-actions"><button type="button" className="bh-btn" onClick={() => setEditing((value) => !value)}>{editing ? "Kimlik Düzenlemeyi Kapat" : "Kimliği Düzenle"}</button><button type="button" className="bh-btn" onClick={() => setSelected(null)}>Kapat</button></div>
          </div>

          <div className="bh-color-detail-hero bh-color-detail-hero-v3">
            <i style={{ background: selected.colorHex || "#cbd5e1" }} />
            <div>
              <span className={`bh-color-source-badge ${selectedSource.toLowerCase()}`}>{SOURCE_LABELS[selectedSource]}</span>
              <h2>{displayCode(selected)} · {selected.colorName || "-"}</h2>
              <div className="bh-color-hero-meta">
                <span>Boya <strong>{selected.dyeType || selected.paintType || selected.cardPaintType || "-"}</strong></span>
                <span>Arşiv formülü <strong>{catalogFormula ? `${safeArray(catalogFormula.lines).length} bileşen` : "Yok"}</strong></span>
                <span>Onaylı reçete <strong>{activeRecipe ? activeRecipe.version : "Yok"}</strong></span>
              </div>
            </div>
          </div>

          {editing && draft ? (
            <section className="bh-card bh-color-identity-editor">
              <div className="bh-card-head"><div><h2>Renk Kimliğini Düzenle</h2><small>Reçete ve kullanım geçmişi silinmez.</small></div></div>
              <div className="bh-card-body">
                <div className="bh-form-grid three">
                  <label className="bh-field"><span>Renk kaynağı</span><select value={draft.sourceType} onChange={(event) => setDraft((current) => ({ ...current, sourceType: event.target.value }))}>{Object.entries(SOURCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                  <label className="bh-field"><span>Renk adı</span><input value={draft.colorName} onChange={(event) => setDraft((current) => ({ ...current, colorName: event.target.value }))} /></label>
                  <label className="bh-field"><span>Renk ailesi</span><select value={draft.colorFamily} onChange={(event) => setDraft((current) => ({ ...current, colorFamily: event.target.value }))}>{COLOR_FAMILIES.map((item) => <option key={item}>{item}</option>)}</select></label>
                  {draft.sourceType !== "VISUAL" ? <label className="bh-field"><span>{draft.sourceType === "REFERENCE" ? "Baz Pantone" : "Pantone"}</span><input value={draft.pantone} onChange={(event) => setDraft((current) => ({ ...current, pantone: event.target.value }))} /></label> : null}
                  {draft.sourceType === "REFERENCE" ? <><label className="bh-field"><span>Referans adı</span><input value={draft.referenceName} onChange={(event) => setDraft((current) => ({ ...current, referenceName: event.target.value }))} /></label><label className="bh-field"><span>Referans kodu</span><input value={draft.referenceCode} onChange={(event) => setDraft((current) => ({ ...current, referenceCode: event.target.value }))} /></label><label className="bh-field wide"><span>Referans notu</span><input value={draft.referenceNote} onChange={(event) => setDraft((current) => ({ ...current, referenceNote: event.target.value }))} /></label></> : null}
                  {draft.sourceType !== "PANTONE" ? <label className="bh-field bh-color-picker-field"><span>Renk kutusu</span><div><input type="color" value={draft.colorHex || "#cbd5e1"} onChange={(event) => setDraft((current) => ({ ...current, colorHex: event.target.value }))} /><input value={draft.colorHex} onChange={(event) => setDraft((current) => ({ ...current, colorHex: event.target.value }))} /></div></label> : null}
                </div>
                <div className="bh-work-actions"><button type="button" className="bh-btn primary" disabled={busy} onClick={saveIdentity}>Kimliği Kaydet</button></div>
              </div>
            </section>
          ) : null}

          <div className="bh-color-detail-actions bh-color-detail-actions-v3">
            <button type="button" className="bh-btn formula" disabled={busy} onClick={startFormulaEdit}>Formülü Düzenle</button>
            <button type="button" className="bh-btn" onClick={() => openModule?.("boyahane", { tabKey: "receteler", actionContext: { registeredColorId: selected.id } })}>Numuneye Çek</button>
            <button type="button" className="bh-btn primary" onClick={() => openModule?.("boyahane", { tabKey: "uretim-gecmisi", actionContext: { registeredColorId: selected.id } })}>İmalata Hazırla</button>
          </div>

          <div className="bh-color-detail-tabs">
            {DETAIL_TABS.map(([key, label]) => <button key={key} type="button" className={detailTab === key ? "active" : ""} onClick={() => setDetailTab(key)}>{label}</button>)}
          </div>

          <div className="bh-color-detail-content">
            {detailTab === "overview" ? (
              <section className="bh-color-overview-grid">
                <div className="bh-color-overview-stat"><small>Toplam hazırlanan</small><strong>{formatKg(productions.reduce((sum, row) => sum + Number(row.productionTotalKg || 0), 0))}</strong></div>
                <div className="bh-color-overview-stat"><small>Arşiv formülü</small><strong>{catalogFormula ? `${safeArray(catalogFormula.lines).length} satır` : "Yok"}</strong><span>{catalogFormula?.version || "-"}</span></div>
                <div className="bh-color-overview-stat"><small>Onaylı reçete</small><strong>{activeRecipe ? activeRecipe.version : "Yok"}</strong><span>{activeRecipe?.dyeType || activeRecipe?.paintType || "-"}</span></div>
                <div className="bh-color-overview-stat"><small>Kullanım</small><strong>{productions.length}</strong><span>üretim kaydı</span></div>
                {selectedSource === "REFERENCE" ? <div className="bh-reference-warning wide">Referans: <strong>{selected.referenceName || selected.referenceCode || "-"}</strong> · Baz Pantone: {selected.basePantone || selected.pantone || "Yok"}</div> : null}
                {selectedSource === "VISUAL" ? <div className="bh-reference-warning wide">HEX: <strong>{selected.colorHex || "-"}</strong> · Renk ailesi: {selected.colorFamily || "-"}</div> : null}
              </section>
            ) : null}

            {detailTab === "formula" ? (
              <section className="bh-card bh-detail-card-flat">
                <div className="bh-card-head"><div><h2>Arşiv Bileşen Formülü</h2><small>Kartta gösterilmez; burada yönetilir. Üretimde gerçek ürün ve lot tekrar doğrulanır.</small></div><button type="button" className="bh-btn primary mini" onClick={startFormulaEdit}>Düzenle</button></div>
                <div className="bh-card-body">{catalogFormula ? <div className="bh-table-wrap bh-formula-read-table"><table><thead><tr><th>Bileşen</th><th>GR</th><th>Oran</th></tr></thead><tbody>{safeArray(catalogFormula.lines).map((line) => <tr key={line.id || line.productName}><td><strong>{line.productName || "-"}</strong></td><td>{gramText(line.referenceGram)}</td><td>{Number(line.percentage || (Number(catalogFormula.totalGr || 0) ? Number(line.referenceGram || 0) / Number(catalogFormula.totalGr) * 100 : 0)).toFixed(2)}%</td></tr>)}</tbody><tfoot><tr><th>Toplam</th><th>{gramText(catalogFormula.totalGr)} gr</th><th>100%</th></tr></tfoot></table></div> : <div className="bh-empty">Bu renk kartında arşiv bileşen kaydı yok. “Düzenle” ile yeni formül oluşturabilirsin.</div>}</div>
              </section>
            ) : null}

            {detailTab === "recipe" ? (
              <section className="bh-card bh-detail-card-flat"><div className="bh-card-head"><div><h2>Onaylı Reçete</h2><small>Üretimde kullanılabilecek ürün eşleşmeli aktif reçetedir.</small></div></div><div className="bh-card-body">{activeRecipe ? <div className="bh-table-wrap bh-formula-read-table"><table><thead><tr><th>Ürün / Bileşen</th><th>Referans GR</th><th>Yüzde</th></tr></thead><tbody>{safeArray(activeRecipe.lines).map((line) => <tr key={line.id}><td>{line.productName || "-"}</td><td>{Number(line.referenceGram || line.totalGr || 0).toFixed(2)}</td><td>{Number(activeRecipe.totalGr || 0) ? (Number(line.referenceGram || line.totalGr || 0) / Number(activeRecipe.totalGr) * 100).toFixed(2) : "0.00"}%</td></tr>)}</tbody></table></div> : <div className="bh-empty">Onaylı reçete bulunmuyor. Formül düzenleyicisinde tüm bileşenleri onaylı ürünle eşleştirerek yeni versiyon oluşturabilirsin.</div>}</div></section>
            ) : null}

            {detailTab === "history" ? (
              <div className="bh-detail-stack">
                <section className="bh-card bh-detail-card-flat"><div className="bh-card-head"><div><h2>Onaylı Reçete Geçmişi</h2><small>V1, V2, V3… sürümleri.</small></div></div><div className="bh-card-body"><div className="bh-table-wrap bh-history-table"><table><thead><tr><th>Boya türü</th><th>Versiyon</th><th>Durum</th><th>Bileşen</th><th>Oluşturma</th></tr></thead><tbody>{recipes.map((recipe) => <tr key={recipe.id}><td>{recipe.dyeType || recipe.paintType || "-"}</td><td><strong>{recipe.version}</strong></td><td>{RECIPE_STATUS[recipe.status] || recipe.status}</td><td>{safeArray(recipe.lines).length}</td><td>{formatDate(recipe.createdAt)}</td></tr>)}</tbody></table></div></div></section>
                <section className="bh-card bh-detail-card-flat"><div className="bh-card-head"><div><h2>Arşiv Formül Geçmişi</h2><small>Kullanıcı düzenlemelerinde eski formül kaybolmaz.</small></div></div><div className="bh-card-body">{catalogHistory.length ? <div className="bh-archive-version-list">{catalogHistory.map((item, index) => <div key={`${item.version || "import"}-${index}`}><strong>{item.version || "IMPORT"}</strong><span>{safeArray(item.lines).length} bileşen · {gramText(item.totalGr)} gr</span><small>{item.archivedAt ? formatDate(item.archivedAt) : item.updatedAt ? formatDate(item.updatedAt) : "Kaynak kayıt"}</small></div>)}</div> : <div className="bh-empty">Henüz arşiv formül sürüm geçmişi oluşmadı.</div>}</div></section>
              </div>
            ) : null}

            {detailTab === "usage" ? (
              <section className="bh-card bh-detail-card-flat"><div className="bh-card-head"><div><h2>Kullanıldığı Modeller</h2><small>Pantone, referans veya görsel kimliğiyle kullanım geçmişi.</small></div></div><div className="bh-card-body"><div className="bh-table-wrap bh-usage-table"><table><thead><tr><th>Görsel</th><th>Tarih</th><th>Model</th><th>Firma</th><th>Kanal / Baskı</th><th>Versiyon</th><th>KG</th><th>İş türü</th></tr></thead><tbody>{productions.map((item) => <tr key={item.id}><td><ModelThumbnail src={item.imageUrl} alt={item.modelSnapshot} /></td><td>{formatDate(item.createdAt)}</td><td>{item.modelSnapshot || item.modelName || "-"}</td><td>{item.companySnapshot || "-"}</td><td>{item.channelName || item.printRegionSnapshot || "-"}</td><td>{item.versionSnapshot || "-"}</td><td>{formatKg(item.productionTotalKg)}</td><td>{item.jobType || "PRODUCTION"}</td></tr>)}</tbody></table></div></div></section>
            ) : null}
          </div>
        </aside>
      ) : null}

      {formulaEditing && selected && formulaDraft ? (
        <div className="bh-modal bh-formula-editor-modal" role="dialog" aria-modal="true">
          <div className="bh-modal-card bh-formula-editor-card">
            <div className="bh-formula-editor-head">
              <div className="bh-formula-editor-color"><i style={{ background: selected.colorHex || "#cbd5e1" }} /><div><small>BİLEŞEN FORMÜLÜ DÜZENLE</small><h2>{displayCode(selected)} · {selected.colorName || "Renk"}</h2><p>Arşiv formülünü güvenle düzenle; onaylı üretim reçetesi ayrı versiyon olarak oluşturulur.</p></div></div>
              <button type="button" className="bh-btn" onClick={() => setFormulaEditing(false)}>Kapat</button>
            </div>

            <div className="bh-formula-editor-summary">
              <label className="bh-field"><span>Boya türü</span><select value={formulaDraft.paintType} onChange={(event) => setFormulaDraft((current) => ({ ...current, paintType: event.target.value }))}>{paintTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
              <div><small>Bileşen</small><strong>{formulaStats.lineCount}</strong></div>
              <div><small>Toplam</small><strong>{gramText(formulaStats.totalGr)} gr</strong></div>
              <div><small>Ürün eşleşmesi</small><strong>{formulaStats.mappedCount}/{formulaStats.lineCount}</strong></div>
            </div>

            <div className="bh-formula-editor-actions-top">
              <button type="button" className="bh-btn" onClick={() => addFormulaLine()}>+ Satır Ekle</button>
              <button type="button" className="bh-btn" onClick={addStarterLines}>S10 + S20 Ekle</button>
              <button type="button" className="bh-btn danger" onClick={() => setFormulaDraft((current) => ({ ...current, lines: [] }))}>Formülü Temizle</button>
            </div>

            <div className="bh-formula-editor-table-wrap">
              <table className="bh-formula-editor-table">
                <thead><tr><th>#</th><th>Bileşen Adı</th><th>Onaylı Stok Ürünü</th><th>Gramaj</th><th>Oran</th><th></th></tr></thead>
                <tbody>
                  {safeArray(formulaDraft.lines).map((line, index) => {
                    const ratio = formulaStats.totalGr ? Number(line.referenceGram || 0) / formulaStats.totalGr * 100 : 0;
                    return <tr key={line.id}>
                      <td><strong>{index + 1}</strong></td>
                      <td><input value={line.productName} placeholder="Örn. MAVİ KBT" onChange={(event) => updateFormulaLine(line.id, { productName: event.target.value, productId: "", inventoryId: "" })} /></td>
                      <td><select value={line.productId || ""} onChange={(event) => chooseProduct(line.id, event.target.value)}><option value="">Eşleşme yok / arşiv adı</option>{products.map((product) => <option key={product.id} value={product.id}>{productLabel(product)}</option>)}</select></td>
                      <td><input type="number" min="0" step="0.01" value={line.referenceGram} onChange={(event) => updateFormulaLine(line.id, { referenceGram: event.target.value })} /></td>
                      <td><strong>{ratio.toFixed(2)}%</strong></td>
                      <td><button type="button" className="bh-btn danger mini" onClick={() => removeFormulaLine(line.id)}>Sil</button></td>
                    </tr>;
                  })}
                  {!safeArray(formulaDraft.lines).length ? <tr><td colSpan="6"><div className="bh-empty">Formül boş. “Satır Ekle” veya “S10 + S20 Ekle” ile başla.</div></td></tr> : null}
                </tbody>
                <tfoot><tr><th colSpan="3">Toplam</th><th>{gramText(formulaStats.totalGr)} gr</th><th>{formulaStats.totalGr ? "100.00%" : "0.00%"}</th><th /></tr></tfoot>
              </table>
            </div>

            <label className="bh-field bh-formula-note"><span>Formül notu</span><textarea value={formulaDraft.note || ""} onChange={(event) => setFormulaDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Bu sürümle ilgili teknik not…" /></label>

            <div className="bh-formula-editor-foot">
              <div className="bh-formula-safety-note"><strong>Güvenlik:</strong> Arşiv formülünü kaydetmek stok düşmez. Onaylı reçete oluşturmak için bütün satırların gerçek onaylı ürüne eşleşmesi gerekir; üretimde ayrıca lot doğrulaması devam eder.</div>
              <div className="bh-row-actions">
                <button type="button" className="bh-btn" disabled={busy} onClick={saveCatalogFormula}>{busy ? "Kaydediliyor…" : "Arşiv Formülünü Kaydet"}</button>
                <button type="button" className="bh-btn primary" disabled={busy || !canCreateApprovedRecipe} onClick={createApprovedRecipeFromFormula}>Onaylı Reçete Versiyonu Oluştur</button>
              </div>
            </div>
            {!canCreateApprovedRecipe && formulaStats.lineCount ? <div className="bh-notice info">Onaylı reçete butonu için {formulaStats.lineCount - formulaStats.mappedCount} bileşenin stok ürünü eşleşmesini ve tüm gramajları tamamla.</div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
