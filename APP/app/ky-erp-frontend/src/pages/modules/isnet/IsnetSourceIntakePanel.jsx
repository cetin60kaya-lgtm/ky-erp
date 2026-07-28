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
    label: "Mail / PDF",
    description: "E-posta veya WhatsApp ile gelen irsaliye PDF'ini gerçek kaynak kaydı olarak işler.",
    icon: Upload,
  },
  {
    key: "no-dispatch",
    label: "Manuel İrsaliye Talimatı",
    description: "Müşteri irsaliyesi yoksa firma, model ve adetle giden irsaliye akışını başlatır.",
    icon: PackagePlus,
  },
];

const emptyForm = () => ({
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
  portalDocumentId: "",
  ettn: "",
});

export default function IsnetSourceIntakePanel({
  companies = [],
  models = [],
  portalDocuments = [],
  onSubmit,
  busy = false,
}) {
  const [form, setForm] = useState(emptyForm);
  const [portalQuery, setPortalQuery] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const [formError, setFormError] = useState("");

  const source = SOURCE_TYPES.find((item) => item.key === form.sourceType) || SOURCE_TYPES[0];
  const portalRows = useMemo(() => {
    const query = portalQuery.trim().toLocaleLowerCase("tr-TR");
    return portalDocuments
      .filter((row) => row.kind === "dispatch" && row.direction === "incoming")
      .filter((row) => !query || [row.documentNo, row.partnerName, row.modelName, row.orderNo]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(query))
      .slice(0, 50);
  }, [portalDocuments, portalQuery]);

  const modelRows = useMemo(() => {
    const query = modelQuery.trim().toLocaleLowerCase("tr-TR");
    return models
      .filter((row) => !query || [row.name, row.modelName, row.code, row.modelCode, row.companyName]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(query))
      .slice(0, 30);
  }, [modelQuery, models]);

  function patch(values) {
    setFormError("");
    setForm((current) => ({ ...current, ...values }));
  }

  function selectPortalDocument(row) {
    patch({
      customerDispatchNo: row.documentNo || "",
      companyId: row.companyId || "",
      companyName: row.partnerName || row.companyName || "",
      issueDate: row.dateIso || row.issueDate || form.issueDate,
      orderNo: row.orderNo || "",
      modelId: row.modelId || "",
      modelName: row.modelName || row.modelGuess || "",
      quantity: row.quantity || "",
      portalDocumentId: row.id || row.sourceId || "",
      ettn: row.ettn || row.uuid || "",
    });
  }

  function selectModel(row) {
    patch({
      modelId: row.id,
      modelName: row.name || row.modelName || "",
    });
    setModelQuery(row.name || row.modelName || "");
  }

  function selectCompanyName(value) {
    const company = companies.find(
      (row) => String(row.name || row.companyName || "").toLocaleLowerCase("tr-TR") === value.toLocaleLowerCase("tr-TR"),
    );
    patch({ companyName: value, companyId: company?.id || "" });
  }

  async function submit(event) {
    event.preventDefault();
    setFormError("");
    try {
      if (!form.companyName.trim()) throw new Error("Firma seçilmelidir.");
      if (!(Number(form.quantity) > 0)) throw new Error("Adet sıfırdan büyük olmalıdır.");
      if (form.sourceType === "portal" && !form.portalDocumentId) {
        throw new Error("İşNet gelen irsaliyesi seçilmelidir.");
      }
      if (form.sourceType === "manual-pdf" && !form.pdfFile) {
        throw new Error("PDF dosyası seçilmelidir.");
      }
      await onSubmit?.(form);
      setForm((current) => ({ ...emptyForm(), sourceType: current.sourceType }));
      setPortalQuery("");
      setModelQuery("");
    } catch (error) {
      setFormError(error?.message || "Kaynak kaydı oluşturulamadı.");
    }
  }

  return (
    <section className="isnet-card isnet-source-intake">
      <header className="isnet-section-head">
        <div>
          <small>YENİ İŞ AKIŞI</small>
          <h2>İrsaliye / model kaynağı</h2>
          <p>İşNet, mail PDF ve irsaliyesiz müşteri talimatını aynı üretim–irsaliye–fatura zincirine alır.</p>
        </div>
      </header>

      {formError && (
        <div className="isnet-notice isnet-notice--error">{formError}</div>
      )}

      <div className="isnet-source-type-grid">
        {SOURCE_TYPES.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              className={form.sourceType === item.key ? "active" : ""}
              onClick={() => patch({
                sourceType: item.key,
                pdfFile: null,
                portalDocumentId: "",
                customerDispatchNo: item.key === "no-dispatch" ? "" : form.customerDispatchNo,
              })}
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
                <button key={row.id || row.sourceId || row.documentNo} type="button" onClick={() => selectPortalDocument(row)}>
                  <strong>{row.documentNo || "Belge no yok"}</strong>
                  <span>{row.partnerName || row.companyName || "Firma yok"}</span>
                  <small>{row.dateText || row.issueDate || ""}</small>
                </button>
              ))}
              {!portalRows.length && <small>Seçilen tarih aralığında yerel gelen irsaliye bulunamadı.</small>}
            </div>
          </div>
        )}

        {source.key === "manual-pdf" && (
          <label className="isnet-file-drop">
            <FileText size={20} />
            <strong>{form.pdfFile?.name || "Müşteriden gelen irsaliye PDF'ini seç"}</strong>
            <span>Dosya özetiyle tekilleştirilir; aynı PDF ikinci kez kaydedilmez.</span>
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
              onChange={(event) => selectCompanyName(event.target.value)}
              placeholder="Gerçek müşteri firma kartı"
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
            <input value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} placeholder="Desen havuzunda ara" />
          </label>
          <label>
            Seçilen model
            <input value={form.modelName} onChange={(event) => patch({ modelName: event.target.value, modelId: "" })} placeholder="Gerçek model kaydı seçilmelidir" />
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
              <button key={row.id || row.name || row.modelName} type="button" onClick={() => selectModel(row)}>
                <strong>{row.name || row.modelName}</strong>
                <span>{row.code || row.modelCode || "Kod yok"}</span>
              </button>
            ))}
            {!modelRows.length && <small>Desen havuzunda eşleşen model bulunamadı.</small>}
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
