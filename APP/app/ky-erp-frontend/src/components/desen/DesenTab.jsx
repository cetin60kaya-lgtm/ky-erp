import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Maximize2,
  Move,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import FileCard from "./FileCard";
import {
  deleteDesenFile,
  saveDesenRecord,
  uploadDesenFile,
  filePreviewUrl,
} from "../../services/desenService";

const DEFAULT_PAINT_TYPES = [
  "Subazlı",
  "Ecoplast",
  "Pigment Baskı",
  "Silikon",
  "Aşındırma",
];

function normalizeChannelRows(rows = [], count = 0) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const target = Math.max(Number(count || safeRows.length || 0), 0);
  const next = [];
  for (let i = 0; i < target; i += 1) {
    const row = safeRows[i] || {};
    next.push({
      id: row?.id || `kanal-${i + 1}`,
      kanalNo: Number(row?.kanalNo || i + 1),
      kanalAdi: row?.kanalAdi || `Kanal ${i + 1}`,
      renkKodu: row?.renkKodu || "",
      boyaTuru: row?.boyaTuru || DEFAULT_PAINT_TYPES[0],
      hex: row?.hex || "#E2E8F0",
      aktif: row?.aktif !== false,
    });
  }
  return next;
}

function channelsFromModel(selectedModel) {
  const rows = Array.isArray(selectedModel?.channels)
     ? selectedModel?.channels
    : [];
  if (!rows.length) return [];
  return rows.map((row, index) => ({
    id: row?.id || `kanal-model-${index + 1}`,
    kanalNo: Number(row?.channelNo || index + 1),
    kanalAdi: row?.colorName || `Kanal ${index + 1}`,
    renkKodu: row?.colorCode || "",
    boyaTuru: row?.paintType || DEFAULT_PAINT_TYPES[0],
    hex: row?.hex || "#E2E8F0",
    aktif: row?.status
       ? String(row?.status).toLocaleLowerCase("tr-TR") !== "pasif"
      : true,
  }));
}

