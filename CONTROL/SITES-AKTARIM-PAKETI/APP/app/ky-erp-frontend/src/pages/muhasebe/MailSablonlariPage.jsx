import { useEffect, useState } from "react";
import {
  createMailTemplate,
  createMailTemplateDraft,
  deleteMailTemplate,
  getMailTemplateDrafts,
  getMailTemplates,
  markMailTemplateDraftSent,
  renderMailTemplate,
  seedMailTemplates,
  updateMailTemplate,
} from "../../services/muhasebeApi";
import { DataTable, asArray } from "./_MuhasebeShared";

const sampleData = {
  firmaAdi: "TAHA",
  modelAdi: "GRILKA",
  siparisNo: "SIP-2026-05",
  faturaNo: "HKN2026000000421",
  irsaliyeNo: "DDM2026000000420",
  faturaTarihi: "18.05.2026",
  faturaTutari: "12.450,00 TL",
  adet: "1.250",
  kalanAdet: "320",
  ekstreDonemi: "Mayis 2026",
  bayramNotu:
    "Bayram haftasi nedeniyle konunun aciliyet tasidigini belirtmek isteriz.",
  aciklama: "Kontrol ederek donus yapmanizi rica ederiz.",
};

const sampleFaturalar = [
  {
    faturaNo: "HKN2026000000421",
    modelAdi: "GRILKA",
    faturaTarihi: "18.05.2026",
    faturaTutari: "12.450,00 TL",
    odemeDurumu: "Ekstrede yok",
  },
  {
    faturaNo: "HKN2026000000435",
    modelAdi: "EPULS SARI",
    faturaTarihi: "22.05.2026",
    faturaTutari: "18.750,00 TL",
    odemeDurumu: "Odeme gorunmuyor",
  },
];

const emptyForm = {
  code: "",
  type: "GENEL",
  name: "",
  subject: "",
  body: "",
};

function safeJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function joinList(value) {
  return Array.isArray(value) ? value.filter(Boolean).join("; ") : "";
}

