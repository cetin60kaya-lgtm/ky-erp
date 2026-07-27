import { ImagePlus, Plus, Upload } from "lucide-react";
import { getModelImageSource } from "../../utils/modelImage";

export default function SelectedModelHeader({ model, onNewModel, onUpload }) {
  const initials = (model?.modelAdi || "M").slice(0, 2).toLocaleUpperCase("tr-TR");
  const imageSrc = getModelImageSource(model);
  return (
    <section className="desen-model-header">
      <div className="desen-model-thumb large">
        {imageSrc ? <img src={imageSrc} alt="" /> : <span>{initials}</span>}
      </div>
      <div className="desen-model-summary-grid">
        <label>Model Adı<strong>{model?.modelAdi || "-"}</strong></label>
        <label>Müşteri<strong>{model?.musteri || model?.musteriFirma || "-"}</strong></label>
        <label>Sipariş No<strong>{model?.siparisNo || "-"}</strong></label>
        <label>Zemin Renk<strong>{model?.zeminRenk || model?.zemin || "-"}</strong></label>
        <label>Durum<strong>{model?.durum || "-"}</strong></label>
        <label>Son Güncelleme<strong>{(model?.sonIslemTarihi || "").slice(0, 10) || "-"}</strong></label>
      </div>
      <div className="desen-header-actions">
        <button type="button" onClick={onNewModel}><Plus size={16} />Merkezi Model Aç</button>
        <button type="button" onClick={onUpload}><Upload size={16} />Modele Dosya Yükle</button>
        <button type="button" className="ghost"><ImagePlus size={16} /></button>
      </div>
    </section>
  );
}
