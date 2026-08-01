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
import { formatKg, safeArray } from "./boyahaneFormat";
import AddLotModal from "./AddLotModal";
import {
  ApprovedProductModal,
  StockMovementModal,
} from "./InventoryModals";

function statusText(value) {
  const key = String(value || "").toUpperCase();
  if (key === "APPROVED") return "Onaylı";
  if (key === "REVIEW_REQUIRED") return "Kontrol gerekli";
  if (key === "AVAILABLE") return "Kullanılabilir";
  if (key === "DEPLETED") return "Bitti";
  if (key === "QUARANTINE") return "Karantina";
  if (key === "INACTIVE") return "Pasif";
  return value || "-";
}

export default function UrunLotlarPage({ activeMainCompany }) {
  const [view, setView] = useState("products");
  const [products, setProducts] = useState([]);
  const [lots, setLots] = useState([]);
  const [summary, setSummary] = useState({});
  const [lotModal, setLotModal] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [movementLot, setMovementLot] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  async function load() {
    if (!activeMainCompany?.slug) return;
    setError("");
    try {
      const [productPayload, lotPayload, stockPayload] = await Promise.all([
        listBoyahaneProducts(activeMainCompany),
        listBoyahaneLots(activeMainCompany),
        getBoyahaneStockSummary(activeMainCompany),
      ]);
      setProducts(safeArray(productPayload));
      setLots(safeArray(lotPayload));
      setSummary(stockPayload?.summary || {});
    } catch (requestError) {
      setError(requestError?.message || "Boyahane stok verileri alınamadı.");
      setProducts([]);
      setLots([]);
      setSummary({});
    }
  }

  useEffect(() => {
    load();
  }, [activeMainCompany?.slug]);

  const productStockMap = useMemo(() => {
    const map = new Map();
    lots.forEach((lot) => {
      const productId = String(lot.productId || lot.inventoryId || "");
      const current = map.get(productId) || {
        lotCount: 0,
        entryKg: 0,
        usedKg: 0,
        remainingKg: 0,
      };
      current.lotCount += 1;
      current.entryKg += Number(lot.entryKg || lot.quantity || 0);
      current.usedKg += Number(lot.usedKg || 0);
      current.remainingKg += Number(
        lot.remainingKg ?? lot.remainingQuantity ?? 0,
      );
      map.set(productId, current);
    });
    return map;
  }, [lots]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return products;
    return products.filter((row) =>
      [row.productName, row.code, row.dyeType, row.approvalStatus]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(q),
    );
  }, [products, search]);

  const filteredLots = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return lots;
    return lots.filter((row) =>
      [
        row.productName,
        row.dyeType,
        row.lotNo,
        row.supplierName,
        row.invoiceNo,
        row.status,
      ]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(q),
    );
  }, [lots, search]);

  async function saveLot(form) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await createBoyahaneWorkflowLot(activeMainCompany, form);
      setLotModal(false);
      setMessage("Lot kaydedildi ve stok giriş hareketi oluşturuldu.");
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Lot kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function saveProduct(form) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await createBoyahaneProduct(activeMainCompany, form);
      setProductModal(false);
      setMessage("Onaylı Boyahane ürünü oluşturuldu.");
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Onaylı ürün kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function approveProduct(row) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await updateBoyahaneProduct(activeMainCompany, row.id, {
        approvalStatus: "APPROVED",
        isActive: true,
      });
      setMessage(`${row.productName} onaylandı.`);
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Ürün onaylanamadı.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMovement(form) {
    if (!movementLot?.id) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await createBoyahaneLotMovement(
        activeMainCompany,
        movementLot.id,
        form,
      );
      setMovementLot(null);
      setMessage("Stok hareketi kaydedildi; lot bakiyesi güncellendi.");
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Stok hareketi kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  async function action(id, type) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await runBoyahaneLotAction(activeMainCompany, id, type);
      setMessage("Lot durumu güncellendi.");
      await load();
    } catch (requestError) {
      setError(requestError?.message || "Lot işlemi tamamlanamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bh-card bh-inventory-center">
      <div className="bh-card-head">
        <div>
          <h2>Onaylı Ürün ve Lot Stok Merkezi</h2>
          <small>
            Muhasebe faturası, firma aliası, onaylı ürün, lot ve stok hareketi
            aynı kaynağı kullanır.
          </small>
        </div>
        <div className="bh-head-actions">
          <button
            className="bh-btn"
            type="button"
            onClick={() => setProductModal(true)}
          >
            + Onaylı Ürün
          </button>
          <button
            className="bh-btn primary"
            type="button"
            disabled={!products.some(
              (row) =>
                row.approvalStatus === "APPROVED" && row.isActive !== false,
            )}
            onClick={() => setLotModal(true)}
          >
            + Lot Ekle
          </button>
        </div>
      </div>

      <div className="bh-card-body">
        <div className="bh-kpi-row compact">
          <article className="bh-kpi">
            <span>Onaylı ürün</span>
            <strong>{Number(summary.approvedProductCount || 0)}</strong>
          </article>
          <article className="bh-kpi">
            <span>Toplam lot</span>
            <strong>{Number(summary.lotCount || 0)}</strong>
          </article>
          <article className="bh-kpi">
            <span>Kullanılabilir lot</span>
            <strong>{Number(summary.availableLotCount || 0)}</strong>
          </article>
          <article className="bh-kpi">
            <span>Toplam giriş</span>
            <strong>{formatKg(summary.totalEntryKg)}</strong>
          </article>
          <article className="bh-kpi">
            <span>Kullanılan</span>
            <strong>{formatKg(summary.totalUsedKg)}</strong>
          </article>
          <article className="bh-kpi">
            <span>Kalan stok</span>
            <strong>{formatKg(summary.totalRemainingKg)}</strong>
          </article>
        </div>

        <div className="bh-inventory-toolbar">
          <div className="bh-tabs">
            <button
              type="button"
              className={`bh-tab ${view === "products" ? "active" : ""}`}
              onClick={() => setView("products")}
            >
              Onaylı Ürünler
            </button>
            <button
              type="button"
              className={`bh-tab ${view === "lots" ? "active" : ""}`}
              onClick={() => setView("lots")}
            >
              Lot ve Stok
            </button>
          </div>
          <input
            className="bh-inventory-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              view === "products"
                ? "Ürün, kod veya tür ara"
                : "Ürün, lot, firma veya fatura ara"
            }
          />
        </div>

        {message ? <div className="bh-notice success">{message}</div> : null}
        {error ? <div className="bh-notice danger">{error}</div> : null}

        {view === "products" ? (
          <div className="bh-table-wrap wide">
            <table>
              <thead>
                <tr>
                  <th>Onaylı ürün</th>
                  <th>Kod</th>
                  <th>Tür</th>
                  <th>Birim</th>
                  <th>Lot</th>
                  <th>Giriş</th>
                  <th>Kullanılan</th>
                  <th>Kalan</th>
                  <th>Min. stok</th>
                  <th>Onay</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((row) => {
                  const stock = productStockMap.get(String(row.id)) || {};
                  return (
                    <tr key={row.id}>
                      <td><strong>{row.productName}</strong></td>
                      <td>{row.code || "-"}</td>
                      <td>{row.dyeType || "-"}</td>
                      <td>{row.unit || "KG"}</td>
                      <td>{Number(stock.lotCount || 0)}</td>
                      <td>{formatKg(stock.entryKg)}</td>
                      <td>{formatKg(stock.usedKg)}</td>
                      <td><strong>{formatKg(stock.remainingKg)}</strong></td>
                      <td>{formatKg(row.minStockKg)}</td>
                      <td>
                        <span
                          className={`bh-status ${
                            row.approvalStatus === "APPROVED" ? "green" : "orange"
                          }`}
                        >
                          {statusText(row.approvalStatus)}
                        </span>
                      </td>
                      <td>
                        {row.approvalStatus !== "APPROVED" ? (
                          <button
                            type="button"
                            className="bh-btn mini primary"
                            disabled={busy}
                            onClick={() => approveProduct(row)}
                          >
                            Onayla
                          </button>
                        ) : (
                          <span className="bh-status green">Kullanıma açık</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bh-table-wrap wide">
            <table>
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th>Boya türü</th>
                  <th>Lot</th>
                  <th>Firma</th>
                  <th>Fatura</th>
                  <th>Giriş</th>
                  <th>Kullanılan</th>
                  <th>Kalan</th>
                  <th>Varsayılan</th>
                  <th>Durum</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filteredLots.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.productName}</strong></td>
                    <td>{row.dyeType || "-"}</td>
                    <td>{row.lotNo}</td>
                    <td>{row.supplierName || "-"}</td>
                    <td>{row.invoiceNo || "-"}</td>
                    <td>{formatKg(row.entryKg)}</td>
                    <td>{formatKg(row.usedKg)}</td>
                    <td><strong>{formatKg(row.remainingKg)}</strong></td>
                    <td>{row.isDefault ? "Evet" : "Hayır"}</td>
                    <td>
                      <span
                        className={`bh-status ${
                          row.status === "AVAILABLE"
                            ? "green"
                            : row.status === "QUARANTINE"
                              ? "orange"
                              : "gray"
                        }`}
                      >
                        {statusText(row.status)}
                      </span>
                    </td>
                    <td>
                      <div className="bh-row-actions">
                        <button
                          className="bh-btn mini primary"
                          type="button"
                          disabled={busy || row.status === "INACTIVE"}
                          onClick={() => setMovementLot(row)}
                        >
                          Stok Hareketi
                        </button>
                        <button
                          className="bh-btn mini"
                          type="button"
                          disabled={busy || row.status !== "AVAILABLE"}
                          onClick={() => action(row.id, "SET_DEFAULT")}
                        >
                          Varsayılan
                        </button>
                        <button
                          className="bh-btn mini"
                          type="button"
                          disabled={busy || row.status === "DEPLETED"}
                          onClick={() => action(row.id, "QUARANTINE")}
                        >
                          Karantina
                        </button>
                        <button
                          className="bh-btn mini"
                          type="button"
                          disabled={busy}
                          onClick={() => action(row.id, "FINISH")}
                        >
                          Lot Bitti
                        </button>
                        <button
                          className="bh-btn mini danger"
                          type="button"
                          disabled={busy}
                          onClick={() => action(row.id, "DEACTIVATE")}
                        >
                          Pasife Al
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === "products" && !filteredProducts.length ? (
          <div className="bh-empty">
            Onaylı ürün bulunamadı. Önce Boyahane ürün kartını oluşturun.
          </div>
        ) : null}
        {view === "lots" && !filteredLots.length ? (
          <div className="bh-empty">
            Kayıtlı lot bulunamadı. Muhasebe faturası aktarın veya manuel lot
            açın.
          </div>
        ) : null}
      </div>

      {lotModal ? (
        <AddLotModal
          products={products.filter(
            (row) =>
              row.approvalStatus === "APPROVED" && row.isActive !== false,
          )}
          busy={busy}
          onCancel={() => setLotModal(false)}
          onSave={saveLot}
        />
      ) : null}
      {productModal ? (
        <ApprovedProductModal
          busy={busy}
          onCancel={() => setProductModal(false)}
          onSave={saveProduct}
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
    </section>
  );
}
