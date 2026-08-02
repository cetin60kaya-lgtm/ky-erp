import { useMemo, useState } from "react";
import ModelThumbnail from "./ModelThumbnail";

const PAINT_TYPES = ["SUBAZLI", "PIGMENT", "ECOPLAST", "SİLİKON", "AŞINDIRMA", "FİKSATÖR", "UV", "DİĞER"];
const COLOR_FAMILIES = ["", "KIRMIZI", "SARI", "MAVİ", "YEŞİL", "TURUNCU", "MOR", "PEMBE", "TURKUAZ", "BEYAZ", "SİYAH", "GRİ", "DİĞER"];

function sourceLabel(value) {
  return value === "REFERENCE" ? "Renk referansına göre" : value === "VISUAL" ? "Görsel / RGB’ye göre" : "Pantoneye göre";
}

export default function AddColorModal({ colors, job, busy, onCancel, onSave }) {
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    registeredColorId: "",
    sourceType: "PANTONE",
    pantone: "",
    basePantone: "",
    colorName: "",
    colorHex: "#cbd5e1",
    colorFamily: "",
    referenceName: "",
    referenceCode: "",
    referenceNote: "",
    referenceImageUrl: "",
    paintType: "SUBAZLI",
    recipeId: "",
    printRegion: job?.printRegion || "",
    plannedKg: "",
  });

  const filtered = useMemo(() => colors.filter((row) => {
    const text = [
      row.pantone,
      row.basePantone,
      row.colorName,
      row.referenceName,
      row.referenceCode,
      row.colorFamily,
      row.sourceLabel,
    ].join(" ").toLocaleLowerCase("tr-TR");
    return text.includes(search.toLocaleLowerCase("tr-TR"));
  }), [colors, search]);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const choose = (id) => {
    const color = colors.find((row) => row.id === id);
    if (!color) {
      setForm((current) => ({ ...current, registeredColorId: "", recipeId: "" }));
      return;
    }
    setForm((current) => ({
      ...current,
      registeredColorId: id,
      sourceType: color.sourceType || color.colorSource || (color.pantone ? "PANTONE" : "VISUAL"),
      pantone: color.pantone || color.basePantone || "",
      basePantone: color.basePantone || color.pantone || "",
      colorName: color.colorName || "",
      colorHex: color.colorHex || "#cbd5e1",
      colorFamily: color.colorFamily || "",
      referenceName: color.referenceName || "",
      referenceCode: color.referenceCode || color.customerColorCode || "",
      referenceNote: color.referenceNote || "",
      referenceImageUrl: color.referenceImageUrl || "",
      paintType: color.dyeType || color.paintType || "SUBAZLI",
      recipeId: color.recipes?.find((row) => row.status === "ACTIVE")?.id || color.recipes?.[0]?.id || "",
    }));
  };

  function submit(event) {
    event.preventDefault();
    if (form.sourceType === "PANTONE" && !form.pantone.trim()) return;
    if (form.sourceType === "REFERENCE" && !form.referenceName.trim() && !form.referenceCode.trim()) return;
    onSave({
      ...form,
      basePantone: form.sourceType === "REFERENCE" ? form.pantone : "",
      isPantoneExact: form.sourceType === "PANTONE",
    });
  }

  return (
    <div className="bh-modal" role="dialog" aria-modal="true">
      <form className="bh-modal-card bh-color-source-modal" onSubmit={submit}>
        <div className="bh-modal-model-head"><ModelThumbnail src={job?.imageUrl} alt={job?.modelName} size="medium" /><div><h2>Model Rengi Ekle</h2><p>{job?.modelName || "Model seçilmedi"}</p></div></div>

        <label className="bh-field"><span>Kayıtlı renk ara</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pantone, referans, renk adı veya renk ailesi" /></label>
        <label className="bh-field"><span>Kayıtlı renk</span><select value={form.registeredColorId} onChange={(event) => choose(event.target.value)}><option value="">Yeni renk</option>{filtered.map((row) => <option key={row.id} value={row.id}>{row.displayCode || row.pantone || row.referenceName || row.colorHex || "-"} / {row.colorName} · {sourceLabel(row.sourceType || row.colorSource)}</option>)}</select></label>

        <div className="bh-source-choice">
          <strong>Renk hangi kaynağa göre yapılacak?</strong>
          <div className="bh-source-choice-grid">
            {[
              ["PANTONE", "Pantoneye göre", "Standart Pantone hedeflenir."],
              ["REFERENCE", "Renk referansına göre", "Kumaş veya müşteri numunesi Pantone'den farklı olabilir."],
              ["VISUAL", "Görsel / RGB’ye göre", "Pantone yoksa boyacı yakın renk kutusunu seçer."],
            ].map(([key, title, note]) => <label key={key} className={form.sourceType === key ? "active" : ""}><input type="radio" name="sourceType" value={key} checked={form.sourceType === key} onChange={(event) => set("sourceType", event.target.value)} /><span><b>{title}</b><small>{note}</small></span></label>)}
          </div>
        </div>

        <div className="bh-form-grid three">
          <label className="bh-field"><span>Renk adı</span><input required value={form.colorName} onChange={(event) => set("colorName", event.target.value)} placeholder="Saks, kırmızı, açık yeşil…" /></label>
          <label className="bh-field"><span>Boya türü</span><select value={form.paintType} onChange={(event) => set("paintType", event.target.value)}>{PAINT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="bh-field"><span>Renk ailesi</span><select value={form.colorFamily} onChange={(event) => set("colorFamily", event.target.value)}>{COLOR_FAMILIES.map((item) => <option key={item || "auto"} value={item}>{item || "Renk kutusundan otomatik"}</option>)}</select></label>

          {form.sourceType !== "VISUAL" ? <label className="bh-field"><span>{form.sourceType === "REFERENCE" ? "Baz alınan Pantone (isteğe bağlı)" : "Pantone"}</span><input required={form.sourceType === "PANTONE"} value={form.pantone} onChange={(event) => set("pantone", event.target.value)} placeholder="19-4151" /></label> : null}

          {form.sourceType === "REFERENCE" ? <>
            <label className="bh-field"><span>Kumaş / renk referansı adı</span><input required={!form.referenceCode} value={form.referenceName} onChange={(event) => set("referenceName", event.target.value)} placeholder="Müşteri lacivert kumaş referansı" /></label>
            <label className="bh-field"><span>Referans kodu</span><input value={form.referenceCode} onChange={(event) => set("referenceCode", event.target.value)} placeholder="REF-2026-014" /></label>
            <label className="bh-field wide"><span>Referans açıklaması</span><input value={form.referenceNote} onChange={(event) => set("referenceNote", event.target.value)} placeholder="Pantone dışına çıkıldı; gönderilen kumaşa göre yapıldı." /></label>
            <label className="bh-field"><span>Referans görseli bağlantısı</span><input value={form.referenceImageUrl} onChange={(event) => set("referenceImageUrl", event.target.value)} placeholder="İsteğe bağlı" /></label>
          </> : null}

          {form.sourceType === "VISUAL" || form.sourceType === "REFERENCE" ? <label className="bh-field bh-color-picker-field"><span>Yakın renk kutusu</span><div><input type="color" value={form.colorHex || "#cbd5e1"} onChange={(event) => set("colorHex", event.target.value)} /><input value={form.colorHex} onChange={(event) => set("colorHex", event.target.value)} placeholder="#173b77" /></div></label> : null}

          <label className="bh-field"><span>Baskı bölgesi</span><input value={form.printRegion} onChange={(event) => set("printRegion", event.target.value)} /></label>
          <label className="bh-field"><span>Planlanan KG</span><input type="number" min="0" step="0.001" value={form.plannedKg} onChange={(event) => set("plannedKg", event.target.value)} /></label>
        </div>

        <div className={`bh-color-source-summary ${form.sourceType.toLowerCase()}`}>
          <i style={{ background: form.colorHex || "#cbd5e1" }} />
          <div><strong>{sourceLabel(form.sourceType)}</strong><span>{form.sourceType === "REFERENCE" ? `${form.pantone || "Pantone yok"} · ${form.referenceName || form.referenceCode || "Referans girilmedi"}` : form.sourceType === "VISUAL" ? `${form.colorHex} · ${form.colorFamily || "Renk ailesi otomatik"}` : form.pantone || "Pantone girilmedi"}</span></div>
        </div>

        <div className="bh-modal-actions"><button type="button" className="bh-btn" onClick={onCancel}>İptal</button><button className="bh-btn primary" disabled={busy}>Rengi Ekle</button></div>
      </form>
    </div>
  );
}
