import { useMemo, useState } from "react";
import { FileText, Link2, PackagePlus, Upload } from "lucide-react";

const SOURCE_TYPES = [
  {
    key: "portal",
    label: "İşNet Belgesi",
    description: "İşNet'ten alınan gelen irsaliyeyi model, imalat ve fatura zincirine bağlar.",
    icon: Link2,
  },
  {
    key: "manual-pdf",
    label: "Manuel PDF",
    description: "Müşterinin e-posta veya WhatsApp ile gönderdiği irsaliye PDF'ini kaydeder.",
    icon: Upload,
  },
  {
    key: "no-dispatch",
    label: "İrsaliyesiz Talimat",
    description: "Müşteri irsaliye göndermeden model adına irsaliye kesilmesini istediğinde kullanılır.",
    icon: PackagePlus,
  },
];

const EMPTY_FORM = {
  sourceType: "portal",
  companyId: "",
  companyName: "",
  modelId: "",
  modelName: "",
  orderNo: "",
  customerDispatchNo: "",
  issueDate: new Date().toISOString().slice(0, 10),
  quantity: "",
  unit: "ADET",
  note: "",
  pdfFile: null,
};

export default function IsnetSourceIntakePanel({
  companies = [],
  models = [],
  portalDocuments = [],
  onSubmit,
  busy = false,
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [portalQuery, setPortalQuery] = useState("");
  const [modelQuery, setModelQuery] = useState("");

  const source = SOURCE_TYPES.find((item) => item.key === form.sourceType) || SOURCE_TYPES[0];
  const portalRows = useMemo(() => {
    const query = portalQuery.trim().toLocaleLowerCase("tr-TR");
    return portalDocuments
      .filter((row) => row.kind === "dispatch" && row.direction === "incoming")
      .filter((row) => !query || [row.documentNo, row.partnerName, row.modelName, row.orderNo]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(query))
      .slice(0, 25);
  }, [portalDocuments, portalQuery]);

  const modelRows = useMemo(() => {
    const query = modelQuery.trim().toLocaleLowerCase("tr-TR");
    return models
      .filter((row) => !query || [row.name, row.code, row.companyName]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(query))
      .slice(0, 20);
  }, [modelQuery, models]);

  function patch(values) {
    setForm((current) => ({ ...current, ...values }));
  }

  function selectPortalDocument(row) {
    patch({
      customerDispatchNo: row.documentNo || "",
      companyName: row.partnerName || "",
      issueDate: row.dateIso || row.issueDate || form.issueDate,
      orderNo: row.orderNo || "",
      modelName: row.modelName || row.modelGuess || "",
      quantity: row.quantity || "",
      portalDocumentId: row.id,
      ettn: row.ettn || row.uuid || "",
    });
  }

  function selectModel(row) {
    patch({ modelId: row.id, modelName: row.name || row.modelName || "" });
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.companyName.trim()) throw new Error("Firma seçilmelidir.");
    if (!form.modelName.trim()) throw new Error("Model seçilmeli veya yeni model oluşturulmalıdır.");
    if (!(Number(form.quantity) > 0)) throw new Error("Adet sıfırdan büyük olmalıdır.");
    if (form.sourceType === "manual-pdf" && !form.pdfFile) throw new Error("PDF dosyası seçilmelidir.");
    await onSubmit?.(form);
    setForm((current) => ({ ...EMPTY_FORM, sourceType: current.sourceType }));
  }

  return (
    <section className="isnet-card isnet-source-intake">
      <header className="isnet-section-head">
        <div>
          <small>YENİ İŞ AKIŞI</small>
          <h2>İrsaliye / model kaynağı</h2>
          <p>İşNet, manuel PDF ve irsaliyesiz müşteri talimatını aynı üretim–irsaliye–fatura zincirine alır.</p>
        </div>
      </header>

      <div className="isnet-source-type-grid">
        {SOURCE_TYPES.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              className={form.sourceType === item.key ? "active" : ""}
              onClick={() => patch({ sourceType: item.key, pdfFile: null })}
            >
              <Icon size={18} />
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          );
        })}
      </div>

      <form onSubmit={submit} className="isnet-source-form">
        {source.key === "portal" && (
          <div className="isnet-source-picker">
            <label>
              İşNet gelen irsaliyesi
              <input
                value={portalQuery}
                onChange={(event) => setPortalQuery(event.target.value)}
                placeholder="Belge no, firma, model veya sipariş ara"
              />
            </label>
            <div className="isnet-source-results">
              {portalRows.map((row) => (
                <button key={row.id || row.documentNo} type="button" onClick={() => selectPortalDocument(row)}>
                  <strong>{row.documentNo || "Belge no yok"}</strong>
                  <span>{row.partnerName || "Firma yok"}</span>
                  <small>{row.dateText || row.issueDate || ""}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {source.key === "manual-pdf" && (
          <label className="isnet-file-drop">
            <FileText size={20} />
            <strong>{form.pdfFile?.name || "Müşteri irsaliye PDF'ini seç"}</strong>
            <span>XML zorunlu değildir. PDF kaynağı dosya özetiyle tekilleştirilir.</span>
            <input type="file" accept="application/pdf,.pdf" onChange={(event) => patch({ pdfFile: event.target.files?.[0] || null })} />
          </label>
        )}

        {source.key === "no-dispatch" && (
          <div className="isnet-inline-notice isnet-inline-notice--warning">
            Müşteri irsaliyesi olmadan iç referans oluşturulur. Sahte müşteri irsaliye numarası üretilmez.
          </div>
        )}

        <div className="isnet-form-grid">
          <label>
            Firma
            <input
              list="isnet-source-companies"
              value={form.companyName}
              onChange={(event) => patch({ companyName: event.target.value })}
              placeholder="Müşteri firma"
            />
            <datalist id="isnet-source-companies">
              {companies.map((row) => <option key={row.id || row.name} value={row.name || row.companyName} />)}
            </datalist>
          </label>
          <label>
            Tarih
            <input type="date" value={form.issueDate} onChange={(event) => patch({ issueDate: event.target.value })} />
          </label>
          <label>
            Müşteri irsaliye no
            <input
              value={form.customerDispatchNo}
              onChange={(event) => patch({ customerDispatchNo: event.target.value })}
              disabled={source.key === "no-dispatch"}
              placeholder={source.key === "no-dispatch" ? "İrsaliye yok" : "Belge numarası"}
            />
          </label>
          <label>
            Sipariş / piyon
            <input value={form.orderNo} onChange={(event) => patch({ orderNo: event.target.value })} />
          </label>
          <label>
            Model ara
            <input value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} placeholder="Model adı veya kodu" />
          </label>
          <label>
            Seçilen model
            <input value={form.modelName} onChange={(event) => patch({ modelName: event.target.value, modelId: "" })} placeholder="Model yoksa yeni model adı" />
          </label>
          <label>
            Adet
            <input type="number" min="1" step="1" value={form.quantity} onChange={(event) => patch({ quantity: event.target.value })} />
          </label>
          <label>
            Birim
            <select value={form.unit} onChange={(event) => patch({ unit: event.target.value })}>
              <option value="ADET">Adet</option>
              <option value="KILOGRAM">Kilogram</option>
              <option value="METRE">Metre</option>
            </select>
          </label>
        </div>

        {modelQuery && (
          <div className="isnet-model-results">
            {modelRows.map((row) => (
              <button key={row.id || row.name} type="button" onClick={() => selectModel(row)}>
                <strong>{row.name || row.modelName}</strong>
                <span>{row.code || "Kod yok"}</span>
              </button>
            ))}
          </div>
        )}

        <label>
          Talimat / açıklama
          <textarea value={form.note} onChange={(event) => patch({ note: event.target.value })} rows={3} placeholder="Müşterinin talimatı, renk, bölge veya özel not" />
        </label>

        <footer className="isnet-action-row">
          <button type="submit" className="isnet-btn isnet-btn--primary" disabled={busy}>
            {busy ? "Kaydediliyor…" : "İş Akışını Oluştur"}
          </button>
        </footer>
      </form>
    </section>
  );
}
