import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../utils/api";
import { loadModuleData, moduleLoadMessage } from "../../utils/resilientDataLoader";
import "./DosyaKlasorYonetimi.css";

const RULE_TYPES = [
  ["DESEN", "DESEN_GORSEL", "Desen Görseli"],
  ["MUHASEBE_MUSTERI", "BIZIM_IRSALIYE", "Bizim İrsaliye"],
  ["MUHASEBE_MUSTERI", "BIZIM_FATURA", "Bizim Fatura"],
  ["MUHASEBE_MUSTERI", "MUSTERI_GELEN_IRSALIYE", "Müşteri İrsaliyesi"],
  ["MUHASEBE_MUSTERI", "MUSTERI_FATURA", "Müşteri Faturası"],
  ["MUHASEBE_TEDARIKCI", "TEDARIKCI_FATURA", "Tedarikçi Faturası"],
  ["MUHASEBE_TEDARIKCI", "TEDARIKCI_IRSALIYE", "Tedarikçi İrsaliyesi"],
  ["IK_PERSONEL", "PERSONEL_DIGER", "Personel Evrakları"],
  ["CEK", "CEK_GORSEL", "Çek Görseli"],
  ["TASNIF", "TASNIF_RAPORU", "Tasnif Raporu"],
];

const EXT_OPTIONS = ["pdf", "xml", "zip", "jpg", "jpeg", "png", "webp", "xlsx", "xls", "doc", "docx"];

const DEFAULT_FORM = {
  id: "",
  module: "DESEN",
  documentType: "DESEN_GORSEL",
  displayName: "Desen Görseli",
  targetPathTemplate: "desen/modeller",
  allowedExtensions: "jpg,jpeg,png,webp",
  watchEnabled: true,
  watchSourcePath: "",
  isActive: true,
  imageResizeEnabled: true,
  imageMaxWidth: 1200,
  imageMaxHeight: 1200,
  thumbEnabled: true,
  thumbWidth: 320,
  thumbHeight: 320,
};

function toRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload?.items;
  return [];
}

function normalizeRules(rows) {
  return toRows(rows).filter((rule) => {
    if (rule.module !== "IK_PERSONEL") return true;
    return rule.documentType === "PERSONEL_DIGER";
  });
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR");
}

function typeLabel(module, documentType) {
  return RULE_TYPES.find(([m, d]) => m === module && d === documentType)?.[2] || documentType;
}

function parseExtensions(value) {
  return String(value || "")
    .split(",")
    .map((item) => item?.trim().replace(/^\./, "").toLowerCase())
    .filter(Boolean);
}

function makeTemplate(module, documentType) {
  if (module === "IK_PERSONEL") return "ik/personel/{personel}";
  if (documentType === "DESEN_GORSEL") return "desen/modeller";
  if (documentType === "BIZIM_IRSALIYE") return "muhasebe/musteri/{yil}/{ay}/bizim-irsaliye";
  if (documentType === "BIZIM_FATURA") return "muhasebe/musteri/{yil}/{ay}/bizim-fatura";
  if (documentType === "MUSTERI_GELEN_IRSALIYE") return "muhasebe/musteri/{yil}/{ay}/musteri-irsaliye";
  if (documentType === "MUSTERI_FATURA") return "muhasebe/musteri/{yil}/{ay}/musteri-fatura";
  if (documentType === "TEDARIKCI_FATURA") return "muhasebe/tedarikci/{yil}/{ay}/fatura";
  if (documentType === "TEDARIKCI_IRSALIYE") return "muhasebe/tedarikci/{yil}/{ay}/irsaliye";
  if (documentType === "CEK_GORSEL") return "muhasebe/cekler/{yil}/{ay}/{cekTipi}";
  return "dosyalar/{yil}/{ay}";
}

function makeExtensions(documentType) {
  if (documentType === "DESEN_GORSEL") return "jpg,jpeg,png,webp";
  if (documentType === "TASNIF_RAPORU") return "xlsx,xls,pdf";
  if (documentType === "PERSONEL_DIGER") return "pdf,doc,docx,jpg,jpeg,png";
  if (documentType === "CEK_GORSEL") return "jpg,jpeg,png,pdf";
  return "pdf,xml,zip";
}

