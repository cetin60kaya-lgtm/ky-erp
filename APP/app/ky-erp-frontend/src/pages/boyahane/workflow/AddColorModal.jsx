import { useMemo, useState } from "react";
import ModelThumbnail from "./ModelThumbnail";

export default function AddColorModal({ colors, job, busy, onCancel, onSave }) {
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ registeredColorId: "", pantone: "", colorName: "", paintType: "SUBAZLI", recipeId: "", printRegion: job?.printRegion || "", plannedKg: "" });
  const filtered = useMemo(() => colors.filter((row) => `${row.pantone || ""} ${row.colorName || ""}`.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR"))), [colors, search]);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const choose = (id) => {
    const color = colors.find((row) => row.id === id);
    setForm((current) => ({ ...current, registeredColorId: id, pantone: color?.pantone || "", colorName: color?.colorName || "", paintType: color?.dyeType || "SUBAZLI", recipeId: color?.recipes?.find((row) => row.status === "ACTIVE")?.id || color?.recipes?.[0]?.id || "" }));
  };
  return (
    <div className="bh-modal" role="dialog" aria-modal="true">
      <form className="bh-modal-card" onSubmit={(event) => { event.preventDefault(); onSave(form); }}>
        <div className="bh-modal-model-head"><ModelThumbnail src={job?.imageUrl} alt={job?.modelName} size="medium" /><div><h2>Model Rengi Ekle</h2><p>{job?.modelName || "Model seçilmedi"}</p></div></div>
        <label className="bh-field"><span>Kayıtlı renk ara</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pantone veya renk adı" /></label>
        <label className="bh-field"><span>Kayıtlı renk</span><select value={form.registeredColorId} onChange={(event) => choose(event.target.value)}><option value="">Yeni renk</option>{filtered.map((row) => <option key={row.id} value={row.id}>{row.pantone || "-"} / {row.colorName}</option>)}</select></label>
        <div className="bh-form-grid two">
          <label className="bh-field"><span>Pantone</span><input required value={form.pantone} onChange={(event) => set("pantone", event.target.value)} /></label>
          <label className="bh-field"><span>Renk adı</span><input required value={form.colorName} onChange={(event) => set("colorName", event.target.value)} /></label>
          <label className="bh-field"><span>Boya türü</span><select value={form.paintType} onChange={(event) => set("paintType", event.target.value)}>{["SUBAZLI", "PIGMENT", "ECOPLAST", "SİLİKON", "AŞINDIRMA", "FİKSATÖR", "UV", "DİĞER"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="bh-field"><span>Baskı bölgesi</span><input value={form.printRegion} onChange={(event) => set("printRegion", event.target.value)} /></label>
          <label className="bh-field"><span>Planlanan KG</span><input type="number" min="0" step="0.001" value={form.plannedKg} onChange={(event) => set("plannedKg", event.target.value)} /></label>
        </div>
        <div className="bh-modal-actions"><button type="button" className="bh-btn" onClick={onCancel}>İptal</button><button className="bh-btn primary" disabled={busy}>Rengi Ekle</button></div>
      </form>
    </div>
  );
}
