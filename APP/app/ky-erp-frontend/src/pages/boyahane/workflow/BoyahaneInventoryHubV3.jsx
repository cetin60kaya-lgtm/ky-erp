/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from "react";
import {
  createBoyahaneLotMovement,
  createBoyahaneProduct,
  createBoyahaneWorkflowLot,
  getBoyahaneStockSummary,
  listBoyahaneLots,
  listBoyahaneProducts,
  runBoyahaneLotAction,
  updateBoyahaneProduct,
} from "../../../services/boyahaneWorkflowApi";
import AddLotModal from "./AddLotModal";
import { ApprovedProductModal, StockMovementModal } from "./InventoryModals";
import { formatDate, formatKg, safeArray } from "./boyahaneFormat";
import { loadModuleData, moduleLoadMessage } from "../../../utils/resilientDataLoader";

function normalized(value) {
  return String(value || "")
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, "");
}

function defaultEnabled(row) {
  if (row?.isRecipeDefault === true) return true;
  if (row?.isRecipeDefault === false) return false;
  return Number(row?.defaultRecipeOrder || row?.recipeOrder || 0) > 0;
}

function productDraft(row) {
  const enabled = defaultEnabled(row);
  const order = Number(row?.defaultRecipeOrder || row?.recipeOrder || 0);
  return {
    id: row.id,
    tradeName: row.tradeName || "",
    productName: row.productName || row.name || "",
    code: row.code || "",
    dyeType: row.dyeType || "GENEL",
    unit: row.unit || "KG",
    currentPrice: row.currentPrice ?? "",
    currency: row.currency || "TRY",
    supplierName: row.supplierName || row.companyName || "",
    isRecipeDefault: enabled,
    defaultRecipeOrder: enabled && order > 0 ? order : "",
    approvalStatus: row.approvalStatus || "REVIEW_REQUIRED",
    isActive: row.isActive !== false,
    minStockKg: row.minStockKg ?? row.minimumStockKg ?? "",
    documents: safeArray(row.documents || row.standards),
  };
}

function statusText(value) {
  return {
    APPROVED: "Hakan Baskı Boyahane Onaylı",
    REVIEW_REQUIRED: "Evrakları Teyit Et / Onay Bekliyor",
    INACTIVE: "Pasif",
    AVAILABLE: "Aktif",
    ACTIVE: "Aktif",
    DEPLETED: "Bitti",
    QUARANTINE: "Karantina",
  }[String(value || "").toUpperCase()] || value || "-";
}

function movementText(value) {
  return {
    IN: "Giriş",
    OUT: "Sarf / Çıkış",
    SAMPLE: "Numune kullanımı",
    PRODUCTION: "İmalat kullanımı",
    LOT_CHANGE: "Lot değişimi",
    RETURN: "İade",
    FIRE: "Fire",
    ADJUSTMENT_IN: "Sayım fazlası",
    ADJUSTMENT_OUT: "Sayım eksiği",
    RF: "RF",
  }[String(value || "").toUpperCase()] || value || "-";
}

