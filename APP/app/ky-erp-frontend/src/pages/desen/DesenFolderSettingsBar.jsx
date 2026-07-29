import { useEffect, useState } from "react";
import {
  CheckCircle2,
  FolderCog,
  FolderOpen,
  LoaderCircle,
  Save,
  ShieldCheck,
} from "lucide-react";
import {
  getDesenFolderSettings,
  openDesenIncomingFolder,
  saveDesenFolderSettings,
  testDesenFolderSettings,
} from "../../services/desenFolderSettingsApi";
import { WideModal } from "./DesenWorkflowShared";

const EMPTY_FORM = {
  incomingFolder: "",
  modelsFolder: "",
  processedFolder: "",
  errorFolder: "",
  archiveFolder: "",
};

const FIELDS = [
  {
    key: "incomingFolder",
    label: "Gelen Görsel Klasörü",
    note: "Yeni model, kanal ve yerleşim görselleri bu klasörden taranır.",
  },
  {
    key: "modelsFolder",
    label: "Model Arşiv Klasörü",
    note: "Kaydedilen model görselleri firma ve model düzeniyle burada tutulur.",
  },
  {
    key: "processedFolder",
    label: "İşlenen Dosyalar",
    note: "Başarıyla alınan kaynak görseller bu klasöre taşınır.",
  },
  {
    key: "errorFolder",
    label: "İşlenemeyen Dosyalar",
    note: "Hatalı veya desteklenmeyen dosyalar bu klasöre ayrılır.",
  },
  {
    key: "archiveFolder",
    label: "Desen Arşivi",
    note: "Pasif veya eski model dosyaları için kalıcı arşiv klasörüdür.",
  },
];

function settingsOf(result) {
  return result?.settings || result || EMPTY_FORM;
}

export default function DesenFolderSettingsBar({ activeMainCompany }) {
  const [result, setResult] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (!activeMainCompany?.slug && !activeMainCompany?.id) return undefined;
    setBusy("load");
    getDesenFolderSettings(activeMainCompany)
      .then((data) => {
        if (!active) return;
        setResult(data || null);
        setForm({ ...EMPTY_FORM, ...settingsOf(data) });
        setMessage("");
      })
      .catch((error) => {
        if (active) setMessage(error?.message || "Desen klasör ayarları alınamadı.");
      })
      .finally(() => {
        if (active) setBusy("");
      });
    return () => {
      active = false;
    };
  }, [activeMainCompany]);

  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const testConnection = async () => {
    setBusy("test");
    setMessage("");
    try {
      const tested = await testDesenFolderSettings(activeMainCompany, form);
      setResult(tested);
      setMessage(
        tested?.ok
          ? `Klasör bağlantıları sağlam. Gelen klasörde ${tested.pendingFileCount || 0} desteklenen dosya var.`
          : "Bazı klasörlere erişilemiyor veya yazılamıyor.",
      );
    } catch (error) {
      setMessage(error?.message || "Klasör bağlantı testi başarısız.");
    } finally {
      setBusy("");
    }
  };

  const save = async () => {
    setBusy("save");
    setMessage("");
    try {
      const saved = await saveDesenFolderSettings(activeMainCompany, form);
      const settings = settingsOf(saved);
      setResult(saved);
      setForm({ ...EMPTY_FORM, ...settings });
      setMessage(
        `Klasör ayarları kaydedildi. Gelen klasörde ${saved?.pendingFileCount || 0} desteklenen dosya var.`,
      );
      setOpen(false);
    } catch (error) {
      setMessage(error?.message || "Desen klasör ayarları kaydedilemedi.");
    } finally {
      setBusy("");
    }
  };

  const openFolder = async () => {
    setBusy("open");
    setMessage("");
    try {
      const opened = await openDesenIncomingFolder(activeMainCompany);
      setMessage(
        opened?.opened
          ? "Gelen görsel klasörü açıldı."
          : opened?.message || "Klasör açılamadı.",
      );
    } catch (error) {
      setMessage(error?.message || "Gelen görsel klasörü açılamadı.");
    } finally {
      setBusy("");
    }
  };

  const connected = result?.ok === true;
  const incomingFolder = settingsOf(result)?.incomingFolder || form.incomingFolder;

  return (
    <>
      <section className="dsg-toolbar-card">
        <div className="dsg-toolbar-main">
          <span className={`dsg-btn ${connected ? "active" : ""}`}>
            {busy === "load" ? (
              <LoaderCircle className="spin" size={16} />
            ) : connected ? (
              <ShieldCheck size={16} />
            ) : (
              <FolderCog size={16} />
            )}
            {connected ? "Görsel Klasörü Bağlı" : "Görsel Klasörü Kontrol Edilecek"}
          </span>
          <button className="dsg-btn" type="button" onClick={() => setOpen(true)}>
            <FolderCog size={16} /> Klasör Ayarları
          </button>
          <button
            className="dsg-btn"
            type="button"
            disabled={Boolean(busy)}
            onClick={openFolder}
          >
            <FolderOpen size={16} /> Gelen Klasörü Aç
          </button>
        </div>
        <div className="dsg-scan-meta">
          <CheckCircle2 size={16} />
          <span>Model oluşturma kaynağı</span>
          <strong>{result?.pendingFileCount || 0} dosya</strong>
          <code>{incomingFolder || "Klasör ayarı bekleniyor"}</code>
        </div>
      </section>

      {message ? <div className="dsg-page-message">{message}</div> : null}

      {open ? (
        <WideModal
          title="Desen Görsel Klasör Ayarları"
          subtitle="Gelen görseller, model arşivi ve hata klasörleri tek merkezden yönetilir."
          onClose={() => setOpen(false)}
          footer={
            <>
              <span className="dsg-foot-message">{message}</span>
              <button
                className="dsg-btn ghost"
                type="button"
                disabled={Boolean(busy)}
                onClick={() => setOpen(false)}
              >
                Vazgeç
              </button>
              <button
                className="dsg-btn"
                type="button"
                disabled={Boolean(busy)}
                onClick={testConnection}
              >
                {busy === "test" ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                Bağlantıyı Test Et
              </button>
              <button
                className="dsg-btn primary"
                type="button"
                disabled={Boolean(busy)}
                onClick={save}
              >
                {busy === "save" ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Save size={15} />
                )}
                Kaydet ve Bağla
              </button>
            </>
          }
        >
          <div className="dsg-form-grid">
            {FIELDS.map((field) => (
              <label key={field.key} className="full">
                <span>{field.label}</span>
                <input
                  value={form[field.key] || ""}
                  onChange={(event) => update(field.key, event.target.value)}
                  placeholder="D:\\Onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\STORAGE\\desen\\gelen"
                />
                <small>{field.note}</small>
              </label>
            ))}
          </div>
        </WideModal>
      ) : null}
    </>
  );
}
