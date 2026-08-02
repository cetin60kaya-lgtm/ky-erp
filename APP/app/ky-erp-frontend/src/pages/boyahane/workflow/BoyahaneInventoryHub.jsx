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

function statusText(value) {
  const key = String(value || "").toUpperCase();
  return {
    APPROVED: "Hakan Baskı Boyahane Onaylı",
    REVIEW_REQUIRED: "Evrakları Teyit Et / Onay Bekliyor",
    AVAILABLE: "Aktif",
    ACTIVE: "Aktif",
    DEPLETED: "Bitti",
    QUARANTINE: "Karantina",
    INACTIVE: "Pasif",
  }[key] || value || "-";
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

export default function BoyahaneInventoryHub({ activeMainCompany }) {
  const [view, setView] = useState("products");
  const [products, setProducts] = useState([]);
  const [lots, setLots] = useState([]);
  const [movements, setMovements] = useState([]);
  const [pendingLots, setPendingLots] = useState([]);
  const [summary, setSummary] = useState({});
  const [search, setSearch] = useState("");
  const [productModal, setProductModal] = useState(false);
  const [lotModal, setLotModal] = useState(false);
  const [movementLot, setMovementLot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (!activeMainCompany?.slug) return;
    setError("");
    try {
      const [productRows, lotRows, stock] = await Promise.all([
        listBoyahaneProducts(activeMainCompany),
        listBoyahaneLots(activeMainCompany),
        getBoyahaneStockSummary(activeMainCompany),
      ]);
      const safeProducts = safeArray(productRows);
      const safeLots = safeArray(lotRows);
      setProducts(safeProducts);
      setLots(safeLots);
      setMovements(safeArray(stock?.movements));
      setPendingLots(safeArray(stock?.pendingLots || stock?.lotWaiting || stock?.waitingLots));
      setSummary(stock?.summary || {});
    } catch (requestError) {
      setError(requestError?.message || "Stok, lot ve ürün verileri alınamadı.");
    }
  }

  useEffect(() => { load(); }, [activeMainCompany?.slug]);

  const stockByProduct = useMemo(() => {
    const map = new Map();
    lots.forEach((lot) => {
      const id = String(lot.inventoryId || lot.productId || "");
      const row = map.get(id) || { lotCount: 0, entryKg: 0, usedKg: 0, remainingKg: 0, lastLot: "" };
      row.lotCount += 1;
      row.entryKg += Number(lot.entryKg || 0);
      row.usedKg += Number(lot.usedKg || 0);
      row.remainingKg += Number(lot.remainingKg || 0);
      if (!row.lastLot || String(lot.entryDate || lot.createdAt) > String(row.lastDate || "")) {
        row.lastLot = lot.lotNo;
        row.lastDate = lot.entryDate || lot.createdAt;
      }
      map.set(id, row);
    });
    return map;
  }, [lots]);

  const q = search.trim().toLocaleLowerCase("tr-TR");
  const filteredProducts = products.filter((row) => !q || [row.productName, row.tradeName, row.code, row.supplierName, row.dyeType].join(" ").toLocaleLowerCase("tr-TR").includes(q));
  const filteredLots = lots.filter((row) => !q || [row.productName, row.lotNo, row.supplierName, row.invoiceNo, row.status].join(" ").toLocaleLowerCase("tr-TR").includes(q));
  const filteredMovements = movements.filter((row) => !q || [row.productName, row.lotNo, row.modelName, row.source, row.actor, row.type].join(" ").toLocaleLowerCase("tr-TR").includes(q));
  const activeLots = filteredLots.filter((row) => ["AVAILABLE", "ACTIVE", "QUARANTINE"].includes(String(row.status).toUpperCase()) && Number(row.remainingKg || 0) > 0);
  const historyLots = filteredLots.filter((row) => !activeLots.includes(row));
  const waitingRows = pendingLots.length ? pendingLots : lots.filter((row) => !String(row.lotNo || "").trim());

  async function saveProduct(form) {
    setBusy(true); setError(""); setMessage("");
    try {
      await createBoyahaneProduct(activeMainCompany, {
        ...form,
        approvalStatus: "REVIEW_REQUIRED",
        isActive: true,
      });
      setProductModal(false);
      setMessage("Ürün kartı oluşturuldu. Yetkili onayı verilmeden imalat reçetesinde kullanılamaz.");
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function approveProduct(row) {
    if (!window.confirm(`${row.productName} için evraklar teyit edildi ve imalat kullanımına açılsın mı?`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await updateBoyahaneProduct(activeMainCompany, row.id, {
        approvalStatus: "APPROVED",
        approvedAt: new Date().toISOString(),
        isActive: true,
      });
      setMessage(`${row.productName} imalat kullanımına açıldı.`);
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function saveLot(form) {
    setBusy(true); setError(""); setMessage("");
    try {
      await createBoyahaneWorkflowLot(activeMainCompany, form);
      setLotModal(false);
      setMessage("Lot kaydedildi; ürün bazlı aktif lot ve stok giriş hareketi oluşturuldu.");
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function saveMovement(form) {
    if (!movementLot?.id) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await createBoyahaneLotMovement(activeMainCompany, movementLot.id, form);
      setMovementLot(null);
      setMessage("Stok hareketi kaydedildi. Eski kayıt silinmedi.");
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function lotAction(id, action) {
    setBusy(true); setError(""); setMessage("");
    try {
      await runBoyahaneLotAction(activeMainCompany, id, action);
      setMessage("Lot durumu güncellendi ve işlem geçmişi korundu.");
      await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="bh-inventory-hub">
      <section className="bh-operation-intro"><div><small>STOK, LOT VE ÜRÜNLER</small><h2>Ürün Bazlı Stok Merkezi</h2><p>Karışım boyanın tek lotu yoktur. Her ürünün aktif ve geçmiş lotları ayrı izlenir; kullanılan lotlar modele otomatik bağlanır.</p></div><div className="bh-head-actions"><button type="button" className="bh-btn" onClick={() => setProductModal(true)}>+ Yeni Ürün</button><button type="button" className="bh-btn primary" onClick={() => setLotModal(true)}>+ Lot Ekle</button></div></section>

      <div className="bh-command-kpis compact"><article><span>Ürün</span><strong>{products.length}</strong><small>{products.filter((row) => row.approvalStatus === "APPROVED").length} onaylı</small></article><article><span>Aktif lot</span><strong>{activeLots.length}</strong><small>Ürün bazlı</small></article><article><span>Lot bekleyen</span><strong>{waitingRows.length}</strong><small>Fatura / belge bağlantılı</small></article><article><span>Toplam giriş</span><strong>{formatKg(summary.totalEntryKg)}</strong><small>Muhasebe + elle giriş</small></article><article><span>Kalan stok</span><strong>{formatKg(summary.totalRemainingKg)}</strong><small>Eksi stok kapalı</small></article></div>

      <nav className="bh-operation-tabs inventory"><button type="button" className={view === "products" ? "active" : ""} onClick={() => setView("products")}>Ürünler<b>{products.length}</b></button><button type="button" className={view === "lots" ? "active" : ""} onClick={() => setView("lots")}>Lotlar<b>{lots.length}</b></button><button type="button" className={view === "movements" ? "active" : ""} onClick={() => setView("movements")}>Stok Hareketleri<b>{movements.length}</b></button></nav>
      <div className="bh-inventory-search-row"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ürün, lot, firma, model veya belge ara" /><button type="button" className="bh-btn" onClick={load}>Yenile</button></div>
      {message ? <div className="bh-notice success">{message}</div> : null}
      {error ? <div className="bh-notice danger">{error}</div> : null}

      {view === "products" ? <section className="bh-product-card-grid">{filteredProducts.map((row) => {
        const stock = stockByProduct.get(String(row.id)) || {};
        const approved = row.approvalStatus === "APPROVED";
        return <article className="bh-product-card" key={row.id}><div className="bh-product-visual">{String(row.productName || "Ü").slice(0, 2).toLocaleUpperCase("tr-TR")}</div><div className="bh-product-card-head"><div><h3>{row.productName}</h3><p>{row.tradeName || row.code || "Ticari ad belirtilmedi"}</p></div><span className={`bh-approval-mark ${approved ? "approved" : "waiting"}`}>{approved ? "✓" : "!"}</span></div><dl><div><dt>Firma</dt><dd>{row.supplierName || row.companyName || "-"}</dd></div><div><dt>Boya türü</dt><dd>{row.dyeType || "-"}</dd></div><div><dt>Son lot</dt><dd>{stock.lastLot || "-"}</dd></div><div><dt>Kalan</dt><dd>{formatKg(stock.remainingKg)}</dd></div><div><dt>Güncel fiyat</dt><dd>{Number(row.currentPrice || 0) ? `${Number(row.currentPrice).toLocaleString("tr-TR")} ${row.currency || "TL"}` : "-"}</dd></div><div><dt>Belgeler</dt><dd>{safeArray(row.documents || row.standards).length}</dd></div></dl><div className={`bh-product-approval ${approved ? "approved" : "waiting"}`}>{statusText(row.approvalStatus)}</div>{!approved ? <button type="button" className="bh-btn primary wide" disabled={busy} onClick={() => approveProduct(row)}>Evrakları Teyit Et ve Onayla</button> : <span className="bh-status green">İmalat kullanımına açık</span>}</article>;
      })}{!filteredProducts.length ? <div className="bh-empty large">Ürün kartı bulunamadı.</div> : null}</section> : null}

      {view === "lots" ? <div className="bh-lot-layout"><section className="bh-card"><div className="bh-card-head"><div><h2>Lot Bekleyenler</h2><small>Lot numarası gelmemiş muhasebe veya imalat girişleri</small></div><button type="button" className="bh-btn primary" onClick={() => setLotModal(true)}>Toplu / Tekli Lot Gir</button></div><div className="bh-card-body"><div className="bh-table-wrap wide"><table><thead><tr><th>Ürün</th><th>Firma</th><th>Kaynak</th><th>Giriş tarihi</th><th>Miktar</th><th>Belge / Fatura</th><th>İşlem</th></tr></thead><tbody>{waitingRows.map((row, index) => <tr key={row.id || index}><td>{row.productName || "-"}</td><td>{row.supplierName || row.companyName || "-"}</td><td>{row.source || row.sourceType || "-"}</td><td>{formatDate(row.entryDate || row.createdAt)}</td><td>{formatKg(row.entryKg || row.quantity)}</td><td>{row.invoiceNo || row.documentNo || "-"}</td><td><button type="button" className="bh-btn mini primary" onClick={() => setLotModal(true)}>Lot Gir</button></td></tr>)}</tbody></table></div>{!waitingRows.length ? <div className="bh-empty">Lot bekleyen kayıt yok.</div> : null}</div></section>
        <section className="bh-card"><div className="bh-card-head"><div><h2>Aktif Lotlar</h2><small>Varsayılan lot ve kalan miktar</small></div></div><div className="bh-card-body"><div className="bh-table-wrap wide"><table><thead><tr><th>Ürün</th><th>Lot</th><th>Firma</th><th>Giriş</th><th>Kullanılan</th><th>Kalan</th><th>Varsayılan</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{activeLots.map((row) => <tr key={row.id}><td><strong>{row.productName}</strong></td><td>{row.lotNo}</td><td>{row.supplierName || "-"}</td><td>{formatKg(row.entryKg)}</td><td>{formatKg(row.usedKg)}</td><td><strong>{formatKg(row.remainingKg)}</strong></td><td>{row.isDefault ? "Evet" : "Hayır"}</td><td><span className={`bh-status ${row.status === "QUARANTINE" ? "orange" : "green"}`}>{statusText(row.status)}</span></td><td><div className="bh-row-actions"><button type="button" className="bh-btn mini primary" onClick={() => setMovementLot(row)}>Hareket</button><button type="button" className="bh-btn mini" onClick={() => lotAction(row.id, "SET_DEFAULT")}>Varsayılan</button><button type="button" className="bh-btn mini" onClick={() => lotAction(row.id, "QUARANTINE")}>Karantina</button><button type="button" className="bh-btn mini danger" onClick={() => lotAction(row.id, "FINISH")}>Lot Bitti</button></div></td></tr>)}</tbody></table></div></div></section>
        <section className="bh-card"><div className="bh-card-head"><div><h2>Geçmiş Lotlar</h2><small>Biten ve pasif lotlar silinmez</small></div></div><div className="bh-card-body"><div className="bh-table-wrap wide"><table><thead><tr><th>Ürün</th><th>Lot</th><th>Firma</th><th>Giriş tarihi</th><th>Kullanım başlangıcı</th><th>Bitiş</th><th>Giriş</th><th>Kalan</th><th>Kaynak</th><th>Durum</th></tr></thead><tbody>{historyLots.map((row) => <tr key={row.id}><td>{row.productName}</td><td>{row.lotNo}</td><td>{row.supplierName || "-"}</td><td>{formatDate(row.entryDate || row.createdAt)}</td><td>{formatDate(row.usageStartedAt)}</td><td>{formatDate(row.finishedAt || row.updatedAt)}</td><td>{formatKg(row.entryKg)}</td><td>{formatKg(row.remainingKg)}</td><td>{row.source || row.sourceType || "-"}</td><td>{statusText(row.status)}</td></tr>)}</tbody></table></div></div></section></div> : null}

      {view === "movements" ? <section className="bh-card"><div className="bh-card-head"><div><h2>Stok Hareketleri</h2><small>Yanlış kayıt silinmez; iptal veya ters hareket oluşturulur.</small></div></div><div className="bh-card-body"><div className="bh-table-wrap wide"><table><thead><tr><th>Tarih-saat</th><th>Ürün</th><th>Lot</th><th>İşlem</th><th>Miktar</th><th>Model</th><th>Kaynak</th><th>Kullanıcı</th><th>Durum</th></tr></thead><tbody>{filteredMovements.map((row) => <tr key={row.id}><td>{formatDate(row.createdAt || row.movementAt)}</td><td>{row.productName || "-"}</td><td>{row.lotNo || "-"}</td><td>{movementText(row.type || row.movementType)}</td><td>{formatKg(row.quantityKg || row.quantity)}</td><td>{row.modelName || row.modelSnapshot || "-"}</td><td>{row.source || row.sourceType || "-"}</td><td>{row.actor || row.createdBy || "KY ERP"}</td><td>{row.status || "Kayıtlı"}</td></tr>)}</tbody></table></div>{!filteredMovements.length ? <div className="bh-empty">Stok hareketi bulunamadı.</div> : null}</div></section> : null}

      {productModal ? <ApprovedProductModal busy={busy} onCancel={() => setProductModal(false)} onSave={saveProduct} /> : null}
      {lotModal ? <AddLotModal products={products.filter((row) => row.approvalStatus === "APPROVED")} busy={busy} onCancel={() => setLotModal(false)} onSave={saveLot} /> : null}
      {movementLot ? <StockMovementModal lot={movementLot} busy={busy} onCancel={() => setMovementLot(null)} onSave={saveMovement} /> : null}
    </div>
  );
}