export default function DesenTab({
  activeMainCompany,
  selectedModel,
  record,
  onSaved,
}) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const modelChannels = channelsFromModel(selectedModel);
    const existingRows = Array.isArray(record.kanalBilgileri)
       ? record.kanalBilgileri
      : modelChannels;
    const kanalSayisi = Number(record.kanalSayisi || existingRows.length || 0);
    setForm({
      id: record.id || "",
      desenAdi: record.desenAdi || selectedModel?.modelAdi || "",
      musteri:
        record.musteri ||
        selectedModel?.musteri ||
        selectedModel?.musteriFirma ||
        "",
      modelId: selectedModel?.id || record.modelId || "",
      modelAdi: selectedModel?.modelAdi || record.modelAdi || "",
      tarih: record.tarih || new Date().toISOString().slice(0, 10),
      aciklama: record.aciklama || "",
      notes: record.notes || "",
      files: record.files || {},
      siparisNo: selectedModel?.siparisNo || record.siparisNo || "",
      zeminRenk:
        selectedModel?.zeminRenk ||
        selectedModel?.zemin ||
        record.zeminRenk ||
        "",
      durum: record.durum || "Aktif",
      kanalSayisi,
      kanalBilgileri: normalizeChannelRows(existingRows, kanalSayisi),
      boyahaneNotu: record.boyahaneNotu || "",
    });
  }, [record, selectedModel]);

  const previewId = form.files.desen_gorseli;
  const canSave = selectedModel && form.desenAdi;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const saved = await saveDesenRecord(activeMainCompany, {
        ...form,
        kanalSayisi: Number(form.kanalSayisi || 0),
        kanalBilgileri: normalizeChannelRows(
          form.kanalBilgileri,
          form.kanalSayisi,
        ),
      });
      setForm((prev) => ({ ...prev, ...saved }));
      onSaved?.(saved);
    } finally {
      setSaving(false);
    }
  }

  function setKanalSayisi(nextCount) {
    const count = Math.max(Number(nextCount || 0), 0);
    setForm((prev) => ({
      ...prev,
      kanalSayisi: count,
      kanalBilgileri: normalizeChannelRows(prev?.kanalBilgileri, count),
    }));
  }

  function updateKanalRow(index, field, value) {
    setForm((prev) => {
      const rows = normalizeChannelRows(prev?.kanalBilgileri, prev?.kanalSayisi);
      rows[index] = { ...rows[index], [field]: value };
      return { ...prev, kanalBilgileri: rows };
    });
  }

  async function upload(role, file) {
    if (!file) return;
    const base = form.id
       ? form
      : await saveDesenRecord(activeMainCompany, form);
    const uploaded = await uploadDesenFile(activeMainCompany, base.id, file, {
      fileRole: role,
      modelId: selectedModel?.id || base.modelId,
    });
    const saved = await saveDesenRecord(activeMainCompany, {
      ...base,
      files: { ...(base.files || {}), [role]: uploaded.id },
    });
    setForm(saved);
    onSaved?.(saved);
  }

  async function remove(role) {
    const fileId = form.files?.[role];
    if (!fileId) return;
    await deleteDesenFile(activeMainCompany, fileId);
    const saved = await saveDesenRecord(activeMainCompany, {
      ...form,
      files: { ...form.files, [role]: "" },
    });
    setForm(saved);
    onSaved?.(saved);
  }

  const fields = useMemo(
    () => [
      ["desenAdi", "Desen Adı"],
      ["musteri", "Müşteri"],
      ["modelAdi", "Model Bağlantısı"],
      ["tarih", "Tarih", "date"],
    ],
    [],
  );

  return (
    <div className="desen-design-board">
      <section className="desen-top-grid">
        <div className="desen-form-panel compact-form">
          <div className="desen-section-heading">
            <strong>Desen Bilgileri</strong>
          </div>
          <div className="desen-form-grid single">
            {fields.map(([key, label, type]) => (
              <label key={key}>
                {label}
                <input
                  type={type || "text"}
                  value={form[key] || ""}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
              </label>
            ))}
            <label>
              Kanal Sayısı
              <select
                value={form.kanalSayisi || 0}
                onChange={(e) => setKanalSayisi(Number(e.target.value))}
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Açıklama
              <input
                value={form.aciklama || ""}
                onChange={(e) => setForm({ ...form, aciklama: e.target.value })}
              />
            </label>
            <label className="wide">
              Boyahane Notu
              <textarea
                value={form.boyahaneNotu || ""}
                onChange={(e) =>
                  setForm({ ...form, boyahaneNotu: e.target.value })
                }
                placeholder="Reçete/baskı hazırlık notu"
              />
            </label>
          </div>
        </div>
        <div className="desen-file-row">
          <FileCard
            activeMainCompany={activeMainCompany}
            title="Desen Görseli"
            hint="PNG/JPG/JPEG"
            fileId={form.files.desen_gorseli}
            accept="image/png,image/jpeg,image/jpg"
            onUpload={(file) => upload("desen_gorseli", file)}
            onDelete={() => remove("desen_gorseli")}
          />
          <FileCard
            activeMainCompany={activeMainCompany}
            title="Kanal Görseli / PSD"
            hint="PSD/PNG/JPG/PDF"
            fileId={form.files.kanal_gorseli_psd}
            accept=".psd,.pdf,image/png,image/jpeg,image/jpg"
            onUpload={(file) => upload("kanal_gorseli_psd", file)}
            onDelete={() => remove("kanal_gorseli_psd")}
          />
          <FileCard
            activeMainCompany={activeMainCompany}
            title="Müşteriden Gelen Çalışma PSD"
            hint="Orijinal çalışma PSD"
            fileId={form.files.musteri_calisma_psd}
            accept=".psd"
            onUpload={(file) => upload("musteri_calisma_psd", file)}
            onDelete={() => remove("musteri_calisma_psd")}
          />
          <FileCard
            activeMainCompany={activeMainCompany}
            title="Yerleşim PDF"
            hint="PDF yüklenir"
            fileId={form.files.yerlesim_pdf}
            accept="application/pdf,.pdf"
            onUpload={(file) => upload("yerlesim_pdf", file)}
            onDelete={() => remove("yerlesim_pdf")}
          />
        </div>
      </section>

      <section className="placement-table-card mt-12">
        <div className="desen-section-heading">
          <strong>Kanal Dağılımı (Boyahane Aktarımı)</strong>
          <span>{form.kanalSayisi || 0} kanal</span>
        </div>
        <div className="placement-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kanal No</th>
                <th>Kanal Adı</th>
                <th>Renk Kodu</th>
                <th>Boya Türü</th>
                <th>Hex</th>
                <th>Aktif</th>
              </tr>
            </thead>
            <tbody>
              {normalizeChannelRows(form.kanalBilgileri, form.kanalSayisi).map(
                (row, index) => (
                  <tr key={row?.id || index}>
                    <td>
                      <input
                        value={row?.kanalNo}
                        onChange={(e) =>
                          updateKanalRow(
                            index,
                            "kanalNo",
                            Number(e.target.value || index + 1),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={row?.kanalAdi || ""}
                        onChange={(e) =>
                          updateKanalRow(index, "kanalAdi", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={row?.renkKodu || ""}
                        onChange={(e) =>
                          updateKanalRow(index, "renkKodu", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={row?.boyaTuru || DEFAULT_PAINT_TYPES[0]}
                        onChange={(e) =>
                          updateKanalRow(index, "boyaTuru", e.target.value)
                        }
                      >
                        {DEFAULT_PAINT_TYPES.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        value={row?.hex || "#E2E8F0"}
                        onChange={(e) =>
                          updateKanalRow(index, "hex", e.target.value)
                        }
                        placeholder="#RRGGBB"
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={row?.aktif !== false}
                        onChange={(e) =>
                          updateKanalRow(index, "aktif", e.target.checked)
                        }
                      />
                    </td>
                  </tr>
                ),
              )}
              {!Number(form.kanalSayisi || 0) ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{ textAlign: "center", color: "#64748b" }}
                  >
                    Kanal sayısı seçildiğinde kanal adları burada oluşur.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="desen-bottom-grid">
        <div className="desen-preview-card">
          <div className="desen-section-heading">
            <strong>Desen Önizleme</strong>
            <div className="preview-toolbar">
              <button type="button" title="Taşı">
                <Move size={15} />
              </button>
              <button type="button" title="Uzaklaştır">
                <ZoomOut size={15} />
              </button>
              <button type="button" title="Yakınlaştır">
                <ZoomIn size={15} />
              </button>
              <span>100%</span>
              <button type="button" title="Tam ekran">
                <Maximize2 size={15} />
              </button>
              <button type="button" title="Döndür">
                <RotateCw size={15} />
              </button>
              {previewId ? (
                <a
                  href={filePreviewUrl(activeMainCompany, previewId)}
                  title="İndir"
                >
                  <Download size={15} />
                </a>
              ) : null}
            </div>
          </div>
          <div className="desen-preview-large">
            {previewId ? (
              <img
                src={filePreviewUrl(activeMainCompany, previewId)}
                alt="Desen önizleme"
              />
            ) : (
              <span>Desen görseli yükleyin</span>
            )}
          </div>
        </div>
        <div className="desen-notes-card">
          <label className="desen-notes">
            Notlar
            <textarea
              maxLength={1000}
              value={form.notes || ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Not eklemek için buraya yazın..."
            />
          </label>
          <small>{(form.notes || "").length} / 1000</small>
        </div>
      </section>
      <div className="desen-footer-actions">
        <button type="button" onClick={() => setForm({})}>
          Temizle
        </button>
        <button
          type="button"
          className="primary"
          disabled={!canSave || saving}
          onClick={save}
        >
          {saving ? "Kaydediliyor" : "Kaydet"}
        </button>
      </div>
    </div>
  );
}
