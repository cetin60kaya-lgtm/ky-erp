import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  FileImage,
  FolderOpen,
  ImageOff,
  Layers,
  Palette,
  PlusCircle,
  UploadCloud,
} from "lucide-react";
import { desenJobs, statusTone } from "./desenData";
import { Field, InfoLine, Status, VisualBox } from "./DesenShared";

export default function DesenModelMasasi() {
  const queue = useMemo(
    () => desenJobs.filter((job) => job.durum !== "Uretime Hazir"),
    [],
  );
  const rows = queue.length ? queue : desenJobs;
  const [selectedId, setSelectedId] = useState(rows[0].id || desenJobs[0].id);
  const selected = useMemo(
    () => rows.find((job) => job.id === selectedId) || rows[0] || desenJobs[0],
    [rows, selectedId],
  );

  return (
    <div className="dw-grid-2 dw-new-model-layout">
      <aside className="dw-card">
        <div className="dw-card-head">
          <div>
            <h2>
              <UploadCloud size={17} /> Gelen Desen Kuyrugu
            </h2>
            <small>Yeni model, eksik bilgi ve dosya bekleyen isler</small>
          </div>
          <Status>{rows.length}</Status>
        </div>
        <div className="dw-card-body">
          <label className="dw-drop dw-drop-strong">
            <UploadCloud size={24} />
            <strong>Gorsel / PSD / PDF birak</strong>
            <span>Model karti icin kaynak dosyalar bu alandan alinacak.</span>
            <input type="file" multiple />
          </label>

          <div className="dw-new-model-queue">
            {rows.map((job) => (
              <button
                key={job.id}
                type="button"
                className={job.id === selectedId ? "active" : ""}
                onClick={() => setSelectedId(job.id)}
              >
                <VisualBox label="Gorsel" />
                <div>
                  <strong>{job.model}</strong>
                  <span>
                    {job.desenAdi}
                    <br />
                    {job.firma} / {job.bolge}
                  </span>
                  <Status tone={statusTone(job.durum)}>{job.durum}</Status>
                </div>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="dw-card">
        <div className="dw-card-head">
          <div>
            <h2>
              <PlusCircle size={17} /> Yeni Model / Eksik Bilgi
            </h2>
            <small>Model kartina gidecek temel desen bilgisi burada tamamlanir.</small>
          </div>
          <button className="dw-btn primary" type="button">
            <CheckCircle2 size={16} /> Kaydet ve Havuzda Ac
          </button>
        </div>
        <div className="dw-card-body">
          <div className="dw-prep-summary">
            <VisualBox label="Desen" />
            <div>
              <h3>{selected.model} / {selected.desenAdi}</h3>
              <InfoLine label="Firma" value={selected.firma} />
              <InfoLine label="Baski bolgesi" value={selected.bolge} />
              <InfoLine label="Renk" value={selected.renkPantone} />
              <InfoLine label="Durum" value={selected.durum} />
            </div>
            <div className="dw-prep-badges">
              <Status tone={statusTone(selected.durum)}>{selected.durum}</Status>
              <Status tone="blue">Model karti</Status>
              <Status tone="orange">Eksik kontrol</Status>
            </div>
          </div>

          <div className="dw-form-grid four">
            <Field label="Model adi">
              <input defaultValue={selected.model} />
            </Field>
            <Field label="Firma">
              <input defaultValue={selected.firma} />
            </Field>
            <Field label="Desen adi">
              <input defaultValue={selected.desenAdi} />
            </Field>
            <Field label="Durum">
              <select defaultValue={selected.durum}>
                <option>Eksik Bilgi</option>
                <option>Yerlesim Bekliyor</option>
                <option>Uretime Hazir</option>
              </select>
            </Field>
            <Field label="Ilk baski bolgesi">
              <input defaultValue={selected.bolge} />
            </Field>
            <Field label="Zemin">
              <input defaultValue={selected.zemin} />
            </Field>
            <Field label="Renk / Pantone">
              <input defaultValue={selected.renkPantone} />
            </Field>
            <Field label="Kanal adedi">
              <input defaultValue={selected.kanalAdet} />
            </Field>
          </div>

          <div className="dw-control-grid">
            <ControlCard
              icon={<FileImage size={18} />}
              title="Gorsel"
              text="Ana desen gorseli ve kanal dosyasi model kartina baglanir."
              action="Gorsel Ekle"
            />
            <ControlCard
              icon={<Layers size={18} />}
              title="Yerlesim"
              text="Kalıp ve yerlesim dosyasi teknik ekrana devredilir."
              action="Yerlesime Gonder"
            />
            <ControlCard
              icon={<Palette size={18} />}
              title="Renk"
              text="Renk, kanal adedi ve zemin bilgisi tek kayitta tutulur."
              action="Renk Kontrol"
            />
            <ControlCard
              icon={<ClipboardCheck size={18} />}
              title="Eksik Bilgi"
              text={selected.eksikNot || "Eksik bilgi yok."}
              action="Tamamla"
            />
          </div>

          <div className="dw-form-grid two">
            <Field label="Desen notu">
              <textarea defaultValue={selected.desenNot} />
            </Field>
            <Field label="Eksik bilgi notu">
              <textarea defaultValue={selected.eksikNot} />
            </Field>
          </div>
        </div>
      </main>
    </div>
  );
}

function ControlCard({ icon, title, text, action }) {
  return (
    <section className="dw-control-card">
      <div className="dw-control-icon">{icon || <ImageOff size={18} />}</div>
      <strong>{title}</strong>
      <span>{text}</span>
      <button className="dw-btn" type="button">
        <FolderOpen size={15} /> {action}
      </button>
    </section>
  );
}