export default function MailSablonlariPage({ activeMainCompany }) {
  const [templates, setTemplates] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);
  const [toList, setToList] = useState("");
  const [ccList, setCcList] = useState("");
  const [dataJson, setDataJson] = useState(JSON.stringify(sampleData, null, 2));
  const [rowsJson, setRowsJson] = useState(
    JSON.stringify(sampleFaturalar, null, 2),
  );

  const selected = templates.find((item) => item.id === selectedId) || null;

  useEffect(() => {
    loadAll();
  }, [activeMainCompany?.slug, activeMainCompany?.id]);

  useEffect(() => {
    if (!selected) return;
    setForm({
      code: selected.code || "",
      type: selected.type || "GENEL",
      name: selected.name || "",
      subject: selected.subject || "",
      body: selected.body || "",
    });
    setPreview(null);
  }, [selected?.id]);

  async function loadAll(nextSelectedId = selectedId) {
    try {
      const [templatePayload, draftPayload] = await Promise.all([
        getMailTemplates(activeMainCompany || {}),
        getMailTemplateDrafts(activeMainCompany || {}),
      ]);
      const templateRows = asArray(templatePayload);
      const draftRows = asArray(draftPayload);
      setTemplates(templateRows);
      setDrafts(draftRows);

      if (templateRows.length) {
        const exists = templateRows.some((item) => item.id === nextSelectedId);
        setSelectedId(exists ? nextSelectedId : templateRows[0].id);
      } else {
        setSelectedId("");
      }
    } catch (error) {
      setMessage(error?.message);
    }
  }

  async function handleSeed() {
    try {
      setMessage("Varsayilan sablonlar hazirlaniyor...");
      await seedMailTemplates(activeMainCompany || {});
      await loadAll();
      setMessage("Varsayilan sablonlar hazirlandi.");
    } catch (error) {
      setMessage(error?.message);
    }
  }

  async function handleSave() {
    try {
      const payload = {
        ...(activeMainCompany || {}),
        ...form,
      };

      if (selectedId) {
        await updateMailTemplate(selectedId, payload);
        await loadAll(selectedId);
        setMessage("Sablon guncellendi.");
      } else {
        const created = await createMailTemplate(payload);
        await loadAll(created.id || "");
        setMessage("Yeni sablon olusturuldu.");
      }
    } catch (error) {
      setMessage(error?.message);
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    if (!window.confirm("Sablon pasife alinacak. Devam edilsin mi")) return;
    try {
      await deleteMailTemplate(selectedId, activeMainCompany || {});
      setForm(emptyForm);
      setPreview(null);
      await loadAll("");
      setMessage("Sablon pasife alindi.");
    } catch (error) {
      setMessage(error?.message);
    }
  }

  async function handlePreview() {
    if (!selectedId) return;
    try {
      const rendered = await renderMailTemplate({
        ...(activeMainCompany || {}),
        templateId: selectedId,
        data: safeJson(dataJson, sampleData),
        faturalar: safeJson(rowsJson, sampleFaturalar),
      });
      setPreview(rendered || null);
      setMessage("Onizleme hazir.");
    } catch (error) {
      setMessage(error?.message);
    }
  }

  async function handleCreateDraft() {
    if (!selectedId) return;
    try {
      const data = safeJson(dataJson, sampleData);
      await createMailTemplateDraft({
        ...(activeMainCompany || {}),
        templateId: selectedId,
        firmName: data?.firmaAdi,
        modelName: data?.modelAdi,
        data,
        faturalar: safeJson(rowsJson, sampleFaturalar),
        toList,
        ccList,
        sourceType: "MAIL_TEMPLATE_SCREEN",
      });
      await loadAll(selectedId);
      setMessage("Mail taslagi olusturuldu.");
    } catch (error) {
      setMessage(error?.message);
    }
  }

  async function handleMarkSent(id) {
    try {
      await markMailTemplateDraftSent(id, activeMainCompany || {});
      await loadAll(selectedId);
      setMessage("Taslak gonderildi olarak isaretlendi.");
    } catch (error) {
      setMessage(error?.message);
    }
  }

  return (
    <div className="mh-layout-main-right">
      <section className="mh-card">
        <div className="mh-card-head">
          <div>
            <h2>Mail Şablonları</h2>
            <small>
              Fatura, irsaliye, ekstre, ödeme ve serbest muhasebe mailleri için
              JsonStore tabanlı şablon yönetimi.
            </small>
          </div>
          <div className="mh-inline-actions">
            <button className="mh-btn" type="button" onClick={handleSeed}>
              Varsayılanları Kur
            </button>
            <button
              className="mh-btn primary"
              type="button"
              onClick={() => {
                setSelectedId("");
                setForm(emptyForm);
                setPreview(null);
              }}
            >
              Yeni Şablon
            </button>
          </div>
        </div>

        {message ? (
          <div className="mh-note" style={{ marginBottom: 10 }}>
            {message}
          </div>
        ) : null}

        <div className="mh-card-body">
          <div className="mh-report-grid">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                className={template.id === selectedId ? "active" : ""}
                onClick={() => setSelectedId(template.id)}
              >
                {String(template.name || "Adsiz sablon")}
                <small style={{ display: "block", opacity: 0.7 }}>
                  {String(template.type || "GENEL")}
                </small>
              </button>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginTop: 12,
            }}
          >
            <label>
              <span>Şablon Kodu</span>
              <input
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    code: event?.target.value,
                  }))
                }
                placeholder="EKSTREDE_GORUNMEME"
              />
            </label>
            <label>
              <span>Tür</span>
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event?.target.value,
                  }))
                }
              >
                <option value="FATURA_GONDERIM">Fatura Gönderim</option>
                <option value="IRSALIYE_GONDERIM">İrsaliye Gönderim</option>
                <option value="EKSTRE_TAKIP">Ekstre Takip</option>
                <option value="ODEME_TAKIP">Ödeme Takip</option>
                <option value="MODEL_TAKIP">Model Takip</option>
                <option value="GENEL">Genel</option>
              </select>
            </label>
            <label>
              <span>Şablon Adı</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event?.target.value,
                  }))
                }
                placeholder="Bayram ekstre hatirlatma"
              />
            </label>
            <label>
              <span>Konu</span>
              <input
                value={form.subject}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    subject: event?.target.value,
                  }))
                }
                placeholder="{{modelAdi}} FATURA"
              />
            </label>
          </div>

          <label style={{ display: "block", marginTop: 10 }}>
            <span>Mail Gövdesi</span>
            <textarea
              value={form.body}
              onChange={(event) =>
                setForm((current) => ({ ...current, body: event?.target.value }))
              }
              style={{ minHeight: 220, fontFamily: "Consolas, monospace" }}
              placeholder={
                "Merhaba,\n{{modelAdi}} modeline ait faturamiz ektedir."
              }
            />
          </label>

          <div className="mh-note" style={{ marginTop: 10 }}>
            Değişkenler: {"{{firmaAdi}}"}, {"{{modelAdi}}"},{" "}
            {"{{siparisNo}}"}, {"{{faturaNo}}"}, {"{{irsaliyeNo}}"},{" "}
            {"{{kalanAdet}}"}, {"{{ekstreDonemi}}"}
            <br />
            Çoklu fatura listesi: {"{{#faturalar}}"} ... {"{{/faturalar}}"}
          </div>

          <div className="mh-inline-actions" style={{ marginTop: 12 }}>
            <button
              className="mh-btn primary"
              type="button"
              onClick={handleSave}
            >
              Kaydet
            </button>
            <button
              className="mh-btn"
              type="button"
              onClick={handleDelete}
              disabled={!selectedId}
            >
              Pasife Al
            </button>
          </div>
        </div>
      </section>

      <aside className="mh-card">
        <div className="mh-card-head">
          <h2>Önizleme / Taslak</h2>
          <div className="mh-inline-actions">
            <button
              className="mh-btn"
              type="button"
              onClick={handlePreview}
              disabled={!selectedId}
            >
              Önizle
            </button>
            <button
              className="mh-btn primary"
              type="button"
              onClick={handleCreateDraft}
              disabled={!selectedId}
            >
              Taslak Oluştur
            </button>
          </div>
        </div>

        <div className="mh-card-body">
          <label>
            <span>Alıcılar</span>
            <input
              value={toList}
              onChange={(event) => setToList(event?.target.value)}
              placeholder="mail1@firma.com; mail2@firma.com"
            />
          </label>
          <label>
            <span>CC</span>
            <input
              value={ccList}
              onChange={(event) => setCcList(event?.target.value)}
              placeholder="cc@firma.com"
            />
          </label>
          <label>
            <span>Tekil veri JSON</span>
            <textarea
              value={dataJson}
              onChange={(event) => setDataJson(event?.target.value)}
              style={{ minHeight: 130, fontFamily: "Consolas, monospace" }}
            />
          </label>
          <label>
            <span>Fatura listesi JSON</span>
            <textarea
              value={rowsJson}
              onChange={(event) => setRowsJson(event?.target.value)}
              style={{ minHeight: 130, fontFamily: "Consolas, monospace" }}
            />
          </label>

          {preview ? (
            <div className="mh-card" style={{ marginTop: 10 }}>
              <strong>Konu:</strong> {String(preview.subject || "")}
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "Arial, sans-serif",
                }}
              >
                {String(preview.body || "")}
              </pre>
            </div>
          ) : null}

          <div style={{ marginTop: 12 }}>
            <h3>Son Taslaklar</h3>
            <DataTable
              rows={drafts.slice(0, 8)}
              columns={[
                {
                  key: "subject",
                  label: "Konu",
                  render: (row) => String(row?.subject || "-"),
                },
                {
                  key: "modelName",
                  label: "Model",
                  render: (row) => String(row?.modelName || "-"),
                },
                {
                  key: "toList",
                  label: "Alıcılar",
                  render: (row) => joinList(row?.toList) || "-",
                },
                {
                  key: "status",
                  label: "Durum",
                  render: (row) => String(row?.status || "-"),
                },
                {
                  key: "islem",
                  label: "İşlem",
                  render: (row) => (
                    <button
                      className="mh-btn"
                      type="button"
                      onClick={() => handleMarkSent(row?.id)}
                      disabled={String(row?.status || "") === "SENT"}
                    >
                      Gönderildi İşaretle
                    </button>
                  ),
                },
              ]}
              empty="Henüz taslak yok."
            />
          </div>
        </div>
      </aside>
    </div>
  );
}
