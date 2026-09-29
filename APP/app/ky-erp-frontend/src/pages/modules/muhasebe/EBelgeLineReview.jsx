import { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Search, X } from "lucide-react";
import {
  getEBelgeProductSuggestions,
  saveEBelgeProductAlias,
  updateEBelgeLine,
} from "../../../services/eBelgeApi";
import "./eBelgeLineReview.css";

const EXPENSE_CATEGORIES = ["Mal ve Hizmet Alımı", "Kimya / Boya", "Stok / Malzeme Alımı", "Nakliye", "Ambalaj", "Bakım / Onarım", "Yemek", "Personel", "Kira", "Elektrik", "Su", "İnternet", "Araç", "Muhasebe", "Banka Masrafı", "Dış Hizmet", "Kumaş / Yardımcı Malzeme", "Diğer"];
const upper = (value) => String(value || "").toUpperCase();
const isInvoice = (value) => /FATURA|INVOICE|ARSIV|IADE/.test(upper(value));
const isDispatch = (value) => /IRSALIYE|DISPATCH|DESPATCH/.test(upper(value));

export default function EBelgeLineReview({ documentId, documentType, line, onChanged, hasCounterDocument = false }) {
  const raw = line?.raw_metadata || {};
  const routingType = upper(raw.routingType || "EXPENSE");
  const initialLot = isInvoice(documentType) ? (raw.invoiceLotNo || raw.lotNo || "") : isDispatch(documentType) ? (raw.dispatchLotNo || raw.lotNo || "") : (raw.lotNo || "");
  const defaultExpense = routingType === "BOYAHANE" ? "Kimya / Boya" : routingType === "STOCK" ? "Stok / Malzeme Alımı" : routingType === "CONSUMABLE" ? "Kumaş / Yardımcı Malzeme" : "Mal ve Hizmet Alımı";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(line?.description || line?.product_code || "");
  const [products, setProducts] = useState([]);
  const [lotNo, setLotNo] = useState(initialLot);
  const [expenseCategoryName, setExpenseCategoryName] = useState(raw.expenseCategoryName || defaultExpense);
  const [rememberExpenseRule, setRememberExpenseRule] = useState(false);
  const [selected, setSelected] = useState(null);
  const [saveAlias, setSaveAlias] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lotRequired = Boolean(raw.lotRequired || raw.lotPolicy === "REQUIRED" || routingType === "BOYAHANE");
  const lotStatus = upper(raw.lotReconciliationStatus);
  const lotResolved = Boolean(initialLot || raw.lotCanPostStock === true || ["FROM_DISPATCH", "FROM_DISPATCH_MULTI", "FROM_INVOICE", "VERIFIED"].includes(lotStatus));
  const lotMissingConfirmed = lotRequired && lotStatus === "MISSING_REQUIRED" && hasCounterDocument;
  const lotWaiting = lotRequired && !lotResolved && !lotMissingConfirmed;
  const productRequired = routingType !== "EXPENSE" || lotRequired;
  const needsReview = (productRequired && !line?.product_id) || lotMissingConfirmed;
  const label = useMemo(() => {
    if (!line?.product_id && productRequired) return "Ürünü eşleştir";
    if (lotMissingConfirmed) return "LOT gir";
    if (lotWaiting) return isInvoice(documentType) ? "İrsaliye / LOT bekleniyor" : isDispatch(documentType) ? "Fatura / LOT bekleniyor" : "LOT bekleniyor";
    return "Düzenle";
  }, [documentType, line?.product_id, lotMissingConfirmed, lotWaiting, productRequired]);

  useEffect(() => {
    if (!open) {
      setLotNo(initialLot);
      setExpenseCategoryName(raw.expenseCategoryName || defaultExpense);
      setSelected(null);
    }
  }, [defaultExpense, initialLot, open, raw.expenseCategoryName]);

  useEffect(() => {
    if (!open || query.trim().length < 1) { setProducts([]); return undefined; }
    const timer = window.setTimeout(() => {
      getEBelgeProductSuggestions(query).then(setProducts).catch(() => setProducts([]));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  const save = async () => {
    setBusy(true); setMessage("");
    try {
      const result = await updateEBelgeLine(documentId, line.id, {
        ...(selected?.id ? { productId: selected.id } : {}),
        lotNo,
        expenseCategoryName,
        rememberExpenseRule,
      });
      if (saveAlias && selected?.id && line?.description?.trim()) {
        await saveEBelgeProductAlias(selected.id, line.description.trim(), documentId);
      }
      setMessage("Kaydedildi");
      setOpen(false);
      onChanged?.(result);
    } catch (error) { setMessage(error.message || "Kalem güncellenemedi."); }
    finally { setBusy(false); }
  };

  const lotLabel = isInvoice(documentType) ? "Fatura LOT No" : isDispatch(documentType) ? "İrsaliye LOT No" : "LOT No";

  return <div className={`eb-line-review ${needsReview ? "needs" : ""}`}>
    <button type="button" className="eb-line-review-trigger" onClick={() => setOpen(true)}>{label}</button>
    {open && <div className="eb-line-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="eb-line-modal">
        <header>
          <div><small>KALEM İŞLEMİ</small><h3>{line?.description || "Ürün kalemi"}</h3></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Kapat"><X size={18} /></button>
        </header>
        <div className="eb-line-modal-summary">
          <span><small>Miktar</small><strong>{Number(line?.quantity || 0).toLocaleString("tr-TR")} {line?.unit_code || ""}</strong></span>
          <span><small>Yönlendirme</small><strong>{routingType === "BOYAHANE" ? "Boyahane / LOT" : routingType === "STOCK" ? "Stok" : routingType === "CONSUMABLE" ? "Sarf" : "Gider"}</strong></span>
          <span><small>LOT Durumu</small><strong>{initialLot || (lotRequired ? "Bekliyor" : "Yok")}</strong></span>
        </div>
        <div className="eb-line-modal-body">
          {!line?.product_id && <section className="eb-line-modal-section">
            <strong>Ürün Eşleştirme</strong>
            <div className="eb-line-review-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ürün ara" /></div>
            {products.length > 0 && <div className="eb-line-review-results">{products.map((product) => <button type="button" key={product.id} className={selected?.id === product.id ? "selected" : ""} onClick={() => setSelected(product)}><span>{product.name}</span><small>{product.legacy_id || product.unit || ""}</small></button>)}</div>}
            <label className="eb-line-review-check"><input type="checkbox" checked={saveAlias} onChange={(e) => setSaveAlias(e.target.checked)} /><span>Bu açıklamayı ürün eşleştirmesi olarak hatırla</span></label>
          </section>}
          <section className="eb-line-modal-section two-col">
            <label><span>Gider kategorisi</span><input list={`expense-categories-${line?.id}`} value={expenseCategoryName} onChange={(e) => { setExpenseCategoryName(e.target.value); setRememberExpenseRule(true); }} placeholder="Gider / rapor kategorisi" /><datalist id={`expense-categories-${line?.id}`}>{EXPENSE_CATEGORIES.map((category) => <option key={category} value={category} />)}</datalist></label>
            <label><span>{lotLabel}{lotRequired ? " · zorunlu" : " · varsa kaydet"}</span><input value={lotNo} onChange={(e) => setLotNo(e.target.value)} placeholder="LOT numarası" required={lotRequired} /></label>
          </section>
          <label className="eb-line-review-check"><input type="checkbox" checked={rememberExpenseRule} onChange={(e) => setRememberExpenseRule(e.target.checked)} /><span>Bu gider kategorisini bu firma/ürün için hatırla</span></label>
          {raw.expenseCategorySource === "EXPENSE_RULE" && <small className="eb-line-review-memory">Akıllı gider hafızasından uygulandı</small>}
          <small className="eb-line-review-memory">LOT kaynağı ayrı tutulur; fatura LOT’u ve irsaliye LOT’u birbirini ezmez.</small>
          {message && <small className="eb-line-review-message">{message}</small>}
        </div>
        <footer>
          <button type="button" onClick={() => setOpen(false)}>Vazgeç</button>
          <button type="button" className="eb-line-review-save" disabled={busy || (productRequired && !line?.product_id && !selected?.id) || (lotRequired && !lotNo.trim())} onClick={save}>{busy ? <LoaderCircle className="eb-spin" size={15} /> : <Check size={15} />} Kaydet</button>
        </footer>
      </section>
    </div>}
  </div>;
}
