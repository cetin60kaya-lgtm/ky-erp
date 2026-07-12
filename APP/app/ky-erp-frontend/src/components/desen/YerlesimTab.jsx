import { useEffect, useState } from "react";
import FileCard from "./FileCard";
import PdfPreviewPanel from "./PdfPreviewPanel";
import PlacementSizeTable from "./PlacementSizeTable";
import { fetchYerlesim, saveYerlesim, uploadDesenFile } from "../../services/desenService";

const defaultRows = [
  ["9-12 AY", "Göğüs Ön Orta", "3,5", "orta", "5,0", "4,7"],
  ["1-2 YAŞ", "Göğüs Ön Orta", "4,0", "orta", "5,0", "4,7"],
  ["2-3 YAŞ", "Göğüs Ön Orta", "4,0", "orta", "5,0", "4,7"],
  ["3-4 YAŞ", "Göğüs Ön Orta", "4,5", "orta", "5,0", "4,7"],
  ["4-5 YAŞ", "Göğüs Ön Orta", "4,5", "orta", "5,75", "5,4"],
  ["5-6 YAŞ", "Göğüs Ön Orta", "5,0", "orta", "5,75", "5,4"],
  ["6-7 YAŞ", "Göğüs Ön Orta", "5,0", "orta", "5,75", "5,4"],
  ["7-8 YAŞ", "Göğüs Ön Orta", "5,5", "orta", "5,75", "5,4"],
].map((row, i) => ({ id: `default-${i}`, bedenYas: row[0], baskiYeri: row[1], ustMesafeCm: row[2], ortaHizalama: row[3], baskiEnCm: row[4], baskiBoyCm: row[5], not: "" }));

export default function YerlesimTab({ activeMainCompany, selectedModel, record, onSaved }) {
  const [form, setForm] = useState({ bedenSatirlari: defaultRows });

  useEffect(() => {
    if (!record.id) return;
    fetchYerlesim(activeMainCompany, record.id).then((rows) => {
      const latest = rows?.[0];
      setForm(latest || {
        yerlesimDosyaAdi: record.desenAdi,
        modelId: selectedModel?.id || record.modelId,
        tarih: new Date().toISOString().slice(0, 10),
        baskiBolgesi: "Göğüs Ön Orta",
        bedenSatirlari: defaultRows,
      });
    }).catch(() => {});
  }, [activeMainCompany, record.id, selectedModel?.id]);

  async function upload(role, targetField, file) {
    if (!file || !record.id) return;
    const uploaded = await uploadDesenFile(activeMainCompany, record.id, file, { fileRole: role, modelId: selectedModel?.id || record.modelId });
    setForm((prev) => ({ ...prev, [targetField]: uploaded.id }));
  }

  async function save() {
    if (!record.id) return;
    const saved = await saveYerlesim(activeMainCompany, record.id, { ...form, modelId: selectedModel?.id || record.modelId });
    setForm(saved);
    onSaved?.();
  }

  return (
    <div className="yerlesim-screen">
      <section className="yerlesim-three-col">
        <div className="desen-form-grid placement yerlesim-form-card">
          <div className="desen-section-heading wide"><strong>Yerleşim Bilgileri</strong></div>
          {[
            ["yerlesimDosyaAdi", "Yerleşim Dosya Adı"],
            ["tarih", "Tarih", "date"],
            ["baskiEn", "Baskı En"],
            ["baskiBoy", "Baskı Boy"],
            ["cekmePayiBoy", "Çekme Payı Boy"],
          ].map(([key, label, type]) => <label key={key}>{label}<input type={type || "text"} value={form[key] || ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>)}
          <label>Baskı Bölgesi<select value={form.baskiBolgesi || ""} onChange={(e) => setForm({ ...form, baskiBolgesi: e.target.value })}>
            {["Ön", "Arka", "Ön + Arka", "Göğüs Ön Orta", "Sırt Orta", "Kol", "Paça", "Özel Konum"].map((item) => <option key={item}>{item}</option>)}
          </select></label>
          <label className="wide">Teknik Not<textarea value={form.teknikNot || ""} onChange={(e) => setForm({ ...form, teknikNot: e.target.value })} /></label>
        </div>
        <PdfPreviewPanel activeMainCompany={activeMainCompany} fileId={form.pdfFileId} />
        <aside className="desen-file-panel yerlesim-side">
        <FileCard activeMainCompany={activeMainCompany} title="Yerleşim PDF" hint="PDF yüklenir" fileId={form.pdfFileId} accept="application/pdf,.pdf" onUpload={(file) => upload("yerlesim_pdf", "pdfFileId", file)} />
        <FileCard activeMainCompany={activeMainCompany} title="Teknik Görsel" hint="JPG/PNG" fileId={form.teknikGorselFileId} accept="image/png,image/jpeg,image/jpg" onUpload={(file) => upload("teknik_gorsel", "teknikGorselFileId", file)} />
        <FileCard activeMainCompany={activeMainCompany} title="Revizyon Notu" hint="TXT/DOCX/PDF" fileId={form.revizyonFileId} accept=".txt,.docx,.pdf" onUpload={(file) => upload("revizyon_notu", "revizyonFileId", file)} />
        <div className="placement-summary">
          <strong>Yerleşim Özeti</strong>
          <span>Baskı Bölgesi: {form.baskiBolgesi || "-"}</span>
          <span>Baskı En: {form.baskiEn || "-"}</span>
          <span>Baskı Boy: {form.baskiBoy || "-"}</span>
          <span>Çekme Payı: {form.cekmePayiBoy || "-"}</span>
          <span>Dosya Durumu: {form.pdfFileId ? "Yüklendi" : "Eksik"}</span>
          <span>Oluşturan: Mecit Hakan</span>
          <span>Oluşturma Tarihi: {(form.createdAt || new Date().toISOString()).slice(0, 10)}</span>
        </div>
        </aside>
      </section>
      <PlacementSizeTable rows={form.bedenSatirlari || defaultRows} onChange={(bedenSatirlari) => setForm({ ...form, bedenSatirlari })} />
      <div className="desen-footer-actions">
        <button type="button" onClick={() => setForm({ bedenSatirlari: defaultRows })}>Temizle</button>
        <button type="button" className="primary" onClick={save}>Kaydet</button>
      </div>
    </div>
  );
}
