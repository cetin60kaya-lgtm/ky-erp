import { useMemo, useState } from "react";
import {
  CheckCircle2,
  FileStack,
  Grid3X3,
  ImageUp,
  Layers,
  Ruler,
} from "lucide-react";
import { desenJobs, statusTone } from "./desenData";
import { Field, InfoLine, Status, VisualBox } from "./DesenShared";

export default function YerlesimKalipPage() {
  const [selectedId, setSelectedId] = useState(desenJobs[0].id);
  const selected = useMemo(
    () => desenJobs.find((job) => job.id === selectedId) || desenJobs[0],
    [selectedId],
  );

  return (
    <div className="dw-grid-3 dw-tech-layout">
      <aside className="dw-card">
        <div className="dw-card-head">
          <h2>
            <Layers size={17} /> Teknik Kuyruk
          </h2>
          <Status>{desenJobs.length}</Status>
        </div>
        <div className="dw-card-body dw-list dw-tech-list">
          {desenJobs.map((job) => (
            <button
              key={job.id}
              className={job.id === selectedId ? "active" : ""}
              onClick={() => setSelectedId(job.id)}
              type="button"
            >
              <div>
                <strong>{job.model}</strong>
                <span>
                  {job.desenAdi}
                  <br />
                  Kalip: {job.kalip} / {job.bolge}
                </span>
              </div>
              <Status tone={statusTone(job.durum)}>{job.durum}</Status>
            </button>
          ))}
        </div>
      </aside>

      <main className="dw-card">
        <div className="dw-card-head">
          <div>
            <h2>
              <Grid3X3 size={17} /> Yerlesim / Kalip Teknik Kontrol
            </h2>
            <small>Model ve firma bilgisi sadece okunur; teknik dosyalar burada tamamlanir.</small>
          </div>
          <button className="dw-btn primary" type="button">
            <CheckCircle2 size={16} /> Teknik Kaydi Kaydet
          </button>
        </div>
        <div className="dw-card-body">
          <div className="dw-model-card dw-tech-summary">
            <VisualBox label="Yerlesim" />
            <div>
              <h3>{selected.model}</h3>
              <InfoLine label="Firma" value={selected.firma} />
              <InfoLine label="Desen" value={selected.desenAdi} />
              <InfoLine label="Baski bolgesi" value={selected.bolge} />
              <InfoLine label="Renk / Pantone" value={selected.renkPantone} />
            </div>
          </div>

          <div className="dw-readonly-strip">
            <span>
              <Ruler size={15} /> Kalip: <strong>{selected.kalip}</strong>
            </span>
            <span>
              <Layers size={15} /> Kanal: <strong>{selected.kanalAdet}</strong>
            </span>
            <span>
              <FileStack size={15} /> Mevcut yerlesim: <strong>{selected.yerlesim}</strong>
            </span>
          </div>

          <div className="dw-form-grid four">
            <Field label="Kalip olcusu">
              <input defaultValue={selected.kalip} />
            </Field>
            <Field label="Baski alani">
              <input defaultValue={selected.bolge} />
            </Field>
            <Field label="Yerlesim PSD / PDF">
              <input defaultValue={selected.yerlesim} />
            </Field>
            <Field label="Kontrol durumu">
              <select defaultValue={selected.durum}>
                <option>Yerlesim Bekliyor</option>
                <option>Kontrol Bekliyor</option>
                <option>Uretime Hazir</option>
              </select>
            </Field>
            <Field label="Kanal gorseli">
              <input type="file" />
            </Field>
            <Field label="Yerlesim dosyasi">
              <input type="file" />
            </Field>
            <Field label="Baski notu">
              <input defaultValue={selected.desenNot} />
            </Field>
            <Field label="Teknik sorumlu">
              <input defaultValue="Desen" />
            </Field>
          </div>

          <div className="dw-form-grid two">
            <Field label="Teknik kontrol notu">
              <textarea defaultValue={selected.eksikNot} />
            </Field>
            <Field label="Uretim oncesi not">
              <textarea defaultValue={selected.desenNot} />
            </Field>
          </div>
        </div>
      </main>

      <aside className="dw-card dw-right">
        <div className="dw-card-head">
          <h2>
            <ImageUp size={17} /> Yerlesim Kontrol
          </h2>
        </div>
        <div className="dw-card-body">
          <VisualBox label="Buyuk Yerlesim" large />
          <InfoLine label="Model" value={selected.model} />
          <InfoLine label="Firma" value={selected.firma} />
          <InfoLine label="Kalip" value={selected.kalip} />
          <InfoLine label="Baski" value={selected.bolge} />
          <div className="dw-notice orange">{selected.eksikNot}</div>
          <div className="dw-action-stack">
            <button className="dw-btn" type="button">
              <ImageUp size={15} /> Kanal Gorseli Ekle
            </button>
            <button className="dw-btn" type="button">
              <FileStack size={15} /> Yerlesim Dosyasi Ac
            </button>
            <button className="dw-btn primary" type="button">
              <CheckCircle2 size={15} /> Uretime Hazir Isaretle
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
