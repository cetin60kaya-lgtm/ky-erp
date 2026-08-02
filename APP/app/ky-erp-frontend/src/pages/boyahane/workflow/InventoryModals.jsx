import { useState } from "react";

function emptyDocument() {
  return {
    id: globalThis.crypto?.randomUUID?.() || `document-${Date.now()}-${Math.random()}`,
    name: "",
    status: "WAITING",
    fileName: "",
    documentDate: "",
    validUntil: "",
    note: "",
  };
}

export function ApprovedProductModal({ busy, onCancel, onSave }) {
  const [form, setForm] = useState({
    productName: "",
    tradeName: "",
    code: "",
    supplierName: "",
    dyeType: "GENEL",
    unit: "KG",
    minStockKg: "",
    currentPrice: "",
    currency: "TRY",
    note: "",
    documents: [emptyDocument()],
  });
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  function updateDocument(index, key, value) {
    setForm((current) => ({
      ...current,
      documents: current.documents.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row),
    }));
  }

  return (
    <div className="bh-modal" role="dialog" aria-modal="true">
      <form
        className="bh-modal-card bh-product-modal"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...form,
            minStockKg: Number(form.minStockKg || 0),
            currentPrice: Number(form.currentPrice || 0),
            approvalStatus: "REVIEW_REQUIRED",
            documents: form.documents.filter((row) => row.name.trim()),
          });
        }}
      >
        <h2>Yeni Boyahane Ürünü</h2>
        <p className="bh-modal-note">Yeni ürün otomatik onaylı olmaz. Önce evrakları teyit edilir; yetkili onayından sonra imalat reçetesinde kullanılabilir.</p>
        <div className="bh-form-grid two">
          <label className="bh-field"><span>Ürün adı</span><input required value={form.productName} onChange={(event) => set("productName", event.target.value)} placeholder="Örn. S10 Clear" /></label>
          <label className="bh-field"><span>Ticari ürün adı</span><input value={form.tradeName} onChange={(event) => set("tradeName", event.target.value)} /></label>
          <label className="bh-field"><span>Ürün kodu</span><input value={form.code} onChange={(event) => set("code", event.target.value)} /></label>
          <label className="bh-field"><span>Firma / Tedarikçi</span><input value={form.supplierName} onChange={(event) => set("supplierName", event.target.value)} /></label>
          <label className="bh-field"><span>Boya / ürün türü</span><input required value={form.dyeType} onChange={(event) => set("dyeType", event.target.value)} placeholder="SUBAZLI, PİGMENT, KİMYASAL…" /></label>
          <label className="bh-field"><span>Birim</span><select value={form.unit} onChange={(event) => set("unit", event.target.value)}><option value="KG">KG</option><option value="LT">LT</option><option value="ADET">ADET</option></select></label>
          <label className="bh-field"><span>Minimum stok</span><input type="number" min="0" step="0.001" value={form.minStockKg} onChange={(event) => set("minStockKg", event.target.value)} /></label>
          <label className="bh-field"><span>Güncel fiyat</span><div className="bh-inline-fields"><input type="number" min="0" step="0.01" value={form.currentPrice} onChange={(event) => set("currentPrice", event.target.value)} /><select value={form.currency} onChange={(event) => set("currency", event.target.value)}><option value="TRY">TL</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option></select></div></label>
          <label className="bh-field wide"><span>Not</span><textarea value={form.note} onChange={(event) => set("note", event.target.value)} /></label>
        </div>

        <div className="bh-modal-section-head"><div><h3>Belge ve Standartlar</h3><p>MSDS, TDS, ZDHC, SVL, LCW veya müşteri onayı gibi sınırsız kayıt eklenebilir.</p></div><button type="button" className="bh-btn" onClick={() => setForm((current) => ({ ...current, documents: [...current.documents, emptyDocument()] }))}>+ Belge / Standart Ekle</button></div>
        <div className="bh-document-editor-list">{form.documents.map((row, index) => <section key={row.id} className="bh-document-editor"><div className="bh-form-grid three"><label className="bh-field"><span>Ad</span><input value={row.name} onChange={(event) => updateDocument(index, "name", event.target.value)} placeholder="MSDS, TDS, ZDHC…" /></label><label className="bh-field"><span>Durum</span><select value={row.status} onChange={(event) => updateDocument(index, "status", event.target.value)}><option value="AVAILABLE">Var</option><option value="MISSING">Yok</option><option value="WAITING">Bekleniyor</option><option value="EXPIRED">Süresi dolmuş</option></select></label><label className="bh-field"><span>Dosya adı / bağlantı</span><input value={row.fileName} onChange={(event) => updateDocument(index, "fileName", event.target.value)} placeholder="Belge PDF veya görsel adı" /></label><label className="bh-field"><span>Belge tarihi</span><input type="date" value={row.documentDate} onChange={(event) => updateDocument(index, "documentDate", event.target.value)} /></label><label className="bh-field"><span>Geçerlilik bitişi</span><input type="date" value={row.validUntil} onChange={(event) => updateDocument(index, "validUntil", event.target.value)} /></label><label className="bh-field"><span>Açıklama</span><input value={row.note} onChange={(event) => updateDocument(index, "note", event.target.value)} /></label></div><button type="button" className="bh-btn mini danger" onClick={() => setForm((current) => ({ ...current, documents: current.documents.filter((_, rowIndex) => rowIndex !== index) }))}>Belgeyi Çıkar</button></section>)}</div>

        <div className="bh-notice warning">İlk durum: Evrakları Teyit Et / Onay Bekliyor. Bu ürün numunede uyarıyla seçilebilir; imalatta yetkili onayı olmadan kullanılamaz.</div>
        <div className="bh-modal-actions"><button type="button" className="bh-btn" onClick={onCancel}>İptal</button><button className="bh-btn primary" disabled={busy}>Ürün Kartını Oluştur</button></div>
      </form>
    </div>
  );
}