export default function BoyahaneInventoryHubV3({ activeMainCompany }) {
  const [view, setView] = useState("products");
  const [productView, setProductView] = useState("list");
  const [products, setProducts] = useState([]);
  const [lots, setLots] = useState([]);
  const [movements, setMovements] = useState([]);
  const [pendingLots, setPendingLots] = useState([]);
  const [summary, setSummary] = useState({});
  const [drafts, setDrafts] = useState({});
  const [dirtyIds, setDirtyIds] = useState([]);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [dyeTypeFilter, setDyeTypeFilter] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("");
  const [productModal, setProductModal] = useState(false);
  const [lotModal, setLotModal] = useState(false);
  const [movementLot, setMovementLot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (!activeMainCompany?.slug && !activeMainCompany?.id) return;
    setError("");
    try {
      const tenant = activeMainCompany?.slug || activeMainCompany?.id;
      const result = await loadModuleData({
        scope: `boyahane:${tenant}:envanter`,
        sources: {
          products: { critical: true, load: () => listBoyahaneProducts(activeMainCompany) },
          lots: { fallback: [], load: () => listBoyahaneLots(activeMainCompany) },
          stock: { fallback: {}, load: () => getBoyahaneStockSummary(activeMainCompany) },
        },
      });
      if (result.states.products.status !== "error") {
        const safeProducts = safeArray(result.data.products);
        setProducts(safeProducts);
        setDrafts(Object.fromEntries(safeProducts.map((row) => [row.id, productDraft(row)])));
        setDirtyIds([]);
      }
      if (result.states.lots.status !== "error") setLots(safeArray(result.data.lots));
      if (result.states.stock.status !== "error") {
        const stock = result.data.stock;
        setMovements(safeArray(stock?.movements));
        setPendingLots(safeArray(stock?.pendingLots || stock?.lotWaiting || stock?.waitingLots));
        setSummary(stock?.summary || {});
      }
      setError(moduleLoadMessage(result, "Boyahane ürün ana listesi alınamadı; son başarılı ürünler korunuyor.", "Lot veya stok özeti yenilenemedi; ürün listesi kullanılabilir."));
    } catch (requestError) {
      setError(requestError?.message || "Stok, lot ve ürün verileri alınamadı.");
    }
  }

  useEffect(() => {
    load();
  }, [activeMainCompany?.slug]);

  const stockByProduct = useMemo(() => {
    const map = new Map();
    lots.forEach((lot) => {
      const id = String(lot.inventoryId || lot.productId || "");
      const current = map.get(id) || {
        lotCount: 0,
        entryKg: 0,
        usedKg: 0,
        remainingKg: 0,
        lastLot: "",
        lastDate: "",
      };
      current.lotCount += 1;
      current.entryKg += Number(lot.entryKg || 0);
      current.usedKg += Number(lot.usedKg || 0);
      current.remainingKg += Number(lot.remainingKg || 0);
      if (
        !current.lastDate ||
        String(lot.entryDate || lot.createdAt) > current.lastDate
      ) {
        current.lastLot = lot.lotNo;
        current.lastDate = String(lot.entryDate || lot.createdAt || "");
      }
      map.set(id, current);
    });
    return map;
  }, [lots]);

  const suppliers = useMemo(
    () =>
      [
        ...new Set(
          products
            .map((row) => row.supplierName || row.companyName)
            .filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, "tr")),
    [products],
  );
  const dyeTypes = useMemo(
    () =>
      [...new Set(products.map((row) => row.dyeType).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "tr"),
      ),
    [products],
  );

  const q = search.trim().toLocaleLowerCase("tr-TR");
  const filteredProducts = products.filter((row) => {
    const draft = drafts[row.id] || productDraft(row);
    const text = [
      draft.tradeName,
      draft.productName,
      draft.code,
      draft.supplierName,
      draft.dyeType,
    ]
      .join(" ")
      .toLocaleLowerCase("tr-TR");
    return (
      (!q || text.includes(q)) &&
      (!supplierFilter || draft.supplierName === supplierFilter) &&
      (!dyeTypeFilter || draft.dyeType === dyeTypeFilter) &&
      (!approvalFilter || draft.approvalStatus === approvalFilter)
    );
  });

  const filteredLots = lots.filter(
    (row) =>
      !q ||
      [
        row.productName,
        row.lotNo,
        row.supplierName,
        row.invoiceNo,
        row.status,
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(q),
  );
  const filteredMovements = movements.filter(
    (row) =>
      !q ||
      [row.productName, row.lotNo, row.modelName, row.source, row.actor, row.type]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(q),
  );
  const activeLots = filteredLots.filter(
    (row) =>
      ["AVAILABLE", "ACTIVE", "QUARANTINE"].includes(
        String(row.status).toUpperCase(),
      ) && Number(row.remainingKg || 0) > 0,
  );
  const historyLots = filteredLots.filter((row) => !activeLots.includes(row));
  const waitingRows = pendingLots.length
    ? pendingLots
    : lots.filter((row) => !String(row.lotNo || "").trim());

  const defaultsByType = useMemo(() => {
    const map = new Map();
    products.forEach((row) => {
      const draft = drafts[row.id] || productDraft(row);
      if (!draft.isRecipeDefault) return;
      const key = draft.dyeType || "GENEL";
      const current = map.get(key) || [];
      current.push(draft);
      map.set(key, current);
    });
    map.forEach((rows) =>
      rows.sort(
        (a, b) =>
          Number(a.defaultRecipeOrder || 9999) -
            Number(b.defaultRecipeOrder || 9999) ||
          a.productName.localeCompare(b.productName, "tr"),
      ),
    );
    return map;
  }, [products, drafts]);

  function updateDraft(id, key, value) {
    setDrafts((current) => {
      const row = current[id] || productDraft(products.find((item) => item.id === id) || {});
      const next = { ...row, [key]: value };
      if (key === "isRecipeDefault" && value === false) {
        next.defaultRecipeOrder = "";
      }
      return { ...current, [id]: next };
    });
    setDirtyIds((current) =>
      current.includes(id) ? current : [...current, id],
    );
  }

  function validateDefaults() {
    const groups = new Map();
    products.forEach((row) => {
      const draft = drafts[row.id] || productDraft(row);
      if (!draft.isRecipeDefault) return;
      const order = Number(draft.defaultRecipeOrder || 0);
      if (order <= 0) {
        throw new Error(
          `${draft.productName}: Varsayılan işaretli ürün için sıra numarası zorunludur.`,
        );
      }
      const key = normalized(draft.dyeType);
      const usedOrders = groups.get(key) || new Map();
      if (usedOrders.has(order)) {
        throw new Error(
          `${draft.dyeType} boya türünde ${order}. sıra hem ${usedOrders.get(order)} hem ${draft.productName} ürününe verilmiş.`,
        );
      }
      usedOrders.set(order, draft.productName);
      groups.set(key, usedOrders);
    });
  }

  async function saveProductRow(id) {
    const draft = drafts[id];
    if (!draft) return;
    await updateBoyahaneProduct(activeMainCompany, id, {
      ...draft,
      currentPrice: Number(draft.currentPrice || 0),
      minStockKg: Number(draft.minStockKg || 0),
      isRecipeDefault: Boolean(draft.isRecipeDefault),
      defaultRecipeOrder: draft.isRecipeDefault
        ? Number(draft.defaultRecipeOrder || 0)
        : 0,
      recipeOrder: draft.isRecipeDefault
        ? Number(draft.defaultRecipeOrder || 0)
        : 0,
    });
  }

  async function saveAllProducts() {
    if (!dirtyIds.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      validateDefaults();
      for (const id of dirtyIds) await saveProductRow(id);
      setMessage(
        `${dirtyIds.length} ürün güncellendi. Varsayılan seçimi ve sırası yeni reçetelere bağlandı.`,
      );
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveProduct(form) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await createBoyahaneProduct(activeMainCompany, {
        ...form,
        approvalStatus: "REVIEW_REQUIRED",
        isActive: true,
        isRecipeDefault: false,
        defaultRecipeOrder: 0,
      });
      setProductModal(false);
      setMessage(
        "Ürün kartı oluşturuldu. Evrak teyidinden sonra imalat kullanımına açılabilir.",
      );
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function approveProduct(row) {
    if (
      !window.confirm(
        `${row.productName} evrakları teyit edildi ve imalat kullanımına açılsın mı?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await updateBoyahaneProduct(activeMainCompany, row.id, {
        approvalStatus: "APPROVED",
        approvedAt: new Date().toISOString(),
        isActive: true,
      });
      setMessage(`${row.productName} imalat kullanımına açıldı.`);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveLot(form) {
    setBusy(true);
    setError("");
    try {
      await createBoyahaneWorkflowLot(activeMainCompany, form);
      setLotModal(false);
      setMessage("Lot kaydedildi; ürün bazlı stok giriş hareketi oluşturuldu.");
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveMovement(form) {
    if (!movementLot?.id) return;
    setBusy(true);
    setError("");
    try {
      await createBoyahaneLotMovement(activeMainCompany, movementLot.id, form);
      setMovementLot(null);
      setMessage("Stok hareketi kaydedildi. Eski kayıt silinmedi.");
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function lotAction(id, action) {
    setBusy(true);
    setError("");
    try {
      await runBoyahaneLotAction(activeMainCompany, id, action);
      setMessage("Lot durumu güncellendi ve işlem geçmişi korundu.");
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bh-inventory-hub bh-inventory-v3">
      <section className="bh-operation-intro bh-inventory-intro-v3">
        <div>
          <small>STOK, LOT VE ÜRÜNLER</small>
          <h2>Ürün, Lot ve Reçete Başlangıç Merkezi</h2>
          <p>
            Varsayılan ayrı işaretlenir, sıra numarasıyla dizilir. İstenilen boya türünde sınırsız başlangıç ürünü tanımlanabilir.
          </p>
        </div>
        <div className="bh-head-actions">
          <button
            type="button"
            className="bh-btn"
            onClick={() => setProductModal(true)}
          >
            + Yeni Ürün
          </button>
          <button
            type="button"
            className="bh-btn primary"
            onClick={() => setLotModal(true)}
          >
            + Lot Ekle
          </button>
        </div>
      </section>

      <div className="bh-command-kpis compact bh-inventory-kpis-v3">
        <article>
          <span>Ürün</span>
          <strong>{products.length}</strong>
          <small>
            {products.filter((row) => row.approvalStatus === "APPROVED").length} onaylı
          </small>
        </article>
        <article>
          <span>Aktif lot</span>
          <strong>{activeLots.length}</strong>
          <small>Ürün bazlı</small>
        </article>
        <article>
          <span>Lot bekleyen</span>
          <strong>{waitingRows.length}</strong>
          <small>Fatura / belge</small>
        </article>
        <article>
          <span>Toplam giriş</span>
          <strong>{formatKg(summary.totalEntryKg)}</strong>
          <small>Muhasebe + elle</small>
        </article>
        <article>
          <span>Kalan stok</span>
          <strong>{formatKg(summary.totalRemainingKg)}</strong>
          <small>Eksi stok kapalı</small>
        </article>
      </div>

      <nav className="bh-operation-tabs inventory">
        <button
          type="button"
          className={view === "products" ? "active" : ""}
          onClick={() => setView("products")}
        >
          Ürünler <b>{products.length}</b>
        </button>
        <button
          type="button"
          className={view === "lots" ? "active" : ""}
          onClick={() => setView("lots")}
        >
          Lotlar <b>{lots.length}</b>
        </button>
        <button
          type="button"
          className={view === "movements" ? "active" : ""}
          onClick={() => setView("movements")}
        >
          Stok Hareketleri <b>{movements.length}</b>
        </button>
      </nav>

      <div className="bh-product-filter-bar">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Ürün, ticari ad, KNG, 20, firma veya kod ara"
        />
        <select
          value={supplierFilter}
          onChange={(event) => setSupplierFilter(event.target.value)}
        >
          <option value="">Tüm firmalar</option>
          {suppliers.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          value={dyeTypeFilter}
          onChange={(event) => setDyeTypeFilter(event.target.value)}
        >
          <option value="">Tüm boya türleri</option>
          {dyeTypes.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          value={approvalFilter}
          onChange={(event) => setApprovalFilter(event.target.value)}
        >
          <option value="">Tüm onay durumları</option>
          <option value="APPROVED">Onaylı</option>
          <option value="REVIEW_REQUIRED">Onay bekliyor</option>
        </select>
        {view === "products" ? (
          <div className="bh-view-switch">
            <button
              type="button"
              className={productView === "list" ? "active" : ""}
              onClick={() => setProductView("list")}
            >
              Liste
            </button>
            <button
              type="button"
              className={productView === "cards" ? "active" : ""}
              onClick={() => setProductView("cards")}
            >
              Kart
            </button>
          </div>
        ) : null}
        <button type="button" className="bh-btn" onClick={load}>
          Yenile
        </button>
      </div>

      {view === "products" ? (
        <div className="bh-default-order-strip bh-default-order-strip-v3">
          <strong>Yeni reçete varsayılanları</strong>
          <div className="bh-default-type-list">
            {[...defaultsByType.entries()].map(([type, rows]) => (
              <span key={type}>
                <b>{type}:</b>{" "}
                {rows.map((row) => `${row.defaultRecipeOrder}. ${row.productName}`).join(" · ")}
              </span>
            ))}
            {!defaultsByType.size ? <span>Henüz varsayılan ürün seçilmedi.</span> : null}
          </div>
          <small>
            “Varsayılan” kutusunu işaretleyin, sonra 1, 2, 3… sıra numarası verin.
          </small>
          <button
            type="button"
            className="bh-btn primary"
            disabled={busy || !dirtyIds.length}
            onClick={saveAllProducts}
          >
            Toplu Kaydet ({dirtyIds.length})
          </button>
        </div>
      ) : null}

      {message ? <div className="bh-notice success">{message}</div> : null}
      {error ? <div className="bh-notice danger">{error}</div> : null}

      {view === "products" && productView === "list" ? (
        <section className="bh-card bh-product-sheet-card">
          <div className="bh-table-wrap wide bh-product-sheet-wrap">
            <table className="bh-product-sheet bh-product-sheet-v3">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ürün Ticari Adı</th>
                  <th>Ürün Adı</th>
                  <th>Kod</th>
                  <th>Boya Türü</th>
                  <th>Birim</th>
                  <th>Fiyat</th>
                  <th>Döviz</th>
                  <th>Firma</th>
                  <th>Varsayılan</th>
                  <th>Sıra</th>
                  <th>Onay</th>
                  <th>Son Lot / Kalan</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((row, index) => {
                  const draft = drafts[row.id] || productDraft(row);
                  const stock = stockByProduct.get(String(row.id)) || {};
                  const dirty = dirtyIds.includes(row.id);
                  return (
                    <tr key={row.id} className={dirty ? "dirty" : ""}>
                      <td>{index + 1}</td>
                      <td>
                        <input
                          value={draft.tradeName}
                          onChange={(event) =>
                            updateDraft(row.id, "tradeName", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={draft.productName}
                          onChange={(event) =>
                            updateDraft(row.id, "productName", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={draft.code}
                          onChange={(event) =>
                            updateDraft(row.id, "code", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={draft.dyeType}
                          onChange={(event) =>
                            updateDraft(row.id, "dyeType", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={draft.unit}
                          onChange={(event) =>
                            updateDraft(row.id, "unit", event.target.value)
                          }
                        >
                          <option>KG</option>
                          <option>LT</option>
                          <option>ADET</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft.currentPrice}
                          onChange={(event) =>
                            updateDraft(row.id, "currentPrice", event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={draft.currency}
                          onChange={(event) =>
                            updateDraft(row.id, "currency", event.target.value)
                          }
                        >
                          <option>TRY</option>
                          <option>EUR</option>
                          <option>USD</option>
                          <option>GBP</option>
                        </select>
                      </td>
                      <td>
                        <input
                          value={draft.supplierName}
                          onChange={(event) =>
                            updateDraft(row.id, "supplierName", event.target.value)
                          }
                        />
                      </td>
                      <td className="bh-default-check-cell">
                        <label>
                          <input
                            type="checkbox"
                            checked={Boolean(draft.isRecipeDefault)}
                            onChange={(event) =>
                              updateDraft(
                                row.id,
                                "isRecipeDefault",
                                event.target.checked,
                              )
                            }
                          />
                          <span>{draft.isRecipeDefault ? "Evet" : "Hayır"}</span>
                        </label>
                      </td>
                      <td>
                        <input
                          className="bh-order-input"
                          type="number"
                          min="1"
                          step="1"
                          disabled={!draft.isRecipeDefault}
                          value={draft.defaultRecipeOrder}
                          onChange={(event) =>
                            updateDraft(
                              row.id,
                              "defaultRecipeOrder",
                              event.target.value,
                            )
                          }
                          placeholder="-"
                        />
                      </td>
                      <td>
                        <select
                          value={draft.approvalStatus}
                          onChange={(event) =>
                            updateDraft(
                              row.id,
                              "approvalStatus",
                              event.target.value,
                            )
                          }
                        >
                          <option value="APPROVED">Onaylı</option>
                          <option value="REVIEW_REQUIRED">Onay bekliyor</option>
                          <option value="INACTIVE">Pasif</option>
                        </select>
                      </td>
                      <td>
                        <small>
                          {stock.lastLot || "-"}
                          <br />
                          {formatKg(stock.remainingKg)}
                        </small>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="bh-btn mini primary"
                          disabled={busy || !dirty}
                          onClick={async () => {
                            setBusy(true);
                            setError("");
                            try {
                              validateDefaults();
                              await saveProductRow(row.id);
                              setMessage(`${draft.productName} güncellendi.`);
                              await load();
                            } catch (requestError) {
                              setError(requestError.message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Kaydet
                        </button>
                        {draft.approvalStatus !== "APPROVED" ? (
                          <button
                            type="button"
                            className="bh-btn mini"
                            disabled={busy}
                            onClick={() => approveProduct(row)}
                          >
                            Onayla
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filteredProducts.length ? (
            <div className="bh-empty compact">Filtreye uygun ürün bulunamadı.</div>
          ) : null}
        </section>
      ) : null}

      {view === "products" && productView === "cards" ? (
        <section className="bh-product-card-grid bh-product-card-grid-v3">
          {filteredProducts.map((row) => {
            const draft = drafts[row.id] || productDraft(row);
            const stock = stockByProduct.get(String(row.id)) || {};
            const approved = draft.approvalStatus === "APPROVED";
            return (
              <article className="bh-product-card bh-product-card-v3" key={row.id}>
                <div className="bh-product-card-head">
                  <div>
                    <h3>{draft.productName}</h3>
                    <p>{draft.tradeName || draft.code || "Ticari ad yok"}</p>
                  </div>
                  <span className={`bh-approval-mark ${approved ? "approved" : "waiting"}`}>
                    {approved ? "✓" : "!"}
                  </span>
                </div>
                <dl>
                  <div><dt>Firma</dt><dd>{draft.supplierName || "-"}</dd></div>
                  <div><dt>Boya türü</dt><dd>{draft.dyeType}</dd></div>
                  <div><dt>Varsayılan</dt><dd>{draft.isRecipeDefault ? "Evet" : "Hayır"}</dd></div>
                  <div><dt>Sıra</dt><dd>{draft.defaultRecipeOrder || "-"}</dd></div>
                  <div><dt>Son lot</dt><dd>{stock.lastLot || "-"}</dd></div>
                  <div><dt>Kalan</dt><dd>{formatKg(stock.remainingKg)}</dd></div>
                  <div><dt>Fiyat</dt><dd>{Number(draft.currentPrice || 0).toLocaleString("tr-TR")} {draft.currency}</dd></div>
                </dl>
                <div className={`bh-product-approval ${approved ? "approved" : "waiting"}`}>
                  {statusText(draft.approvalStatus)}
                </div>
                <button
                  type="button"
                  className="bh-btn wide"
                  onClick={() => setProductView("list")}
                >
                  Listede Düzenle
                </button>
              </article>
            );
          })}
        </section>
      ) : null}

      {view === "lots" ? (
        <div className="bh-lot-layout">
          <section className="bh-card">
            <div className="bh-card-head">
              <div>
                <h2>Lot Bekleyenler</h2>
                <small>Lot numarası gelmemiş kayıtlar</small>
              </div>
              <button
                type="button"
                className="bh-btn primary"
                onClick={() => setLotModal(true)}
              >
                Toplu / Tekli Lot Gir
              </button>
            </div>
            <div className="bh-card-body">
              <div className="bh-table-wrap wide">
                <table>
                  <thead>
                    <tr>
                      <th>Ürün</th><th>Firma</th><th>Kaynak</th><th>Giriş tarihi</th><th>Miktar</th><th>Belge / Fatura</th><th>İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waitingRows.map((row, index) => (
                      <tr key={row.id || index}>
                        <td>{row.productName || "-"}</td>
                        <td>{row.supplierName || row.companyName || "-"}</td>
                        <td>{row.source || row.sourceType || "-"}</td>
                        <td>{formatDate(row.entryDate || row.createdAt)}</td>
                        <td>{formatKg(row.entryKg || row.quantity)}</td>
                        <td>{row.invoiceNo || row.documentNo || "-"}</td>
                        <td><button type="button" className="bh-btn mini primary" onClick={() => setLotModal(true)}>Lot Gir</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!waitingRows.length ? <div className="bh-empty compact">Lot bekleyen kayıt yok.</div> : null}
            </div>
          </section>

          <section className="bh-card">
            <div className="bh-card-head"><div><h2>Aktif Lotlar</h2><small>Varsayılan lot ve kalan miktar</small></div></div>
            <div className="bh-card-body">
              <div className="bh-table-wrap wide">
                <table>
                  <thead><tr><th>Ürün</th><th>Lot</th><th>Firma</th><th>Giriş</th><th>Kullanılan</th><th>Kalan</th><th>Varsayılan</th><th>Durum</th><th>İşlem</th></tr></thead>
                  <tbody>
                    {activeLots.map((row) => (
                      <tr key={row.id}>
                        <td><strong>{row.productName}</strong></td>
                        <td>{row.lotNo}</td>
                        <td>{row.supplierName || "-"}</td>
                        <td>{formatKg(row.entryKg)}</td>
                        <td>{formatKg(row.usedKg)}</td>
                        <td><strong>{formatKg(row.remainingKg)}</strong></td>
                        <td>{row.isDefault ? "Evet" : "Hayır"}</td>
                        <td>{statusText(row.status)}</td>
                        <td>
                          <div className="bh-row-actions">
                            <button type="button" className="bh-btn mini primary" onClick={() => setMovementLot(row)}>Hareket</button>
                            <button type="button" className="bh-btn mini" onClick={() => lotAction(row.id, "SET_DEFAULT")}>Varsayılan</button>
                            <button type="button" className="bh-btn mini" onClick={() => lotAction(row.id, "QUARANTINE")}>Karantina</button>
                            <button type="button" className="bh-btn mini danger" onClick={() => lotAction(row.id, "FINISH")}>Lot Bitti</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="bh-card">
            <div className="bh-card-head"><div><h2>Geçmiş Lotlar</h2><small>Biten, pasif ve geçmiş lotlar</small></div></div>
            <div className="bh-card-body">
              <div className="bh-table-wrap wide">
                <table>
                  <thead><tr><th>Ürün</th><th>Lot</th><th>Firma</th><th>Giriş tarihi</th><th>Kullanım başlangıcı</th><th>Bitiş</th><th>Giriş</th><th>Kullanılan</th><th>Durum</th></tr></thead>
                  <tbody>
                    {historyLots.map((row) => (
                      <tr key={row.id}>
                        <td>{row.productName}</td>
                        <td>{row.lotNo || "Lot bekliyor"}</td>
                        <td>{row.supplierName || "-"}</td>
                        <td>{formatDate(row.entryDate || row.createdAt)}</td>
                        <td>{formatDate(row.usageStartedAt)}</td>
                        <td>{formatDate(row.usageEndedAt)}</td>
                        <td>{formatKg(row.entryKg)}</td>
                        <td>{formatKg(row.usedKg)}</td>
                        <td>{statusText(row.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {view === "movements" ? (
        <section className="bh-card">
          <div className="bh-card-head"><div><h2>Stok Hareketleri</h2><small>Ürün ve lot bazlı denetim geçmişi</small></div></div>
          <div className="bh-card-body">
            <div className="bh-table-wrap wide">
              <table>
                <thead><tr><th>Tarih</th><th>Ürün</th><th>Lot</th><th>Hareket</th><th>Miktar</th><th>Model</th><th>Kaynak</th><th>Kullanıcı</th></tr></thead>
                <tbody>
                  {filteredMovements.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.createdAt || row.date)}</td>
                      <td>{row.productName || "-"}</td>
                      <td>{row.lotNo || "-"}</td>
                      <td>{movementText(row.type)}</td>
                      <td>{formatKg(row.quantity || row.kg)}</td>
                      <td>{row.modelName || "-"}</td>
                      <td>{row.source || "-"}</td>
                      <td>{row.actor || row.createdBy || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {productModal ? (
        <ApprovedProductModal
          busy={busy}
          onCancel={() => setProductModal(false)}
          onSave={saveProduct}
        />
      ) : null}
      {lotModal ? (
        <AddLotModal
          products={products.filter((row) => row.approvalStatus === "APPROVED")}
          busy={busy}
          onCancel={() => setLotModal(false)}
          onSave={saveLot}
        />
      ) : null}
      {movementLot ? (
        <StockMovementModal
          lot={movementLot}
          busy={busy}
          onCancel={() => setMovementLot(null)}
          onSave={saveMovement}
        />
      ) : null}
    </div>
  );
}