export default function DosyaKlasorYonetimi({ activeMainCompany }) {
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState({ storageRoot: "" });
  const [rules, setRules] = useState([]);
  const [files, setFiles] = useState([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [selectedRuleId, setSelectedRuleId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [importSummary, setImportSummary] = useState(null);

  const companyParams = useMemo(
    () => ({
      mainCompanyId: activeMainCompany?.id || "",
      mainCompanySlug: activeMainCompany?.slug || "",
    }),
    [activeMainCompany],
  );

  const loadAll = useCallback(async () => {
    if (!companyParams.mainCompanyId && !companyParams.mainCompanySlug) return;
    setLoading(true);
    try {
      const tenant = companyParams.mainCompanySlug || companyParams.mainCompanyId;
      const result = await loadModuleData({
        scope: `admin:${tenant}:dosya-depolama`,
        sources: {
          status: { critical: true, load: () => apiGet("/admin/file-storage/status", companyParams) },
          settings: { fallback: {}, load: () => apiGet("/admin/file-storage/settings", {}) },
          rules: { fallback: [], load: () => apiGet("/admin/file-storage/rules", companyParams) },
          files: { fallback: [], load: () => apiGet("/admin/file-storage/files", { ...companyParams, take: 100 }) },
        },
      });
      if (result.states.status.status !== "error") setStatus(result.data.status);
      if (result.states.settings.status !== "error" || result.states.status.status !== "error") {
        setSettings({ storageRoot: result.data.settings?.storageRoot || result.data.status?.storageRoot || "" });
      }
      if (result.states.rules.status !== "error") setRules(normalizeRules(result.data.rules));
      if (result.states.files.status !== "error") setFiles(toRows(result.data.files));
      setMessage(moduleLoadMessage(result, "Dosya depolama ana durumu alınamadı; son başarılı durum korunuyor.", "Bazı dosya kuralları veya listeler yenilenemedi; ana depolama durumu kullanılabilir.") || "Güncellendi.");
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setLoading(false);
    }
  }, [companyParams]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function selectType(value) {
    const [module, documentType, displayName] = value.split("|");
    setForm((prev) => ({
      ...prev,
      module,
      documentType,
      displayName,
      targetPathTemplate: makeTemplate(module, documentType),
      allowedExtensions: makeExtensions(documentType),
      imageResizeEnabled: documentType === "DESEN_GORSEL",
      thumbEnabled: documentType === "DESEN_GORSEL" || documentType === "CEK_GORSEL",
      watchEnabled: ["DESEN_GORSEL", "BIZIM_IRSALIYE", "BIZIM_FATURA", "MUSTERI_GELEN_IRSALIYE", "MUSTERI_FATURA"].includes(documentType),
    }));
    setSelectedRuleId("");
    setTestResult(null);
    setImportSummary(null);
  }

  function editRule(rule) {
    setSelectedRuleId(rule.id);
    setForm({
      ...DEFAULT_FORM,
      ...rule,
      watchSourcePath: rule.watchSourcePath || "",
    });
    setTestResult(null);
    setImportSummary(null);
  }

  function toggleExtension(ext) {
    const current = new Set(parseExtensions(form.allowedExtensions));
    if (current?.has(ext)) current?.delete(ext);
    else current?.add(ext);
    setForm((prev) => ({ ...prev, allowedExtensions: Array.from(current).join(",") }));
  }

  async function seedRules() {
    try {
      setLoading(true);
      const result = await apiPost("/admin/file-storage/seed-default-rules", companyParams);
      setMessage(`Default kurallar hazır. Yeni: ${result?.createdCount || 0}, mevcut: ${result?.skippedCount || 0}`);
      await loadAll();
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(event) {
    event?.preventDefault();
    try {
      setLoading(true);
      const result = await apiPatch("/admin/file-storage/settings", {
        storageRoot: settings.storageRoot,
      });
      setSettings({ storageRoot: result?.storageRoot || settings.storageRoot });
      setMessage("ERP ana dosya klasörü kaydedildi. Backend otomatik yeni yolu kullanacak.");
      await loadAll();
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function saveRule(event) {
    event?.preventDefault();
    try {
      setLoading(true);
      const payload = {
        ...form,
        ...companyParams,
        maxFileSizeMb: null,
      };
      if (form.id) await apiPatch(`/admin/file-storage/rules/${form.id}`, payload);
      else await apiPost("/admin/file-storage/rules", payload);
      setMessage("Kural kaydedildi.");
      await loadAll();
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function testWatchPath(id = form.id) {
    if (!id) {
      setTestResult({ ok: false, error: "Önce kayıtlı kural seçin." });
      return;
    }
    try {
      setTestResult(await apiPost(`/admin/file-storage/rules/${id}/test-watch-path`, {}));
    } catch (error) {
      setTestResult({ ok: false, error: error?.message });
    }
  }

  async function importWatchFolder(id = form.id) {
    if (!id) return;
    try {
      setLoading(true);
      const result = await apiPost(`/admin/file-storage/rules/${id}/import-watch-folder`, {});
      setImportSummary(result);
      setMessage(
        `Klasör kontrol edildi. Toplam: ${result?.totalFileCount || 0}, izinli: ${result?.allowedFileCount || 0}, kayıtlı: ${result?.registeredCount || 0}, atlanan: ${result?.skippedCount || 0}`,
      );
      await loadAll();
    } catch (error) {
      setMessage(`Hata: ${error?.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function softDeleteFile(id) {
    await apiDelete(`/admin/file-storage/files/${id}`, companyParams);
    await loadAll();
  }

  const checkedExtensions = parseExtensions(form.allowedExtensions);

  return (
    <div className="ky-file-admin">
      <div className="ky-file-admin__head">
        <div>
          <h1>Dosya ve Klasör Yönetimi</h1>
          <p>Belge türü için saklama klasörü ve izlenecek klasörü seç.</p>
        </div>
        <button className="ky-primary-btn" type="button" onClick={seedRules} disabled={loading}>
          Default Kuralları Hazırla
        </button>
      </div>

      <div className="ky-admin-info">{loading ? "İşleniyor... " : ""}{message}</div>

      <section className="ky-file-admin__status">
        <div><span>STORAGE_ROOT</span><strong>{status.storageRoot || "-"}</strong></div>
        <div><span>Erişim</span><strong>{status.accessible ? "Erişilebilir" : "Kontrol gerekli"}</strong></div>
        <div><span>Son Dosya</span><strong>{formatDate(status.lastFile.createdAt)}</strong></div>
        <div><span>Toplam Dosya</span><strong>{status.totalFileCount ?? 0}</strong></div>
      </section>

      <section className="ky-file-admin__section">
        <div className="ky-card-head"><h3>Uygulama Klasörü</h3></div>
        <form className="ky-file-admin__root-form" onSubmit={saveSettings}>
          <label>
            ERP ana dosya klasörü
            <input
              value={settings.storageRoot}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, storageRoot: event?.target.value }))
              }
              placeholder={String.raw`Örn: D:\OneDrive\KY-ERP\storage`}
            />
          </label>
          <button className="ky-primary-btn" type="submit" disabled={loading}>
            Klasörü Kaydet
          </button>
        </form>
      </section>

      <section className="ky-file-admin__section">
        <div className="ky-card-head"><h3>Kural Ayarı</h3></div>
        <form className="ky-file-admin__simple-form" onSubmit={saveRule}>
          <label>
            Belge türü
            <select value={`${form.module}|${form.documentType}|${form.displayName}`} onChange={(e) => selectType(e.target.value)}>
              {RULE_TYPES.map(([module, documentType, label]) => (
                <option key={`${module}-${documentType}`} value={`${module}|${documentType}|${label}`}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            ERP içinde saklanacak klasör
            <input value={form.targetPathTemplate} onChange={(e) => setForm((p) => ({ ...p, targetPathTemplate: e.target.value }))} />
          </label>
          <label>
            İzlenecek dış klasör
            <input value={form.watchSourcePath} onChange={(e) => setForm((p) => ({ ...p, watchSourcePath: e.target.value, watchEnabled: Boolean(e.target.value.trim()) }))} />
          </label>
          <label>
            İzinli uzantılar
            <input value={form.allowedExtensions} onChange={(e) => setForm((p) => ({ ...p, allowedExtensions: e.target.value }))} />
          </label>
          <div className="ky-file-admin__exts">
            {EXT_OPTIONS.map((ext) => (
              <button
                key={ext}
                type="button"
                className={checkedExtensions.includes(ext) ? "active" : ""}
                onClick={() => toggleExtension(ext)}
              >
                {ext}
              </button>
            ))}
          </div>
          <label className="ky-file-admin__check"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} /> Aktif</label>
          <label className="ky-file-admin__check"><input type="checkbox" checked={form.watchEnabled} onChange={(e) => setForm((p) => ({ ...p, watchEnabled: e.target.checked }))} /> Bu klasörü izle</label>
          <div className="ky-file-admin__actions">
            <button className="ky-primary-btn" type="submit" disabled={loading}>{form.id ? "Kaydet" : "Yeni Kural Ekle"}</button>
            <button className="ky-soft-btn" type="button" onClick={() => testWatchPath()} disabled={!form.id}>Klasörü Test Et</button>
            <button className="ky-soft-btn" type="button" onClick={() => importWatchFolder()} disabled={!form.id || !form.watchSourcePath}>Klasördeki Dosyaları Al</button>
          </div>
        </form>
        {testResult ? (
          <div className={testResult.ok ? "ky-file-admin__test ok" : "ky-file-admin__test"}>
            <strong>{testResult.ok ? "Klasör erişilebilir." : "Klasör kontrol edilemedi."}</strong>
            <span>Son hata: {testResult.error || "-"}</span>
          </div>
        ) : null}
        {importSummary ? (
          <div className="ky-file-admin__import-summary">
            <strong>Oto kontrol</strong>
            <span>Mevcut dosya: {importSummary.totalFileCount || 0}</span>
            <span>İzinli dosya: {importSummary.allowedFileCount || 0}</span>
            <span>Kayıtlı: {importSummary.registeredCount || 0}</span>
            <span>Yeni: {importSummary.importedNewCount || 0}</span>
            <span>Mevcut/duplicate: {importSummary.duplicateCount || 0}</span>
            <span>Atlanan: {importSummary.skippedCount || 0}</span>
            {Array.isArray(importSummary.skipped) && importSummary.skipped.length ? (
              <div className="ky-file-admin__skipped">
                {importSummary.skipped.slice(0, 30).map((item) => (
                  <span key={`${item?.fileName}-${item?.reason}`}>{item?.fileName}: {item?.reason}</span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="ky-file-admin__section">
        <div className="ky-card-head"><h3>Kurallar</h3></div>
        <div className="ky-table-wrap ky-file-admin__files-scroll">
          <table className="ky-table">
            <thead>
              <tr>
                <th>Belge Türü</th>
                <th>Saklama Klasörü</th>
                <th>İzlenecek Klasör</th>
                <th>Uzantılar</th>
                <th>Aktif</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className={selectedRuleId === rule.id ? "ky-file-admin__selected" : ""}>
                  <td>{rule.displayName || typeLabel(rule.module, rule.documentType)}</td>
                  <td>{rule.targetPathTemplate}</td>
                  <td>{rule.watchSourcePath || "-"}</td>
                  <td>{rule.allowedExtensions}</td>
                  <td>{rule.isActive ? "Evet" : "Hayır"}</td>
                  <td><button className="ky-soft-btn" type="button" onClick={() => editRule(rule)}>Düzenle</button></td>
                </tr>
              ))}
              {!rules.length ? <tr><td colSpan={6}>Kayıtlı kural yok.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ky-file-admin__section">
        <div className="ky-card-head"><h3>Son Kaydedilen Dosyalar</h3></div>
        <div className="ky-table-wrap ky-file-admin__files-scroll">
          <table className="ky-table">
            <thead><tr><th>Dosya</th><th>Tür</th><th>Yol</th><th>Tarih</th><th>İşlem</th></tr></thead>
            <tbody>
              {files.map((file) => (
                <tr key={file?.id}>
                  <td>{file?.originalFileName}</td>
                  <td>{typeLabel(file?.module, file?.documentType)}</td>
                  <td>{file?.relativePath}</td>
                  <td>{formatDate(file?.createdAt)}</td>
                  <td><button className="ky-soft-btn" type="button" onClick={() => softDeleteFile(file?.id)}>Arşivle</button></td>
                </tr>
              ))}
              {!files.length ? <tr><td colSpan={5}>Kayıtlı dosya yok.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
