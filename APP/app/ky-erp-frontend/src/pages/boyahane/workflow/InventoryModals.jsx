import { useState } from "react";

export function ApprovedProductModal({ busy, onCancel, onSave }) {
  const [form, setForm] = useState({
    productName: "",
    code: "",
    dyeType: "GENEL",
    unit: "KG",
    minStockKg: "",
    note: "",
  });
  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <div className="bh-modal" role="dialog" aria-modal="true">
      <form
        className="bh-modal-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...form,
            minStockKg: Number(form.minStockKg || 0),
          });
        }}
      >
        <h2>Onaylı Boyahane Ürünü Ekle</h2>
        <p className="bh-modal-note">
          Fatura kalemleri ve lotlar yalnız bu listede onaylanmış ürünlere
          bağlanır.
        </p>
        <div className="bh-form-grid two">
          <label className="bh-field">
            <span>Ürün adı</span>
            <input
              required
              value={form.productName}
              onChange={(event) => set("productName", event.target.value)}
              placeholder="Örn. Reaktif Kırmızı Boya"
            />
          </label>
          <label className="bh-field">
            <span>Ürün kodu</span>
            <input
              value={form.code}
              onChange={(event) => set("code", event.target.value)}
            />
          </label>
          <label className="bh-field">
            <span>Boya / ürün türü</span>
            <input
              required
              value={form.dyeType}
              onChange={(event) => set("dyeType", event.target.value)}
              placeholder="REAKTİF, PİGMENT, KİMYASAL..."
            />
          </label>
          <label className="bh-field">
            <span>Birim</span>
            <select
              value={form.unit}
              onChange={(event) => set("unit", event.target.value)}
            >
              <option value="KG">KG</option>
              <option value="LT">LT</option>
              <option value="ADET">ADET</option>
            </select>
          </label>
          <label className="bh-field">
            <span>Minimum stok</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={form.minStockKg}
              onChange={(event) => set("minStockKg", event.target.value)}
            />
          </label>
          <label className="bh-field wide">
            <span>Not</span>
            <textarea
              value={form.note}
              onChange={(event) => set("note", event.target.value)}
            />
          </label>
        </div>
        <div className="bh-modal-actions">
          <button type="button" className="bh-btn" onClick={onCancel}>
            İptal
          </button>
          <button className="bh-btn primary" disabled={busy}>
            Onaylı Ürünü Kaydet
          </button>
        </div>
      </form>
    </div>
  );
}

export function StockMovementModal({ lot, busy, onCancel, onSave }) {
  const [form, setForm] = useState({
    type: "OUT",
    quantity: "",
    note: "",
  });
  const remaining = Number(lot?.remainingKg ?? lot?.remainingQuantity ?? 0);

  return (
    <div className="bh-modal" role="dialog" aria-modal="true">
      <form
        className="bh-modal-card"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...form,
            quantity: Number(form.quantity || 0),
          });
        }}
      >
        <h2>Lot Stok Hareketi</h2>
        <p className="bh-modal-note">
          {lot?.productName} · {lot?.lotNo} · Mevcut: {remaining.toLocaleString("tr-TR")} {lot?.unit || "KG"}
        </p>
        <div className="bh-form-grid two">
          <label className="bh-field">
            <span>Hareket</span>
            <select
              value={form.type}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  type: event.target.value,
                }))
              }
            >
              <option value="OUT">Sarf / Çıkış</option>
              <option value="IN">Ek Giriş</option>
              <option value="ADJUSTMENT_OUT">Sayım Eksiği</option>
              <option value="ADJUSTMENT_IN">Sayım Fazlası</option>
            </select>
          </label>
          <label className="bh-field">
            <span>Miktar</span>
            <input
              required
              type="number"
              min="0.001"
              step="0.001"
              value={form.quantity}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  quantity: event.target.value,
                }))
              }
            />
          </label>
          <label className="bh-field wide">
            <span>Açıklama</span>
            <textarea
              required
              value={form.note}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  note: event.target.value,
                }))
              }
              placeholder="Üretim, reçete, sayım veya düzeltme açıklaması"
            />
          </label>
        </div>
        <div className="bh-modal-actions">
          <button type="button" className="bh-btn" onClick={onCancel}>
            İptal
          </button>
          <button className="bh-btn primary" disabled={busy}>
            Hareketi Kaydet
          </button>
        </div>
      </form>
    </div>
  );
}
