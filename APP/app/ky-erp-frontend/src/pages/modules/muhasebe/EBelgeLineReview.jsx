import { useEffect, useMemo, useState } from "react";
import { Check, LoaderCircle, Search } from "lucide-react";
import {
  getEBelgeProductSuggestions,
  saveEBelgeProductAlias,
  updateEBelgeLine,
} from "../../../services/eBelgeApi";
import "./eBelgeLineReview.css";

export default function EBelgeLineReview({ documentId, line, onChanged }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(line?.description || line?.product_code || "");
  const [products, setProducts] = useState([]);
  const [lotNo, setLotNo] = useState(line?.raw_metadata?.lotNo || "");
  const [selected, setSelected] = useState(null);
  const [saveAlias, setSaveAlias] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const chemical = Boolean(line?.raw_metadata?.chemical);
  const needsReview = !line?.product_id || (chemical && !line?.raw_metadata?.lotNo);
  const label = useMemo(() => {
    if (!line?.product_id) return "Ürünü eşleştir";
    if (chemical && !line?.raw_metadata?.lotNo) return "LOT gir";
    return "Düzenle";
  }, [line, chemical]);

  useEffect(() => {
    if (!open || query.trim().length < 1) { setProducts([]); return; }
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

  return <div className={`eb-line-review ${needsReview ? "needs" : ""}`}>
    <button type="button" className="eb-line-review-trigger" onClick={() => setOpen((value) => !value)}>{label}</button>
    {open && <div className="eb-line-review-popover">
      <strong>{line?.description || "Ürün kalemi"}</strong>
      {!line?.product_id && <>
        <label><span>Ürün kartı</span><div className="eb-line-review-search"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ürün ara" /></div></label>
        {products.length > 0 && <div className="eb-line-review-results">{products.map((product) => <button type="button" key={product.id} className={selected?.id === product.id ? "selected" : ""} onClick={() => setSelected(product)}><span>{product.name}</span><small>{product.legacy_id || product.unit || ""}</small></button>)}</div>}
        <label className="eb-line-review-check"><input type="checkbox" checked={saveAlias} onChange={(e) => setSaveAlias(e.target.checked)} /><span>Bu fatura açıklamasını ürün alias’ı olarak kaydet</span></label>
      </>}
      {(chemical || line?.raw_metadata?.routingType === "BOYAHANE") && <label><span>LOT No</span><input value={lotNo} onChange={(e) => setLotNo(e.target.value)} placeholder="LOT numarasını girin" /></label>}
      {message && <small className="eb-line-review-message">{message}</small>}
      <button type="button" className="eb-line-review-save" disabled={busy || (!line?.product_id && !selected?.id)} onClick={save}>{busy ? <LoaderCircle className="eb-spin" size={15} /> : <Check size={15} />} Kaydet</button>
    </div>}
  </div>;
}
