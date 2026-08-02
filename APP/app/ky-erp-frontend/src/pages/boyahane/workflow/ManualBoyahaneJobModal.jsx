import { useState } from "react";
import { createManualBoyahaneJob } from "../../../services/boyahaneManualApi";

const PAINT_TYPES = [
  "SUBAZLI",
  "PIGMENT",
  "ECOPLAST",
  "SİLİKON",
  "AŞINDIRMA",
  "FİKSATÖR",
  "UV",
  "DİĞER",
];

export default function ManualBoyahaneJobModal({
  activeMainCompany,
  mode = "production",
  onClose,
  onCreated,
}) {
  const [form, setForm] = useState({
    modelName: "",
    companyName: "",
    orderNo: "",
    imageUrl: "",
    printRegion: "Tüm baskı bölgeleri",
    channelCount: 1,
    plannedQuantity: "",
    priority: "NORMAL",
    colorName: "",
    pantone: "",
    paintType: "SUBAZLI",
    plannedKg: mode === "sample" ? "0.25" : "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await createManualBoyahaneJob(activeMainCompany, {
        ...form,
        jobType: mode === "sample" ? "SAMPLE" : "PRODUCTION",
        channelCount: Number(form.channelCount || 1),
        uniqueColorCount: 1,
        plannedQuantity: Number(form.plannedQuantity || 0),
        plannedKg: Number(form.plannedKg || 0),
      });
      await onCreated?.(created);
    } catch (requestError) {
      setError(requestError?.message || "Yeni Boyahane işi açılamadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bh-modal" role="dialog" aria-modal="true">
      <form className="bh-modal-card bh-manual-job-modal" onSubmit={submit}>
        <button type="button" className="bh-modal-close" disabled={busy} onClick={onClose}>Kapat</button>
        <h2>{mode === "sample" ? "Yeni Desen ve Numune İşi Aç" : "Yeni Desen ve İmalat İşi Aç"}</h2>
        <p className="bh-modal-note">
          Desen havuzunu beklemeden Boyahane işi açılır. Model daha sonra Desen kaydıyla eşleştirilebilir; aynı model ve aynı iş türü ikinci kez açılmaz.
        </p>
        {error ? <div className="bh-notice danger">{error}</div> : null}

        <div className="bh-form-grid three">
          <label className="bh-field"><span>Model / desen adı</span><input required autoFocus value={form.modelName} onChange={(event) => set("modelName", event.target.value)} placeholder="Örn. SONIC 19" /></label>
          <label className="bh-field"><span>Firma</span><input value={form.companyName} onChange={(event) => set("companyName", event.target.value)} placeholder="Müşteri firma" /></label>
          <label className="bh-field"><span>Sipariş no</span><input value={form.orderNo} onChange={(event) => set("orderNo", event.target.value)} /></label>
          <label className="bh-field"><span>Baskı bölgesi</span><input value={form.printRegion} onChange={(event) => set("printRegion", event.target.value)} /></label>
          <label className="bh-field"><span>Kanal sayısı</span><input type="number" min="1" step="1" value={form.channelCount} onChange={(event) => set("channelCount", event.target.value)} /></label>
          <label className="bh-field"><span>Öncelik</span><select value={form.priority} onChange={(event) => set("priority", event.target.value)}><option value="NORMAL">Normal</option><option value="HIGH">Öncelikli</option><option value="URGENT">Acil</option><option value="LOW">Düşük</option></select></label>
          <label className="bh-field"><span>İlk renk adı</span><input required value={form.colorName} onChange={(event) => set("colorName", event.target.value)} placeholder="Örn. Kırmızı" /></label>
          <label className="bh-field"><span>Pantone / renk kodu</span><input required value={form.pantone} onChange={(event) => set("pantone", event.target.value)} placeholder="18-1663" /></label>
          <label className="bh-field"><span>Boya türü</span><select value={form.paintType} onChange={(event) => set("paintType", event.target.value)}>{PAINT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="bh-field"><span>{mode === "sample" ? "Numune planı KG" : "Planlanan boya KG"}</span><input type="number" min="0" step="0.001" value={form.plannedKg} onChange={(event) => set("plannedKg", event.target.value)} /></label>
          <label className="bh-field"><span>Planlanan adet</span><input type="number" min="0" step="1" value={form.plannedQuantity} onChange={(event) => set("plannedQuantity", event.target.value)} /></label>
          <label className="bh-field"><span>Görsel bağlantısı</span><input value={form.imageUrl} onChange={(event) => set("imageUrl", event.target.value)} placeholder="İsteğe bağlı" /></label>
        </div>

        <div className="bh-notice success">
          Kayıt açıldıktan sonra modelin diğer renkleri çalışma ekranındaki “Renk Ekle” düğmesiyle eklenir.
        </div>
        <div className="bh-modal-actions">
          <button type="button" className="bh-btn" disabled={busy} onClick={onClose}>Vazgeç</button>
          <button className="bh-btn primary" disabled={busy}>{busy ? "İş açılıyor…" : "Yeni Deseni ve İşi Aç"}</button>
        </div>
      </form>
    </div>
  );
}
