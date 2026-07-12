import { useEffect, useRef, useState } from "react";
import { Plus, Wand2 } from "lucide-react";
import KalipMatchCard from "./KalipMatchCard";
import {
  nextKalipCode,
  parseKalipFileName,
  saveKalipYerlesim,
  uploadDesenFile,
} from "../../services/desenService";

const ebatlar = ["60x70", "60x80", "60x90", "70x90"];

export default function KalipYerlesimTab({
  activeMainCompany,
  selectedModel,
  record,
  models,
  onSaved,
}) {
  const autoParsedRef = useRef("");
  const [form, setForm] = useState({
    dosyaAdi: "FRUIT K_BOY - ASPEN B_BOY.PSD",
    kalipEbatti: "60x70",
    kalipSayisi: 1,
    yuksekKalipVar: false,
    yuksekKalipAdedi: 0,
    simVar: false,
    simNotu: "",
    parsedItems: [],
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!record.id || !form.kalipEbatti) return;
    nextKalipCode(activeMainCompany, record.id, form.kalipEbatti)
      .then((data) =>
        setForm((prev) => ({
          ...prev,
          kalipKodu: prev?.kalipKodu || data?.kalipKodu,
        })),
      )
      .catch(() => {});
  }, [activeMainCompany, record.id, form.kalipEbatti]);

  useEffect(() => {
    if (
      !record.id ||
      !form.dosyaAdi ||
      form.parsedItems.length ||
      autoParsedRef.current === record.id
    )
      return;
    autoParsedRef.current = record.id;
    parse();
  }, [record.id, form.dosyaAdi]);

  async function parse() {
    if (!record.id) return;
    try {
      const parsedItems = await parseKalipFileName(
        activeMainCompany,
        record.id,
        form.dosyaAdi,
      );
      setForm({ ...form, parsedItems });
      setMessage(
        parsedItems.length > 8
           ? "Bu dosyada 8’den fazla model algılandı. Lütfen dosya adını kontrol edin."
          : "",
      );
    } catch (error) {
      setMessage(error?.message.replace(/^.*failed:\s*/i, ""));
    }
  }

  function updateCard(next) {
    setForm((prev) => ({
      ...prev,
      parsedItems: prev.parsedItems.map((item) =>
        item.id === next.id ? next : item,
      ),
    }));
  }

  const approvedItems = form.parsedItems.filter((item) => item?.approved);
  const totalDagilim = approvedItems.reduce(
    (sum, item) => sum + Number(item?.dagilimYuzde || 0),
    0,
  );

  async function uploadReadyFile(file) {
    if (!file || !record.id) return;
    const targetFileName = `${form.kalipKodu || "kalip"}.${file?.name.split(".").pop() || "psd"}`;
    const uploaded = await uploadDesenFile(activeMainCompany, record.id, file, {
      fileRole: "kalip_hazir_dosya",
      modelId: selectedModel?.id || record.modelId,
      targetFileName,
    });
    setForm((prev) => ({
      ...prev,
      hazirDosyaFileId: uploaded.id,
      dosyaAdi: prev?.dosyaAdi || file?.name,
    }));
  }

  async function save() {
    const approved = form.parsedItems.filter((item) => item?.approved);
    if (!approved.length) {
      setMessage("Kayıt için en az 1 model kartı onaylı olmalı.");
      return;
    }
    const saved = await saveKalipYerlesim(activeMainCompany, record.id, form);
    setForm(saved);
    setMessage("Kalıp yerleşim kaydedildi.");
    onSaved?.();
  }

  return (
    <div className="kalip-screen">
      <section className="kalip-form-band">
        <div className="desen-section-heading">
          <strong>Kalıp Bilgisi</strong>
        </div>
        <div className="kalip-form-grid">
          <label>
            Dosya Adı
            <input
              value={form.dosyaAdi || ""}
              onChange={(e) => setForm({ ...form, dosyaAdi: e.target.value })}
            />
          </label>
          <label>
            Kalıp Ebatı
            <select
              value={form.kalipEbatti || ""}
              onChange={(e) =>
                setForm({ ...form, kalipEbatti: e.target.value, kalipKodu: "" })
              }
            >
              {ebatlar.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Otomatik Kalıp Kodu
            <input
              value={form.kalipKodu || ""}
              onChange={(e) => setForm({ ...form, kalipKodu: e.target.value })}
            />
          </label>
          <label>
            Kalıp Sayısı
            <input
              type="number"
              min="1"
              value={form.kalipSayisi || 1}
              onChange={(e) =>
                setForm({ ...form, kalipSayisi: Number(e.target.value) })
              }
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={!!form.yuksekKalipVar}
              onChange={(e) =>
                setForm({ ...form, yuksekKalipVar: e.target.checked })
              }
            />
            Yüksek Kalıp Var mı
          </label>
          <label>
            Yüksek Kalıp Adedi
            <input
              type="number"
              value={form.yuksekKalipAdedi || 0}
              onChange={(e) =>
                setForm({ ...form, yuksekKalipAdedi: Number(e.target.value) })
              }
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={!!form.simVar}
              onChange={(e) => setForm({ ...form, simVar: e.target.checked })}
            />
            Sim Var mı
          </label>
          <label className="wide">
            Açıklama / Not
            <textarea
              value={form.simNotu || ""}
              onChange={(e) => setForm({ ...form, simNotu: e.target.value })}
            />
          </label>
        </div>
      </section>
      <section className="kalip-main">
        <div className="kalip-action-strip">
          <span>
            Dosya adı otomatik olarak okundu ve model kartlarıyla eşleştirildi.
            Lütfen bilgileri kontrol edip onaylayınız.
          </span>
          <button type="button" onClick={parse}>
            <Wand2 size={16} />
            Dosya Adından Oku
          </button>
          <button
            type="button"
            onClick={() =>
              setForm({
                ...form,
                parsedItems: form.parsedItems.map((item) => ({
                  ...item,
                  approved: true,
                  matchStatus: "Onaylandı",
                })),
              })
            }
          >
            Hepsini Onayla
          </button>
          <button
            type="button"
            onClick={() =>
              form.parsedItems.length < 8 &&
              setForm({
                ...form,
                parsedItems: [
                  ...form.parsedItems,
                  {
                    id: `manual-${Date.now()}`,
                    rawText: "",
                    parsedModelName: "",
                    bedenBoy: "",
                    matchedModelId: "",
                    matchedModelName: "",
                    musteri: "",
                    zemin: "",
                    dagilimYuzde: 0,
                    kalipBolgesi: "",
                    matchStatus: "Eşleşmedi",
                    approved: false,
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            Kart Ekle
          </button>
        </div>
        {message ? <div className="desen-inline-message">{message}</div> : null}
        <div className="kalip-match-grid">
          {form.parsedItems.slice(0, 8).map((item, index) => (
            <KalipMatchCard
              key={item?.id}
              item={item}
              index={index}
              models={models}
              onChange={updateCard}
              onApprove={() =>
                updateCard({
                  ...item,
                  approved: true,
                  matchStatus: "Onaylandı",
                })
              }
              onRemove={() =>
                setForm({
                  ...form,
                  parsedItems: form.parsedItems.filter(
                    (row) => row?.id !== item?.id,
                  ),
                })
              }
            />
          ))}
        </div>
      </section>
      <section className="kalip-bottom">
        <div className="placement-summary file-info">
          <strong>Oluşacak Dosya Bilgisi</strong>
          <span>
            Oluşacak Dosya Adı:{" "}
            {(form.dosyaAdi || "hazir-dosya").replace(/\?.[^.]+$/, "")}_
            {form.kalipKodu || "kod"}.psd
          </span>
          <span>
            Klasör Yolu: data/documents/{activeMainCompany?.slug || "ana-firma"}
            /DESEN/{record.desenSlug || "desen"}/kalip-yerlesim/
            {new Date().getFullYear()}/
            {String(new Date().getMonth() + 1).padStart(2, "0")}/
            {form.kalipKodu || "kod"}/
          </span>
          <span>Toplam Model Kartı: {form.parsedItems.length}</span>
          <span>Onaylı Kart Dağılımı: %{totalDagilim}</span>
          <span>Tahmini Dosya Boyutu: Hazır dosya yüklenince hesaplanır</span>
          <span>Format: PSD</span>
          <label className="ready-upload">
            Hazır Dosya
            <input
              type="file"
              accept=".psd,.pdf,.ai,.zip"
              onChange={(e) => uploadReadyFile(e.target.files?.[0])}
            />
          </label>
        </div>
        <div className="placement-summary">
          <strong>Kalıp Özeti</strong>
          <span>Kod: {form.kalipKodu || "-"}</span>
          <span>Ebat: {form.kalipEbatti || "-"}</span>
          <span>Kalıp Sayısı: {form.kalipSayisi || 1}</span>
          <span>
            Bağlı Model:{" "}
            {form.parsedItems.filter((item) => item?.approved).length}
          </span>
          <span>Yüksek Kalıp: {form.yuksekKalipVar ? "Var" : "Yok"}</span>
          <span>Yüksek Kalıp Adedi: {form.yuksekKalipAdedi || 0}</span>
          <span>Sim: {form.simVar ? form.simNotu || "Var" : "Yok"}</span>
          <span>Oluşturan: Mecit Hakan</span>
          <span>Oluşturma Tarihi: {new Date().toISOString().slice(0, 10)}</span>
        </div>
      </section>
      <div className="desen-footer-actions">
        <button
          type="button"
          onClick={() =>
            setForm({
              dosyaAdi: "",
              kalipEbatti: "60x70",
              kalipSayisi: 1,
              parsedItems: [],
            })
          }
        >
          Temizle
        </button>
        <button type="button" className="primary" onClick={save}>
          Kaydet
        </button>
      </div>
    </div>
  );
}
