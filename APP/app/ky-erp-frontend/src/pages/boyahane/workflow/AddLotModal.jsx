import { useState } from "react";

export default function AddLotModal({ products, initialProductId, busy, onCancel, onSave }) {
  const [form, setForm] = useState({ inventoryId: initialProductId || "", lotNo: "", entryKg: "", supplierName: "", invoiceNo: "", isDefault: true });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="bh-modal" role="dialog" aria-modal="true">
      <form className="bh-modal-card" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <h2>Yeni Lot Ekle</h2>
        <div className="bh-form-grid two">
          <label className="bh-field"><span>Ürün</span><select required value={form.inventoryId} onChange={(event) => set("inventoryId", event.target.value)}><option value="">Seçin</option>{products.map((row) => <option key={row.id} value={row.id}>{row.productName}</option>)}</select></label>
          <label className="bh-field"><span>Lot numarası</span><input required value={form.lotNo} onChange={(event) => set("lotNo", event.target.value)} /></label>
          <label className="bh-field"><span>Giriş KG</span><input required type="number" min="0.001" step="0.001" value={form.entryKg} onChange={(event) => set("entryKg", event.target.value)} /></label>
          <label className="bh-field"><span>Firma</span><input value={form.supplierName} onChange={(event) => set("supplierName", event.target.value)} /></label>
          <label className="bh-field"><span>Fatura numarası</span><input value={form.invoiceNo} onChange={(event) => set("invoiceNo", event.target.value)} /></label>
          <label className="bh-check"><input type="checkbox" checked={form.isDefault} onChange={(event) => set("isDefault", event.target.checked)} /> Varsayılan lot</label>
        </div>
        <div className="bh-modal-actions"><button type="button" className="bh-btn" onClick={onCancel}>İptal</button><button className="bh-btn primary" disabled={busy}>Lotu Kaydet</button></div>
      </form>
    </div>
  );
}
