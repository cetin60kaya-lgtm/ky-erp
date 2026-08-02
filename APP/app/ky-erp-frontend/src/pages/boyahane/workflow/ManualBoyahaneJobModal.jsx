import { useState } from "react";
import { createManualBoyahaneJob } from "../../../services/boyahaneManualApi";

const PAINT_TYPES = ["SUBAZLI", "PIGMENT", "ECO YÜKSEK", "ECOPLAST", "SİLİKON", "AŞINDIRMA", "FİKSATÖR", "UV", "DİĞER"];
const COLOR_FAMILIES = ["", "KIRMIZI", "SARI", "MAVİ", "YEŞİL", "TURUNCU", "MOR", "PEMBE", "TURKUAZ", "BEYAZ", "SİYAH", "GRİ", "DİĞER"];

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
    sourceType: "PANTONE",
    pantone: "",
    referenceName: "",
    referenceCode: "",
    referenceNote: "",
    referenceImageUrl: "",
    colorHex: "#cbd5e1",
    colorFamily: "",
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
        basePantone: form.sourceType === "REFERENCE" ? form.pantone : "",
        isPantoneExact: form.sourceType === "PANTONE",
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
      <form className="bh-modal-card bh-manual-job-modal bh-color-source-modal" onSubmit={submit}>
        <button type="button" className="bh-modal-close" disabled={busy} onClick={onClose}>Kapat</button>
        <h2>{mode === "sample" ? "Yeni Desen ve Numune İşi Aç" : "Yeni Desen ve İmalat İşi Aç"}</h2>
        <p className="bh-modal-note">Desen havuzunu beklemeden iş ve ilk kayıtlı renk kartı birlikte oluşturulur.</p>
        {error ? <div className="bh-notice danger">{error}</div> : null}

        <div className="bh-form-grid three">
          <label className="bh-field"><span>Model / desen adı</span><input required autoFocus value={form.modelName} onChange={(event) => set("modelName", event.target.value)} placeholder="Örn. SONIC 19" /></label>
          <label className="bh-field"><span>Firma</span><input value={form.companyName} onChange={(event) => set("companyName", event.target.value)} placeholder="Müşteri firma" /></label>
          <label className="bh-field"><span>Sipariş no</span><input value={form.orderNo} onChange={(event) => set("orderNo", event.target.value)} /></label>
          <label className="bh-field"><span>Baskı bölgesi</span><input value={form.printRegion} onChange={(event) => set("printRegion", event.target.value)} /></label>
          <label className="bh-field"><span>Kanal sayısı</span><input type="number" min="1" step="1" value={form.channelCount} onChange={(event) => set("channelCount", event.target.value)} /></label>
          <label className="bh-field"><span>Öncelik</span><select value={form.priority} onChange={(event) => set("priority", event.target.value)}><option value="NORMAL">Normal</option><option value="HIGH">Öncelikli</option><option value="URGENT">Acil</option><option value="LOW">Düşük</option></select></label>
        </div>

        <div className="bh-source-choice">
          <strong>İlk renk hangi kaynağa göre hazırlanacak?</strong>
          <div className="bh-source-choice-grid">
            {[
              ["PANTONE", "Pantoneye göre", "Standart Pantone hedefi."],
              ["REFERENCE", "Renk referansına göre", "Kumaş veya müşteri referansı Pantone'den farklıdır."],
              ["VISUAL", "Görsel / RGB’ye göre", "Pantone yok; yakın renk kutusu seçilir."],
            ].map(([key, title, note]) => <label key={key} className={form.sourceType === key ? "active" : ""}><input type="radio" name="sourceType" value={key} checked={form.sourceType === key} onChange={(event) => set("sourceType", event.target.value)} /><span><b>{title}</b><small>{note}</small></span></label>)}
          </div>
        </div>

        <div className="bh-form-grid three">
          <label className="bh-field"><span>İlk renk adı</span><input required value={form.colorName} onChange={(event) => set("colorName", event.target.value)} placeholder="Saks, kavun, açık yeşil…" /></label>
          <label className="bh-field"><span>Boya türü</span><select value={form.paintType} onChange={(event) => set("paintType", event.target.value)}>{PAINT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="bh-field"><span>Renk ailesi</span><select value={form.colorFamily} onChange={(event) => set("colorFamily", event.target.value)}>{COLOR_FAMILIES.map((item) => <option key={item || "auto"} value={item}>{item || "Renk kutusundan otomatik"}</option>)}</select></label>

          {form.sourceType !== "VISUAL" ? <label className="bh-field"><span>{form.sourceType === "REFERENCE" ? "Baz alınan Pantone (isteğe bağlı)" : "Pantone"}</span><input required={form.sourceType === "PANTONE"} value={form.pantone} onChange={(event) => set("pantone", event.target.value)} placeholder="19-4151" /></label> : null}
          {form.sourceType === "REFERENCE" ? <><label className="bh-field"><span>Kumaş / renk referansı</span><input required={!form.referenceCode} value={form.referenceName} onChange={(event) => set("referenceName", event.target.value)} placeholder="Müşteri kumaş referansı" /></label><label className="bh-field"><span>Referans kodu</span><input value={form.referenceCode} onChange={(event) => set("referenceCode", event.target.value)} placeholder="REF-2026-014" /></label><label className="bh-field wide"><span>Referans notu</span><input value={form.referenceNote} onChange={(event) => set("referenceNote", event.target.value)} placeholder="Pantone dışına çıkıldı; kumaşa göre yapıldı." /></label></> : null}
          {form.sourceType !== "PANTONE" ? <label className="bh-field bh-color-picker-field"><span>Yakın renk kutusu</span><div><input type="color" value={form.colorHex} onChange={(event) => set("colorHex", event.target.value)} /><input value={form.colorHex} onChange={(event) => set("colorHex", event.target.value)} /></div></label> : null}

          <label className="bh-field"><span>{mode === "sample" ? "Numune planı KG" : "Planlanan boya KG"}</span><input type="number" min="0" step="0.001" value={form.plannedKg} onChange={(event) => set("plannedKg", event.target.value)} /></label>
          <label className="bh-field"><span>Planlanan adet</span><input type="number" min="0" step="1" value={form.plannedQuantity} onChange={(event) => set("plannedQuantity", event.target.value)} /></label>
          <label className="bh-field"><span>Model görseli bağlantısı</span><input value={form.imageUrl} onChange={(event) => set("imageUrl", event.target.value)} placeholder="İsteğe bağlı" /></label>
        </div>

        <div className="bh-notice success">İş açıldığında renk doğrudan Kayıtlı Renkler'e düşer. Reçete ve versiyon, numune veya imalat kaydında oluşur.</div>
        <div className="bh-modal-actions">
          <button type="button" className="bh-btn" disabled={busy} onClick={onClose}>Vazgeç</button>
          <button className="bh-btn primary" disabled={busy}>{busy ? "İş açılıyor…" : "Yeni Deseni ve İşi Aç"}</button>
        </div>
      </form>
    </div>
  );
}
