import { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../utils/api";
import "./AdminManagement.css";

const RULE_TYPES = [
  ["DESEN", "DESEN_GORSEL", "Desen Görseli", "jpg,jpeg,png,webp", "desen/modeller"],
  ["MUHASEBE_MUSTERI", "BIZIM_IRSALIYE", "Bizim İrsaliye", "pdf,xml,zip", "muhasebe/musteri/{yil}/{ay}/bizim-irsaliye"],
  ["MUHASEBE_MUSTERI", "BIZIM_FATURA", "Bizim Fatura", "pdf,xml,zip", "muhasebe/musteri/{yil}/{ay}/bizim-fatura"],
  ["MUHASEBE_MUSTERI", "MUSTERI_GELEN_IRSALIYE", "Müşteri İrsaliyesi", "pdf,xml,zip", "muhasebe/musteri/{yil}/{ay}/musteri-irsaliye"],
  ["MUHASEBE_MUSTERI", "MUSTERI_FATURA", "Müşteri Faturası", "pdf,xml,zip", "muhasebe/musteri/{yil}/{ay}/musteri-fatura"],
  ["MUHASEBE_TEDARIKCI", "TEDARIKCI_FATURA", "Tedarikçi Faturası", "pdf,xml,zip", "muhasebe/tedarikci/{yil}/{ay}/fatura"],
  ["MUHASEBE_TEDARIKCI", "TEDARIKCI_IRSALIYE", "Tedarikçi İrsaliyesi", "pdf,xml,zip", "muhasebe/tedarikci/{yil}/{ay}/irsaliye"],
  ["IK_PERSONEL", "PERSONEL_DIGER", "Personel Evrakı", "pdf,doc,docx,jpg,jpeg,png", "ik/personel/{personel}"],
  ["CEK", "CEK_GORSEL", "Çek Görseli", "jpg,jpeg,png,pdf", "muhasebe/cekler/{yil}/{ay}/{cekTipi}"],
];

const EMPTY = {
  id: "",
  module: "DESEN",
  documentType: "DESEN_GORSEL",
  displayName: "Desen Görseli",
  targetPathTemplate: "desen/modeller",
  allowedExtensions: "jpg,jpeg,png,webp",
  isActive: true,
  imageResizeEnabled: true,
  imageMaxWidth: 1200,
  imageMaxHeight: 1200,
  thumbEnabled: true,
  thumbWidth: 320,
  thumbHeight: 320,
};

function dataOf(value) { return value?.data ?? value ?? {}; }
function rowsOf(value) { const data = dataOf(value); if (Array.isArray(data)) return data; if (Array.isArray(data.items)) return data.items; return []; }
function dateText(value) { if (!value) return "-"; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR"); }
function fileName(row) { return row.fileName || row.originalName || row.name || row.fileKey || "Dosya"; }

export default function AdminStorageCenter({ activeMainCompany }) {
  const [status, setStatus] = useState({ storageRoot: "", accessible: false, totalFileCount: 0, lastFile: null });
  const [settings, setSettings] = useState({ storageRoot: "R2://ky-erp-files", archiveTargets: [], archiveCapabilities: {} });
  const [rules, setRules] = useState([]);
  const [files, setFiles] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [tab, setTab] = useState("RULES");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Depolama sistemi kontrol ediliyor...");

  const params = useMemo(() => ({
    mainCompanyId: activeMainCompany?.id || "",
    mainCompanySlug: activeMainCompany?.slug || "",
  }), [activeMainCompany?.id, activeMainCompany?.slug]);

  const load = useCallback(async () => {
    if (!params.mainCompanyId && !params.mainCompanySlug) {
      setMessage("Önce aktif ana firma seçin.");
      return;
    }
    setBusy(true);
    const [statusJob, settingsJob, rulesJob, filesJob] = await Promise.allSettled([
      apiGet("/admin/file-storage/status", params),
      apiGet("/admin/file-storage/settings", params),
      apiGet("/admin/file-storage/rules", params),
      apiGet("/admin/file-storage/files", { ...params, take: 100 }),
    ]);
    if (statusJob.status === "fulfilled") setStatus((old) => ({ ...old, ...dataOf(statusJob.value) }));
    if (settingsJob.status === "fulfilled") {
      const data = dataOf(settingsJob.value);
      setSettings({
        storageRoot: data.storageRoot || "R2://ky-erp-files",
        archiveTargets: Array.isArray(data.archiveTargets) ? data.archiveTargets : [],
        archiveCapabilities: data.archiveCapabilities || {},
      });
    }
    if (rulesJob.status === "fulfilled") setRules(rowsOf(rulesJob.value));
    if (filesJob.status === "fulfilled") setFiles(rowsOf(filesJob.value));
    const failed = [statusJob, settingsJob, rulesJob, filesJob].filter((job) => job.status === "rejected").length;
    setMessage(failed ? `${failed} depolama kontrolü yanıt vermedi; alınan veriler korunuyor.` : "R2 dosya ve arşiv ayarları güncel.");
    setBusy(false);
  }, [params]);

  useEffect(() => { load(); }, [load]);

  function chooseType(value) {
    const item = RULE_TYPES.find((row) => `${row[0]}|${row[1]}` === value) || RULE_TYPES[0];
    setForm((old) => ({
      ...old,
      id: "",
      module: item[0],
      documentType: item[1],
      displayName: item[2],
      allowedExtensions: item[3],
      targetPathTemplate: item[4],
      imageResizeEnabled: item[1] === "DESEN_GORSEL",
      thumbEnabled: ["DESEN_GORSEL", "CEK_GORSEL"].includes(item[1]),
    }));
  }

  function toggleArchive(provider) {
    const capability = provider === "GOOGLE_DRIVE"
      ? settings.archiveCapabilities?.googleDrive
      : settings.archiveCapabilities?.oneDrive;
    if (!capability) return;
    setSettings((old) => ({
      ...old,
      archiveTargets: old.archiveTargets.includes(provider)
        ? old.archiveTargets.filter((item) => item !== provider)
        : [...old.archiveTargets, provider],
    }));
  }

  async function saveStorage(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = dataOf(await apiPatch("/admin/file-storage/settings", { ...params, archiveTargets: settings.archiveTargets }));
      setSettings({
        storageRoot: result.storageRoot || "R2://ky-erp-files",
        archiveTargets: Array.isArray(result.archiveTargets) ? result.archiveTargets : [],
        archiveCapabilities: result.archiveCapabilities || settings.archiveCapabilities || {},
      });
      setMessage("R2 ve dış arşiv hedefleri kaydedildi.");
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Depolama ayarı kaydedilemedi."}`);
    } finally {
      setBusy(false);
    }
  }

  async function seed() {
    setBusy(true);
    try {
      const result = dataOf(await apiPost("/admin/file-storage/seed-default-rules", params));
      setMessage(`Varsayılan kurallar kontrol edildi. Yeni: ${result.createdCount || 0}, mevcut: ${result.skippedCount || 0}.`);
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Kurallar hazırlanamadı."}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveRule(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const body = { ...form, ...params, maxFileSizeMb: null };
      if (form.id) await apiPatch(`/admin/file-storage/rules/${encodeURIComponent(form.id)}`, body);
      else await apiPost("/admin/file-storage/rules", body);
      setForm(EMPTY);
      setMessage("Dosya saklama kuralı kaydedildi.");
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Kural kaydedilemedi."}`);
    } finally {
      setBusy(false);
    }
  }

  async function archiveFile(id) {
    if (!id) return;
    setBusy(true);
    try {
      await apiDelete(`/admin/file-storage/files/${encodeURIComponent(id)}`, params);
      setMessage("Dosya güvenli R2 arşiv alanına taşındı.");
      await load();
    } catch (error) {
      setMessage(`Hata: ${error?.message || "Dosya arşivlenemedi."}`);
    } finally {
      setBusy(false);
    }
  }

  const googleReady = Boolean(settings.archiveCapabilities?.googleDrive);
  const oneDriveReady = Boolean(settings.archiveCapabilities?.oneDrive);

  return <div className="admpro-page">
    <header className="admpro-head">
      <div><span className="admpro-kicker">YÖNETİM / DOSYA & DEPOLAMA</span><h2>Dosya & Depolama Merkezi</h2><p>Canlı ana dosya katmanı Cloudflare R2; yedekler istenirse Google Drive ve OneDrive'a ayrıca arşivlenir.</p></div>
      <div className="admpro-actions"><button onClick={seed} disabled={busy}>Varsayılan Kuralları Kontrol Et</button><button className="primary" onClick={load} disabled={busy}>Yenile</button></div>
    </header>
    <div className={`admpro-notice ${message.startsWith("Hata") ? "error" : message.includes("yanıt vermedi") ? "warn" : "success"}`}>{message}</div>

    <section className="admpro-stats">
      <div className="admpro-stat"><span>Ana Depolama</span><strong>{status.accessible ? "R2 HAZIR" : "KONTROL"}</strong><small>{status.storageRoot || settings.storageRoot || "R2://ky-erp-files"}</small></div>
      <div className="admpro-stat"><span>Saklama Kuralı</span><strong>{rules.length}</strong><small>Belge tipine göre hedef yol</small></div>
      <div className="admpro-stat"><span>Canlı Dosya</span><strong>{status.totalFileCount ?? files.length}</strong><small>Son liste {files.length} kayıt</small></div>
      <div className="admpro-stat"><span>Son Dosya</span><strong>{status.lastFile ? "VAR" : "-"}</strong><small>{dateText(status.lastFile?.createdAt || status.lastFile?.uploadedAt)}</small></div>
    </section>

    <form className="admpro-card" onSubmit={saveStorage}>
      <div className="admpro-card-head"><div><h3>Kalıcı Saklama & Dış Arşiv</h3><p>R2 ana kaynaktır. Dış servislerde yalnız yedek kopyası tutulur; servis anahtarları ekranda gösterilmez.</p></div></div>
      <div className="admpro-integration">
        <div><span>Cloudflare R2</span><strong>ANA KAYNAK</strong><small>{settings.storageRoot || "R2://ky-erp-files"}</small></div>
        <div><span>Google Drive Yedek Arşivi</span><strong>{googleReady ? "HAZIR" : "SECRET EKSİK"}</strong><label className="admpro-check"><input type="checkbox" disabled={!googleReady} checked={settings.archiveTargets.includes("GOOGLE_DRIVE")} onChange={() => toggleArchive("GOOGLE_DRIVE")}/> Yedekleri ayrıca Google Drive'a kopyala</label></div>
        <div><span>OneDrive Yedek Arşivi</span><strong>{oneDriveReady ? "HAZIR" : "SECRET EKSİK"}</strong><label className="admpro-check"><input type="checkbox" disabled={!oneDriveReady} checked={settings.archiveTargets.includes("ONEDRIVE")} onChange={() => toggleArchive("ONEDRIVE")}/> Yedekleri ayrıca OneDrive'a kopyala</label></div>
        <div><span>Yerel Klasör</span><strong>ANA KAYNAK DEĞİL</strong><small>Cloud Worker yerel D:\ yoluna erişmez. OneDrive/Drive senkron klasörü canlı veritabanı yerine yedek kopyası olarak kullanılır.</small></div>
      </div>
      <div className="admpro-actions" style={{ justifyContent: "flex-start", marginTop: 12 }}><button className="primary" type="submit" disabled={busy}>Depolama & Arşiv Ayarını Kaydet</button></div>
    </form>

    <nav className="admpro-section-tabs">
      <button className={tab === "RULES" ? "active" : ""} onClick={() => setTab("RULES")}>Saklama Kuralları · {rules.length}</button>
      <button className={tab === "FILES" ? "active" : ""} onClick={() => setTab("FILES")}>Son Dosyalar · {files.length}</button>
    </nav>

    {tab === "RULES" ? <section className="admpro-grid-2">
      <div className="admpro-card">
        <div className="admpro-card-head"><div><h3>{form.id ? "Kuralı Düzenle" : "Yeni Saklama Kuralı"}</h3><p>Belge türü, izinli uzantılar ve R2 hedef yolu.</p></div>{form.id ? <button onClick={() => setForm(EMPTY)}>Yeni Kural</button> : null}</div>
        <form onSubmit={saveRule}>
          <div className="admpro-form-grid">
            <label>Belge Türü<select value={`${form.module}|${form.documentType}`} onChange={(event) => chooseType(event.target.value)}>{RULE_TYPES.map((item) => <option key={`${item[0]}|${item[1]}`} value={`${item[0]}|${item[1]}`}>{item[2]}</option>)}</select></label>
            <label>İzinli Uzantılar<input value={form.allowedExtensions || ""} onChange={(event) => setForm((old) => ({ ...old, allowedExtensions: event.target.value }))}/></label>
            <label className="wide">R2 Hedef Yolu<input value={form.targetPathTemplate || ""} onChange={(event) => setForm((old) => ({ ...old, targetPathTemplate: event.target.value }))}/></label>
            <label className="admpro-check wide"><input type="checkbox" checked={form.isActive !== false} onChange={(event) => setForm((old) => ({ ...old, isActive: event.target.checked }))}/> Kural aktif</label>
          </div>
          <div className="admpro-actions" style={{ justifyContent: "flex-start", marginTop: 12 }}><button className="primary" type="submit" disabled={busy}>Kuralı Kaydet</button></div>
        </form>
      </div>
      <div className="admpro-card">
        <div className="admpro-card-head"><div><h3>Kayıtlı Kurallar</h3><p>Bir kurala tıklayarak aynı panelde düzenleyin.</p></div></div>
        <div className="admpro-list">{rules.map((row) => <div className="admpro-list-item" key={row.id}><div><strong>{row.displayName || row.documentType}</strong><small>{row.targetPathTemplate || "-"} · {row.allowedExtensions || "-"}</small></div><div className="admpro-row-actions"><span className={`admpro-badge ${row.isActive !== false ? "ok" : "warn"}`}>{row.isActive !== false ? "Aktif" : "Pasif"}</span><button onClick={() => setForm({ ...EMPTY, ...row })}>Düzenle</button></div></div>)}{!rules.length ? <div className="admpro-empty">Kural yok. Varsayılan kuralları hazırlayabilirsiniz.</div> : null}</div>
      </div>
    </section> : null}

    {tab === "FILES" ? <section className="admpro-card">
      <div className="admpro-table"><table><thead><tr><th>Dosya</th><th>Tür</th><th>Kaynak</th><th>Boyut</th><th>Kayıt Tarihi</th><th>Durum</th><th>İşlem</th></tr></thead><tbody>{files.map((row) => <tr key={row.id || row.fileKey}><td><strong>{fileName(row)}</strong><small className="admpro-code">{row.fileKey || row.objectKey || ""}</small></td><td>{row.documentType || row.extension || "-"}</td><td>{row.sourceType || "R2"}</td><td>{row.fileSize ? `${Math.round(Number(row.fileSize) / 1024)} KB` : "-"}</td><td>{dateText(row.createdAt || row.uploadedAt)}</td><td><span className="admpro-badge ok">R2</span></td><td><button className="danger" onClick={() => archiveFile(row.id)}>Arşive Taşı</button></td></tr>)}{!files.length ? <tr><td colSpan="7">Dosya kaydı bulunamadı.</td></tr> : null}</tbody></table></div>
    </section> : null}
  </div>;
}