export function StockMovementModal({ lot, busy, onCancel, onSave }) {
  const [form, setForm] = useState({ type: "OUT", quantity: "", modelName: "", source: "MANUAL", note: "" });
  const remaining = Number(lot?.remainingKg ?? lot?.remainingQuantity ?? 0);

  return (
    <div className="bh-modal" role="dialog" aria-modal="true">
      <form className="bh-modal-card" onSubmit={(event) => { event.preventDefault(); onSave({ ...form, quantity: Number(form.quantity || 0) }); }}>
        <h2>Lot Stok Hareketi</h2>
        <p className="bh-modal-note">{lot?.productName} · {lot?.lotNo} · Mevcut: {remaining.toLocaleString("tr-TR")} {lot?.unit || "KG"}</p>
        <div className="bh-form-grid two">
          <label className="bh-field"><span>Hareket</span><select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}><option value="OUT">Sarf / Çıkış</option><option value="IN">Ek Giriş</option><option value="RETURN">İade</option><option value="FIRE">Fire</option><option value="ADJUSTMENT_OUT">Sayım Eksiği</option><option value="ADJUSTMENT_IN">Sayım Fazlası</option></select></label>
          <label className="bh-field"><span>Miktar</span><input required type="number" min="0.001" step="0.001" max={form.type === "OUT" || form.type === "FIRE" || form.type === "ADJUSTMENT_OUT" ? remaining : undefined} value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} /></label>
          <label className="bh-field"><span>Model</span><input value={form.modelName} onChange={(event) => setForm((current) => ({ ...current, modelName: event.target.value }))} placeholder="Varsa ilgili model" /></label>
          <label className="bh-field"><span>Kaynak</span><select value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))}><option value="MANUAL">Elle hareket</option><option value="ACCOUNTING">Muhasebe</option><option value="SAMPLE">Numune</option><option value="PRODUCTION">İmalat</option><option value="COUNT">Sayım</option></select></label>
          <label className="bh-field wide"><span>Açıklama</span><textarea required value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Üretim, reçete, sayım, iade veya düzeltme açıklaması" /></label>
        </div>
        <div className="bh-notice warning">Çıkış hareketi kalan stoku aşamaz. Yanlış kayıt silinmez; ters hareket oluşturulur.</div>
        <div className="bh-modal-actions"><button type="button" className="bh-btn" onClick={onCancel}>İptal</button><button className="bh-btn primary" disabled={busy}>Hareketi Kaydet</button></div>
      </form>
    </div>
  );
}
