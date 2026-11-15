import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Building2,
  CheckCircle2,
  Link2,
  Eye,
  EyeOff,
  ExternalLink,
  LoaderCircle,
  Mail,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Truck,
  UserPlus,
  Users,
} from "lucide-react";
import { fetchCompanies } from "../../../services/muhasebeService";
import { fetchSharedModels } from "../../../services/desenService";
import {
  getIsnetSettings,
  getIsnetPortalHealth,
  getIsnetEgressHealth,
  saveIsnetSettings,
  testIsnetSettings,
} from "../../../services/isnetApi";
import {
  createIsnetContact,
  createIsnetDepartment,
  createIsnetModelMapping,
  deleteIsnetModelMapping,
  getIsnetBusinessSettings,
  saveIsnetBusinessSettings,
  updateIsnetContact,
  updateIsnetDepartment,
} from "../../../services/isnetBusinessSettingsApi";
import { loadModuleData, moduleLoadMessage } from "../../../utils/resilientDataLoader";
import "./eBelgeIntegrationsWorkspace.css";
import IntegrationFlowSteps from "../common/IntegrationFlowSteps";
import { saveIsnetBrowserCredentials, loadIsnetBrowserCredentials } from "./isnetBrowserVault";
import { getIsnetConnectionModePreference, saveIsnetConnectionModePreference } from "./isnetConnectionModePreference";

const SECTIONS = [
  ["connection", "Bağlantı", ShieldCheck],
  ["carrier", "Taşıyıcı Sabitleri", Truck],
  ["contacts", "Departman ve Kişiler", Users],
  ["models", "Model / Departman", Link2],
  ["mail", "Outlook Şablonu", Mail],
  ["rules", "Test ve Sakat Kuralları", Settings2],
];

const emptyDepartment = () => ({
  id: "",
  firmId: "",
  firmName: "",
  departmentCode: "",
  departmentName: "",
  usageNote: "",
});

const emptyContact = () => ({
  id: "",
  firmId: "",
  firmName: "",
  departmentCode: "",
  departmentName: "",
  fullName: "",
  email: "",
  title: "",
  phone: "",
  canReceiveDispatchMail: true,
  canReceiveInvoiceMail: true,
});

const emptyMapping = () => ({
  companyId: "",
  companyName: "",
  modelId: "",
  modelName: "",
  departmentCode: "",
  responsibleContactId: "",
});

function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.rows)) return value.rows;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.liste)) return value.liste;
  return [];
}

function companyName(row) {
  return row?.firmaAdi || row?.name || row?.firma || row?.companyName || "Firma";
}

function modelName(row) {
  return row?.modelName || row?.modelAdi || row?.name || row?.desenAdi || "Model";
}

function Field({ label, children, wide = false }) {
  return <label className={wide ? "ism-field wide" : "ism-field"}><span>{label}</span>{children}</label>;
}

export default function EBelgeIntegrationsWorkspace({
  activeMainCompany,
  openModule,
  onOpenDocumentTest,
}) {
  const [section, setSection] = useState("connection");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [connectionTest, setConnectionTest] = useState(null);
  const [portalHealth, setPortalHealth] = useState(null);
  const [apiNetworkStatus, setApiNetworkStatus] = useState(null);
  const [vaultNotice, setVaultNotice] = useState(null);
  const [connection, setConnection] = useState({
    username: "",
    password: "",
    companyId: "",
    companies: [],
    connectionMode: "api",
    sessionReady: false,
    savedCompanyId: "",
    savedCompanyName: "",
    savedAt: null,
    testedAt: null,
    tokenExpiresOn: null,
  });
  const [business, setBusiness] = useState({
    carrier: {},
    mailTemplate: {},
    nonBillableRules: {},
    modelDepartmentMappings: [],
  });
  const [departments, setDepartments] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [models, setModels] = useState([]);
  const [departmentForm, setDepartmentForm] = useState(emptyDepartment());
  const [contactForm, setContactForm] = useState(emptyContact());
  const [mappingForm, setMappingForm] = useState(emptyMapping());

  const load = useCallback(async () => {
    if (!activeMainCompany?.slug && !activeMainCompany?.id) return;
    setLoading(true);
    setNotice(null);
    setConnectionTest(null);
    setPortalHealth(null);
    setShowPassword(false);
    try {
      const tenant = activeMainCompany?.slug || activeMainCompany?.id;
      const result = await loadModuleData({
        scope: `e-belge:${tenant}:entegrasyonlar`,
        sources: {
          connection: { critical: true, load: () => getIsnetSettings() },
          business: { critical: true, load: () => getIsnetBusinessSettings(activeMainCompany) },
          companies: { fallback: [], load: () => fetchCompanies(activeMainCompany) },
          models: { fallback: [], load: () => fetchSharedModels(activeMainCompany, { limit: 3000 }) },
        },
      });
      if (result.states.connection.status !== "error") {
        const connectionResult = result.data.connection;
        setConnection((current) => ({
          ...current,
          username: connectionResult?.username || "",
          password: "",
          companyId: connectionResult?.companyId || "",
          companies: rowsOf(connectionResult?.companies),
          connectionMode: getIsnetConnectionModePreference(tenant) || "browser",
          sessionReady: connectionResult?.sessionReady === true &&
            getIsnetConnectionModePreference(tenant) === "api",
          savedCompanyId: connectionResult?.companyId || "",
          savedCompanyName: connectionResult?.companyName || rowsOf(connectionResult?.companies).find(row=>String(row.id)===String(connectionResult?.companyId))?.name || "",
          savedAt: connectionResult?.savedAt || null,
          testedAt: connectionResult?.testedAt || null,
          tokenExpiresOn: connectionResult?.tokenExpiresOn || null,
        }));
      }
      if (result.states.business.status !== "error") {
        const businessResult = result.data.business;
        setBusiness(businessResult?.settings || businessResult || {});
        setDepartments(rowsOf(businessResult?.departments));
        setContacts(rowsOf(businessResult?.contacts));
      }
      if (result.states.companies.status !== "error") setCompanies(rowsOf(result.data.companies));
      if (result.states.models.status !== "error") setModels(rowsOf(result.data.models));
      const warning = moduleLoadMessage(result, "İşNet bağlantı veya iş ayarlarından biri alınamadı; diğer başarılı ayarlar korunuyor.", "Firma veya model yardımcı listesi yenilenemedi; İşNet ayarları kullanılabilir.");
      if (warning) setNotice({ tone: result.hasCriticalError ? "error" : "warning", text: warning });
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İşNet ayarları yüklenemedi." });
    } finally {
      setLoading(false);
    }
  }, [activeMainCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedDepartmentCompany = useMemo(
    () => companies.find((row) => String(row.id) === String(departmentForm.firmId)) || null,
    [companies, departmentForm.firmId],
  );
  const selectedContactCompany = useMemo(
    () => companies.find((row) => String(row.id) === String(contactForm.firmId)) || null,
    [companies, contactForm.firmId],
  );
  const selectedMappingCompany = useMemo(
    () => companies.find((row) => String(row.id) === String(mappingForm.companyId)) || null,
    [companies, mappingForm.companyId],
  );
  const selectedMappingModel = useMemo(
    () => models.find((row) => String(row.id) === String(mappingForm.modelId)) || null,
    [mappingForm.modelId, models],
  );
  const matchingDepartments = useMemo(
    () => departments.filter((row) => !mappingForm.companyId || String(row.firmId || "") === String(mappingForm.companyId)),
    [departments, mappingForm.companyId],
  );
  const matchingContacts = useMemo(
    () => contacts.filter((row) =>
      (!mappingForm.companyId || String(row.firmId || "") === String(mappingForm.companyId)) &&
      (!mappingForm.departmentCode || String(row.departmentCode || "") === String(mappingForm.departmentCode)),
    ),
    [contacts, mappingForm.companyId, mappingForm.departmentCode],
  );

  async function runAction(key, action, successText, reload = true) {
    setBusy(key);
    setNotice(null);
    try {
      const result = await action();
      setNotice({ tone: "success", text: successText });
      if (reload) await load();
      return result;
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "İşlem tamamlanamadı." });
      return null;
    } finally {
      setBusy("");
    }
  }

  function updateLoginField(key, value) {
    if (key === "connectionMode") {
      saveIsnetConnectionModePreference(activeMainCompany?.slug || activeMainCompany?.id, value);
    }
    setConnectionTest(null);
    setPortalHealth(null);
    setNotice(null);
    setVaultNotice(null);
    setConnection((current) => ({
      ...current,
      [key]: value,
      password: key === "connectionMode" ? "" : key === "password" ? value : current.password,
      companies: key === "connectionMode" && value === "browser" ? current.companies : [],
      companyId: key === "connectionMode" && value === "browser" ? current.companyId : "",
      sessionReady: key === "connectionMode" && value === "browser" ? false : key === "password" ? current.sessionReady : false,
    }));
  }

  useEffect(() => {
    if (connection.connectionMode !== "api") {
      setApiNetworkStatus(null);
      return undefined;
    }
    let active = true;
    getIsnetEgressHealth()
      .then((response) => {
        if (active) setApiNetworkStatus(response?.targets?.einvoiceapi || { status: "UNKNOWN" });
      })
      .catch(() => {
        if (active) setApiNetworkStatus({ status: "UNAVAILABLE" });
      });
    return () => { active = false; };
  }, [connection.connectionMode]);

  async function saveInBrowser() {
    if (busy) return;
    setBusy("vault-save");
    setVaultNotice(null);
    try {
      await saveIsnetBrowserCredentials(connection.username, connection.password);
      setVaultNotice({ tone: "warning", text: "Kaydetme isteği Chrome'a iletildi. Tarayıcının parola yöneticisindeki onayı kontrol edin; İşNet bağlantısı hâlâ doğrulanmadı." });
    } catch (error) {
      setVaultNotice({ tone: "error", text: error?.message || "Tarayıcıya kaydetme başarısız." });
    } finally { setBusy(""); }
  }

  async function restoreFromBrowser() {
    if (busy) return;
    setBusy("vault-load");
    setVaultNotice(null);
    try {
      const record = await loadIsnetBrowserCredentials(connection.username);
      if (!record) {
        setVaultNotice({ tone: "warning", text: "Tarayıcıda kayıtlı İşNet hesabı seçilmedi." });
        return;
      }
      setConnection((current) => ({ ...current, username: record.username, password: record.password,
        companyId: "", companies: [], sessionReady: false }));
      setConnectionTest(null);
      setShowPassword(false);
      setVaultNotice({ tone: "success", text: "Kayıtlı bilgiler alanlara dolduruldu; İşNet bağlantısı ayrıca doğrulanmalıdır." });
    } catch (error) {
      setVaultNotice({ tone: "error", text: error?.message || "Parola yöneticisinden bilgiler alınamadı." });
    } finally { setBusy(""); }
  }

  async function checkPortalHealth() {
    if (busy) return;
    setBusy("probe");
    setNotice(null);
    try {
      const status = await getIsnetPortalHealth();
      setPortalHealth(status);
      setNotice({ connectionMode: "portal", tone: status.reachable ? "success" : "error", text: status.message ||
        "İşNet'in giriş sayfası erişim durumu belirlenemedi." });
    } catch (error) {
      setPortalHealth(null);
      setNotice({ tone: "error", text: error?.message || "Şifresiz portal erişim kontrolü başarısız." });
    } finally {
      setBusy("");
    }
  }

  async function testConnection() {
    if (busy || connection.connectionMode === "browser") return;
    const username = connection.username.trim();
    if (!username || (!connection.password && !connection.sessionReady)) {
      setNotice({ tone: "warning", text: "Kullanıcı adı ve İşNet şifresi girin. Kayıtlı API oturumu varsa şifresiz kontrol edebilirsiniz." });
      return;
    }
    setBusy("test");
    setNotice(null);
    setConnectionTest(null);
    try {
      if (connection.connectionMode === "portal") {
        // Do not send credentials to an unreachable Worker-to-provider form.
        const status = await getIsnetPortalHealth();
        setPortalHealth(status);
        if (status?.reachable !== true) {
          throw new Error(status?.message ||
            "İşNet portalı KY ERP sunucusundan açılamadı. Şifre doğrulaması başlatılmadı.");
        }
      }
      const result = await testIsnetSettings({
        username,
        password: connection.password,
        connectionMode: connection.connectionMode,
      });
      const available = rowsOf(result.companies || result.authorizedCompanies);
      if (!available.length) throw new Error("İşNet yetkili firma listesi gelmedi; kaydetme işlemi açılmadı.");
      const verifiedMode = result.connectionMode || connection.connectionMode;
      setConnection((current) => ({
        ...current,
        password: "",
        username,
        companies: available,
        companyId: available.some((row) => String(row.id) === String(current.companyId))
          ? current.companyId : available.length === 1 ? String(available[0].id) : "",
        connectionMode: verifiedMode,
        sessionReady: result.sessionReady === true,
        testedAt: result.testedAt || new Date().toISOString(),
      }));
      setShowPassword(false);
      setConnectionTest({
        username, mode: verifiedMode, kind: result.verificationKind ||
          (verifiedMode === "api" ? "API_LOGIN" : "PORTAL_LOGIN_ONLY"),
        saved: false,
      });
      setNotice({
        connectionMode: verifiedMode,
        tone: verifiedMode === "api" ? "success" : "warning",
        text: result.message || (verifiedMode === "api"
          ? "İşNet hesabı doğrulandı; firma seçimini kaydedin."
          : "Portal girişi doğrulandı; bu, otomatik belge senkronizasyonu değildir."),
      });
    } catch (error) {
      setConnectionTest(null);
      setNotice({ connectionMode: connection.connectionMode, tone: "error", text: error?.message || "Bağlantı doğrulanamadı. Giriş bilgilerini ve seçilen yöntemi kontrol edin." });
    } finally {
      setBusy("");
    }
  }

  const savedCompany=Boolean(connection.savedCompanyId && connection.savedCompanyName);
  const selectedCompanyName=connection.savedCompanyName || connection.companies.find(row=>String(row.id)===String(connection.savedCompanyId))?.name || "";
  const lastTest=connection.testedAt && !Number.isNaN(Date.parse(connection.testedAt)) ? new Date(connection.testedAt).toLocaleString("tr-TR") : "";
  const connectionBadge=connection.connectionMode==="browser" ? (savedCompany ? "Firma kayıtlı · Chrome oturumu" : "Chrome üzerinden giriş")
    : connectionTest && !connectionTest.saved ? "Giriş testi başarılı"
    : savedCompany ? (connection.connectionMode==="portal" ? "Firma kayıtlı · portal bağlantısı" : "Firma kayıtlı · API kontrolü bekliyor")
    : "Doğrulama bekliyor";

  async function saveConnection() {
    if (busy || !connectionTest || connectionTest.saved || !connection.companyId ||
        connectionTest.username !== connection.username.trim() ||
        connectionTest.mode !== connection.connectionMode) return;
    setBusy("save-connection");
    setNotice(null);
    try {
      // No password in save payload. Test already populated the authorized company list.
      const result = await saveIsnetSettings({
        username: connection.username.trim(),
        companyId: connection.companyId,
        connectionMode: connection.connectionMode,
      });
      const savedName=connection.companies.find(row=>String(row.id)===String(connection.companyId))?.name || result.companyName || "";
      setConnection((current) => ({ ...current, password: "",
        savedCompanyId: result.companyId || current.companyId,
        savedCompanyName: result.companyName || savedName,
        savedAt: result.savedAt || new Date().toISOString(),
      }));
      setConnectionTest((current) => current ? { ...current, saved: true } : null);
      setNotice({
        connectionMode: connection.connectionMode,
        tone: connection.connectionMode === "api" ? "success" : "warning",
        text: result.message || "Yetkili firma seçimi kaydedildi.",
      });
    } catch (error) {
      setNotice({ connectionMode: connection.connectionMode, tone: "error", text: error?.message || "Firma kaydı tamamlanamadı; bağlantıyı yeniden test edin." });
    } finally {
      setBusy("");
    }
  }

  async function saveBusinessPart(payload, text) {
    await runAction(
      "business-save",
      () => saveIsnetBusinessSettings(activeMainCompany, payload),
      text,
    );
  }

  async function saveDepartment() {
    const payload = {
      ...departmentForm,
      firmName: selectedDepartmentCompany ? companyName(selectedDepartmentCompany) : departmentForm.firmName,
    };
    if (!payload.firmId || !payload.departmentCode.trim()) {
      setNotice({ tone: "warning", text: "Firma ve departman kodu zorunludur." });
      return;
    }
    await runAction(
      "department",
      () => departmentForm.id
        ? updateIsnetDepartment(activeMainCompany, departmentForm.id, payload)
        : createIsnetDepartment(activeMainCompany, payload),
      "Departman kaydı tamamlandı.",
    );
    setDepartmentForm(emptyDepartment());
  }

  async function saveContact() {
    const department = departments.find(
      (row) =>
        String(row.firmId || "") === String(contactForm.firmId) &&
        String(row.departmentCode || "") === String(contactForm.departmentCode),
    );
    const payload = {
      ...contactForm,
      firmName: selectedContactCompany ? companyName(selectedContactCompany) : contactForm.firmName,
      departmentName: department?.departmentName || contactForm.departmentName,
    };
    if (!payload.firmId || !payload.departmentCode || !payload.fullName.trim() || !payload.email.trim()) {
      setNotice({ tone: "warning", text: "Firma, departman, ad soyad ve e-posta zorunludur." });
      return;
    }
    await runAction(
      "contact",
      () => contactForm.id
        ? updateIsnetContact(activeMainCompany, contactForm.id, payload)
        : createIsnetContact(activeMainCompany, payload),
      "Sorumlu ve Outlook alıcı kaydı tamamlandı.",
    );
    setContactForm(emptyContact());
  }

  async function saveMapping() {
    const payload = {
      ...mappingForm,
      companyName: selectedMappingCompany ? companyName(selectedMappingCompany) : mappingForm.companyName,
      modelName: selectedMappingModel ? modelName(selectedMappingModel) : mappingForm.modelName,
    };
    if (!payload.companyId || !payload.modelId || !payload.departmentCode) {
      setNotice({ tone: "warning", text: "Firma, model ve departman zorunludur." });
      return;
    }
    await runAction(
      "mapping",
      () => createIsnetModelMapping(activeMainCompany, payload),
      "Model, departman ve sorumlu eşleşmesi kaydedildi.",
    );
    setMappingForm(emptyMapping());
  }

  function openAssistant() {
    openModule?.("asistan", {
      tabKey: "sohbet",
      actionContext: {
        sourceModule: "e-belge",
        sourceRoute: window.location.pathname,
        prompt:
          "İşNet bağlantı ve iş ayarlarını kontrol et. Eksik taşıyıcı bilgilerini, departmansız modelleri, sorumlusu veya mail alıcısı olmayan müşteri kayıtlarını, test numunesi muafiyet eksiklerini özetle.",
      },
    });
  }

  if (loading) {
    return <div className="ism-loading"><LoaderCircle className="spin" /> İşNet kayıt merkezi yükleniyor...</div>;
  }

  return (
    <main className="ism-page">
      <header className="ism-header">
        <div><span>İŞNET KAYIT MERKEZİ</span><h1>Ayarlar, Departmanlar ve Otomasyon Sabitleri</h1><p>Portal bağlantısı, irsaliye taşıyıcısı, müşteri sorumluları, Outlook alıcıları ve işlem kuralları tek yerde tutulur.</p></div>
        <div className="ism-actions"><button type="button" onClick={openAssistant}><Bot size={16} /> Asistanla Kontrol</button><button type="button" onClick={() => void load()}><RefreshCw size={16} /> Yenile</button></div>
      </header>

      {notice && (!notice.connectionMode || notice.connectionMode === connection.connectionMode) ? <div className={`ism-notice ${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</div> : null}

      <nav className="ism-tabs">{SECTIONS.map(([key, label, Icon]) => <button key={key} type="button" className={section === key ? "active" : ""} onClick={() => setSection(key)}><Icon size={16} /> {label}</button>)}</nav>

      {section === "connection" ? <section className="ism-grid two">
        <article className="ism-card ism-connection-card">
          <div className="ism-card-head">
            <div><h2>{connection.connectionMode === "browser" ? "NetteFatura · Chrome ile Giriş" : connection.connectionMode === "api" ? "İşNet Resmî API Bağlantısı" : "İşNet Portal Bağlantısı"}</h2><p>{connection.connectionMode==="browser" ? "Şifrenizi NetteFatura'nın kendi Chrome sekmesinde kullanın; KY ERP üzerinden giriş yapılmaz." : "Giriş bilgilerini tarayıcı parola yöneticisinde hatırlatabilirsiniz. KY ERP şifreyi veritabanında saklamaz."}</p></div>
            <span className={savedCompany || connectionTest?.saved ? "ready" : "warning"}>{connectionBadge}</span>
          </div>
          {savedCompany && <div className="ism-saved-company" role="status">
            <CheckCircle2 size={18}/>
            <div><strong>Kayıtlı yetkili firma: {selectedCompanyName}</strong>
              <span>Firma seçimi kayıtlı. {connection.connectionMode==="browser" ? "Bu firma seçimi korunuyor. Chrome portal oturumu ve API oturumu birbirinden bağımsızdır." : connection.connectionMode==="portal" ? "Portal giriş testi başarılı olabilir; otomatik XML indirimi için resmî API bağlantısı ayrıca doğrulanmalıdır." : connection.sessionReady ? "API oturum tokenı kayıtlı; sağlayıcıda güncel geçerliliği belge sorgusuyla kontrol edilir." : "API oturumu yeniden doğrulanmalıdır."}</span>
              {lastTest && <small>Son giriş testi: {lastTest} · Şifre gösterilmez veya veritabanına yazılmaz.</small>}
            </div>
          </div>}
          {connection.connectionMode!=="browser"&&<IntegrationFlowSteps kind="ISNET" stage={savedCompany || connectionTest?.saved ? 3 : connectionTest ? 2 : 1} />}
          <div className="ism-form-grid">
            <Field label="Bağlantı yöntemi">
              <select value={connection.connectionMode} disabled={!!busy} onChange={(event) => updateLoginField("connectionMode", event.target.value)}>
                <option value="browser">Chrome · NetteFatura sitesinde giriş (önerilen)</option>
                <option value="api">İşNet API · resmî yetkiyle otomatik senkronizasyon</option>
              </select>
            </Field>
            {connection.connectionMode!=="browser"&&<>
            <Field label="Kullanıcı adı / TCKN">
              <input id="isnet-user" name="isnet-account" value={connection.username} autoComplete="section-isnet username" disabled={!!busy} onChange={(event) => updateLoginField("username", event.target.value)} />
            </Field>
            <Field label="Şifre">
              <div className="ism-password-control">
                <input id="isnet-password" name="isnet-password" type={showPassword ? "text" : "password"} value={connection.password}
                  autoComplete="section-isnet current-password" disabled={!!busy}
                  placeholder={connection.sessionReady ? "Kayıtlı API oturumuyla şifresiz test edilebilir" : "İşNet şifresi"}
                  onChange={(event) => updateLoginField("password", event.target.value)} />
                <button type="button" className="ism-password-toggle" disabled={!!busy}
                  aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                  aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>
            <Field label="Yetkili firma">
              <select value={connection.companyId} disabled={!!busy || !connectionTest}
                onChange={(event) => { setConnection((current) => ({ ...current, companyId: event.target.value })); setConnectionTest((current) => current ? { ...current, saved: false } : null); }}>
                <option value="">{connectionTest ? "Yetkili firma seçin" : "Önce bağlantıyı doğrulayın"}</option>
                {connection.companies.map((row) => <option key={row.id} value={row.id}>{row.name || row.companyName} ({row.id})</option>)}
              </select>
            </Field></>}
          </div>
          {connection.connectionMode==="browser" ? <div className="ism-chrome-flow" role="group" aria-label="Chrome NetteFatura oturumu">
            <strong>Chrome'da açık NetteFatura hesabıyla devam</strong>
            <p>1. Resmî portalı Chrome'da aç. Daha önce giriş yaptıysan mevcut oturumun kullanılır.</p>
            <p>2. Gelen/giden fatura veya irsaliyeden XML/PDF dosyasını Chrome üzerinden indir.</p>
            <p>3. Belge Test Merkezi'ne dönüp dosyayı seç; XML okuma ve PDF önizlemesini burada test et.</p>
            <div className="ism-actions"><a className="ism-chrome-open" href="https://nettefatura.isnet.net.tr/" target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/> NetteFatura'yı Chrome'da Aç</a>
              <button type="button" onClick={()=>onOpenDocumentTest?.()}>Belge Test Merkezine Geç</button></div>
            <small>KY ERP, Chrome'un İşNet oturum çerezine veya şifresine erişmez. Otomatik XML çekme bu modda aktif değildir; portalda indirilen dosya açıkça seçilir.</small>
          </div> : <>
          <div className="ism-browser-vault">
            <div className="ism-actions">
              <button type="button" disabled={!!busy || !connection.username.trim() || !connection.password} onClick={() => void saveInBrowser()}>
                <Save size={16} /> Kullanıcı Adı ve Şifreyi Kaydet
              </button>
              <button type="button" disabled={!!busy} onClick={() => void restoreFromBrowser()}>
                <Eye size={16} /> Kayıtlı Bilgileri Doldur
              </button>
            </div>
            <p className="ism-connection-help">Kayıt yalnız Chrome'un parola yöneticisinde, kyerp.net altında ayrı İşNet hesabı olarak tutulur. KY ERP sunucusuna kaydedilmez. Paylaşılan cihazda kullanmayın.</p>
            {vaultNotice ? <p className={`ism-notice ${vaultNotice.tone}`} role={vaultNotice.tone === "error" ? "alert" : "status"}>{vaultNotice.text}</p> : null}
          </div>
          <p className="ism-connection-help">
            {connection.connectionMode === "portal"
              ? "Portal doğrulaması firma seçimini sağlar; kalıcı belge çekme için İşNet API bağlantısı ayrıca doğrulanmalıdır."
              : "API bağlantısı doğrulanırsa yetkili firma seçimi ve belge senkronizasyonu için oturum kullanılabilir."}
          </p>
          {connection.connectionMode === "portal" && portalHealth ? <p className="ism-connection-help" role="status">
            <strong>Şifresiz sunucu kontrolü:</strong> {portalHealth.reachable
              ? "İşNet giriş formu erişilebilir; hesap henüz doğrulanmadı."
              : `Erişim sorunu: ${portalHealth.status}${portalHealth.httpStatus ? ` (HTTP ${portalHealth.httpStatus})` : ""}`}
          </p> : null}
          {connection.connectionMode === "api" && <p className="ism-connection-help" role="status">
            <strong>Resmî API sunucu erişimi:</strong> {apiNetworkStatus?.status === "READY"
              ? "READY — sunucu erişilebilir, kullanıcı yetkisi henüz doğrulanmadı."
              : apiNetworkStatus?.status
                ? `${apiNetworkStatus.status} — giriş sonucu değil, yalnız ağ kontrolü.`
                : "Bağlantı durumu okunuyor..."}
          </p>}
          <div className="ism-actions">
            {connection.connectionMode === "portal" ? <button type="button" disabled={!!busy} onClick={() => void checkPortalHealth()}>
              {busy === "probe" ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}
              Sunucu Erişimini Kontrol Et (Şifresiz)
            </button> : null}
            <button type="button" disabled={!!busy || !connection.username.trim() || (!connection.password && !connection.sessionReady)} onClick={testConnection}>
              {busy === "test" ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
              {busy === "test" ? "İşNet doğrulanıyor..." : "1. Bağlantıyı Doğrula"}
            </button>
            <button type="button" className="primary" disabled={!!busy || !connectionTest || connectionTest.saved || !connection.companyId} onClick={saveConnection}>
              {busy === "save-connection" ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
              {busy === "save-connection" ? "Firma kaydediliyor..." : "2. Firmayı Kaydet"}
            </button>
          </div>
          {(connectionTest?.saved || savedCompany) && <p className="ism-connection-complete"><CheckCircle2 size={16} /> Firma seçimi korunuyor. Otomatik belge senkronizasyonu yalnız API doğrulamasıyla aktif sayılır.</p>}
          {connection.connectionMode==="portal"&&savedCompany&&
            <p className="ism-connection-help" role="status">
              <strong>Firma kaydı tamam.</strong> XML indirmek için bağlantı yöntemini “İşNet API — otomatik senkronizasyon” yapıp API oturumunu da doğrulayın. Portal kaydı korunur; şifrenizi burada paylaşmanız gerekmez.
            </p>}
          </>}
        </article>
        <article className="ism-card explanation"><ShieldCheck size={26} /><h2>Güvenli Çalışma</h2><p>İşNet şifresi KY ERP'de saklanmaz. Doğrulama kodu veya ek onay gerektiren girişler başarılı sayılmaz. Chrome oturumu İşNet API senkronizasyonu kanıtı değildir. Resmî irsaliye veya fatura kullanıcı onayı olmadan gönderilmez.</p></article>
      </section> : null}
      {section === "carrier" ? <section className="ism-card"><div className="ism-card-head"><div><h2>Sabit Taşıyıcı ve Teslimat Bilgileri</h2><p>İrsaliye hazırlama modalına otomatik gelir; gerektiğinde işlem bazında değiştirilebilir.</p></div><Truck size={24} /></div><div className="ism-form-grid three"><Field label="Taşıyıcı adı"><input value={business.carrier?.carrierName || ""} onChange={(event) => setBusiness((current) => ({ ...current, carrier: { ...current.carrier, carrierName: event.target.value } }))} /></Field><Field label="VKN / TCKN"><input value={business.carrier?.taxNo || ""} onChange={(event) => setBusiness((current) => ({ ...current, carrier: { ...current.carrier, taxNo: event.target.value } }))} /></Field><Field label="Şoför adı"><input value={business.carrier?.driverName || ""} onChange={(event) => setBusiness((current) => ({ ...current, carrier: { ...current.carrier, driverName: event.target.value } }))} /></Field><Field label="Şoför kimlik no"><input value={business.carrier?.driverId || ""} onChange={(event) => setBusiness((current) => ({ ...current, carrier: { ...current.carrier, driverId: event.target.value } }))} /></Field><Field label="Araç plakası"><input value={business.carrier?.vehiclePlate || ""} onChange={(event) => setBusiness((current) => ({ ...current, carrier: { ...current.carrier, vehiclePlate: event.target.value.toLocaleUpperCase("tr-TR") } }))} /></Field><Field label="Dorse plakası"><input value={business.carrier?.trailerPlate || ""} onChange={(event) => setBusiness((current) => ({ ...current, carrier: { ...current.carrier, trailerPlate: event.target.value.toLocaleUpperCase("tr-TR") } }))} /></Field><Field label="Teslim şekli"><select value={business.carrier?.deliveryMethod || "ELDEN_TESLIM"} onChange={(event) => setBusiness((current) => ({ ...current, carrier: { ...current.carrier, deliveryMethod: event.target.value } }))}><option value="ELDEN_TESLIM">Elden teslim</option><option value="NAKLIYE">Nakliye</option><option value="KARGO">Kargo</option></select></Field><Field label="Teslimat adresi" wide><textarea value={business.carrier?.deliveryAddress || ""} onChange={(event) => setBusiness((current) => ({ ...current, carrier: { ...current.carrier, deliveryAddress: event.target.value } }))} /></Field></div><div className="ism-actions"><button type="button" className="primary" onClick={() => saveBusinessPart({ carrier: business.carrier }, "Taşıyıcı sabitleri kaydedildi.")}><Save size={16} /> Taşıyıcıyı Kaydet</button></div></section> : null}

      {section === "contacts" ? <section className="ism-stack">
        <div className="ism-grid two"><article className="ism-card"><h2>Departman Kaydı</h2><div className="ism-form-grid"><Field label="Firma"><select value={departmentForm.firmId} onChange={(event) => setDepartmentForm((current) => ({ ...current, firmId: event.target.value }))}><option value="">Firma seçin</option>{companies.map((row) => <option key={row.id} value={row.id}>{companyName(row)}</option>)}</select></Field><Field label="Departman kodu"><input value={departmentForm.departmentCode} onChange={(event) => setDepartmentForm((current) => ({ ...current, departmentCode: event.target.value }))} placeholder="Örn. 125" /></Field><Field label="Departman adı"><input value={departmentForm.departmentName} onChange={(event) => setDepartmentForm((current) => ({ ...current, departmentName: event.target.value }))} /></Field><Field label="Kullanım notu"><input value={departmentForm.usageNote} onChange={(event) => setDepartmentForm((current) => ({ ...current, usageNote: event.target.value }))} /></Field></div><button type="button" className="primary" onClick={saveDepartment}><Building2 size={16} /> Departmanı Kaydet</button></article>
        <article className="ism-card"><h2>Sorumlu ve Outlook Alıcısı</h2><div className="ism-form-grid"><Field label="Firma"><select value={contactForm.firmId} onChange={(event) => setContactForm((current) => ({ ...current, firmId: event.target.value, departmentCode: "" }))}><option value="">Firma seçin</option>{companies.map((row) => <option key={row.id} value={row.id}>{companyName(row)}</option>)}</select></Field><Field label="Departman"><select value={contactForm.departmentCode} onChange={(event) => setContactForm((current) => ({ ...current, departmentCode: event.target.value }))}><option value="">Departman seçin</option>{departments.filter((row) => String(row.firmId || "") === String(contactForm.firmId)).map((row) => <option key={row.id} value={row.departmentCode}>{row.departmentCode} {row.departmentName ? `- ${row.departmentName}` : ""}</option>)}</select></Field><Field label="Ad soyad"><input value={contactForm.fullName} onChange={(event) => setContactForm((current) => ({ ...current, fullName: event.target.value }))} /></Field><Field label="E-posta"><input type="email" value={contactForm.email} onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))} /></Field><Field label="Görev / Unvan"><input value={contactForm.title} onChange={(event) => setContactForm((current) => ({ ...current, title: event.target.value }))} placeholder="İrsaliye sorumlusu" /></Field><div className="ism-checks"><label><input type="checkbox" checked={contactForm.canReceiveDispatchMail} onChange={(event) => setContactForm((current) => ({ ...current, canReceiveDispatchMail: event.target.checked }))} /> İrsaliye maili</label><label><input type="checkbox" checked={contactForm.canReceiveInvoiceMail} onChange={(event) => setContactForm((current) => ({ ...current, canReceiveInvoiceMail: event.target.checked }))} /> Fatura maili</label></div></div><button type="button" className="primary" onClick={saveContact}><UserPlus size={16} /> Kişiyi Kaydet</button></article></div>
        <article className="ism-card"><div className="ism-card-head"><div><h2>Kayıtlı Departman ve Kişiler</h2><p>İrsaliye sorumlusu ve mail alıcıları model eşleşmesinden otomatik çözülür.</p></div><span className="ready">{departments.length} departman · {contacts.length} kişi</span></div><div className="ism-contact-list">{departments.map((department) => <section key={department.id}><header><b>{department.firmName || "Firma"}</b><span>{department.departmentCode} {department.departmentName ? `· ${department.departmentName}` : ""}</span><button type="button" onClick={() => setDepartmentForm({ id: department.id, firmId: department.firmId || "", firmName: department.firmName || "", departmentCode: department.departmentCode || "", departmentName: department.departmentName || "", usageNote: department.usageNote || "" })}>Düzenle</button></header>{contacts.filter((person) => String(person.firmId || "") === String(department.firmId || "") && String(person.departmentCode || "") === String(department.departmentCode || "")).map((person) => <div key={person.id}><span><strong>{person.fullName}</strong><small>{person.email} · {person.title || "Yetkili"}</small></span><i>{person.canReceiveDispatchMail ? "İrsaliye " : ""}{person.canReceiveInvoiceMail ? "Fatura" : ""}</i><button type="button" onClick={() => setContactForm({ ...emptyContact(), ...person })}>Düzenle</button></div>)}</section>)}</div></article>
      </section> : null}

      {section === "models" ? <section className="ism-grid two"><article className="ism-card"><h2>Modeli Departmana Bağla</h2><div className="ism-form-grid"><Field label="Firma"><select value={mappingForm.companyId} onChange={(event) => setMappingForm((current) => ({ ...current, companyId: event.target.value, departmentCode: "", responsibleContactId: "" }))}><option value="">Firma seçin</option>{companies.map((row) => <option key={row.id} value={row.id}>{companyName(row)}</option>)}</select></Field><Field label="Model"><select value={mappingForm.modelId} onChange={(event) => setMappingForm((current) => ({ ...current, modelId: event.target.value }))}><option value="">Model seçin</option>{models.map((row) => <option key={row.id} value={row.id}>{modelName(row)}</option>)}</select></Field><Field label="Departman"><select value={mappingForm.departmentCode} onChange={(event) => setMappingForm((current) => ({ ...current, departmentCode: event.target.value, responsibleContactId: "" }))}><option value="">Departman seçin</option>{matchingDepartments.map((row) => <option key={row.id} value={row.departmentCode}>{row.departmentCode} {row.departmentName ? `- ${row.departmentName}` : ""}</option>)}</select></Field><Field label="İrsaliye sorumlusu"><select value={mappingForm.responsibleContactId} onChange={(event) => setMappingForm((current) => ({ ...current, responsibleContactId: event.target.value }))}><option value="">Otomatik / ilk yetkili</option>{matchingContacts.map((row) => <option key={row.id} value={row.id}>{row.fullName}</option>)}</select></Field></div><button type="button" className="primary" onClick={saveMapping}><Link2 size={16} /> Eşleşmeyi Kaydet</button></article><article className="ism-card"><div className="ism-card-head"><div><h2>Kayıtlı Model Eşleşmeleri</h2><p>Model seçildiğinde departman, sorumlu ve mail alıcıları otomatik gelir.</p></div><span className="ready">{business.modelDepartmentMappings?.length || 0}</span></div><div className="ism-mapping-list">{(business.modelDepartmentMappings || []).map((row) => <div key={row.id}><span><b>{row.companyName || "Firma"} · {row.modelName || row.modelKey}</b><small>Departman {row.departmentCode} · Sorumlu {contacts.find((person) => person.id === row.responsibleContactId)?.fullName || "otomatik"}</small></span><button type="button" onClick={() => runAction(`delete-${row.id}`, () => deleteIsnetModelMapping(activeMainCompany, row.id), "Model eşleşmesi kaldırıldı.")}>Kaldır</button></div>)}{!(business.modelDepartmentMappings || []).length ? <p>Henüz model eşleşmesi yok.</p> : null}</div></article></section> : null}

      {section === "mail" ? <section className="ism-card"><div className="ism-card-head"><div><h2>Outlook Taslak Şablonu</h2><p>Fatura ve irsaliye aynı taslakta, kayıtlı departman alıcılarına hazırlanır.</p></div><Mail size={24} /></div><div className="ism-form-grid"><Field label="Konu şablonu" wide><input value={business.mailTemplate?.subjectPattern || ""} onChange={(event) => setBusiness((current) => ({ ...current, mailTemplate: { ...current.mailTemplate, subjectPattern: event.target.value } }))} /></Field><Field label="Mail gövdesi" wide><textarea rows="9" value={business.mailTemplate?.body || ""} onChange={(event) => setBusiness((current) => ({ ...current, mailTemplate: { ...current.mailTemplate, body: event.target.value } }))} /></Field></div><p className="ism-template-help">Kullanılabilir alanlar: {"{{MODEL}} · {{DEPARTMENT}} · {{RESPONSIBLE}} · {{DISPATCH_NO}} · {{INVOICE_NO}}"}</p><div className="ism-checks"><label><input type="checkbox" checked={business.mailTemplate?.attachDispatchPdf !== false} onChange={(event) => setBusiness((current) => ({ ...current, mailTemplate: { ...current.mailTemplate, attachDispatchPdf: event.target.checked } }))} /> İrsaliye PDF</label><label><input type="checkbox" checked={business.mailTemplate?.attachInvoicePdf !== false} onChange={(event) => setBusiness((current) => ({ ...current, mailTemplate: { ...current.mailTemplate, attachInvoicePdf: event.target.checked } }))} /> Fatura PDF</label><label><input type="checkbox" checked={business.mailTemplate?.attachXml === true} onChange={(event) => setBusiness((current) => ({ ...current, mailTemplate: { ...current.mailTemplate, attachXml: event.target.checked } }))} /> XML ekle</label></div><button type="button" className="primary" onClick={() => saveBusinessPart({ mailTemplate: business.mailTemplate }, "Outlook şablonu kaydedildi.")}><Save size={16} /> Şablonu Kaydet</button></section> : null}

      {section === "rules" ? <section className="ism-card"><div className="ism-card-head"><div><h2>Test Numunesi ve Sakat Kalem Kuralları</h2><p>Muafiyet kodu doğrulanmadan sistem değer uydurmaz ve resmî faturayı gönderime açmaz.</p></div><Settings2 size={24} /></div><div className="ism-rule-grid">{[["TEST_NUMUNESI", "Test Numunesi"], ["BASKI_SAKATI", "Baskı Sakatı"], ["KUMAS_SAKATI", "Kumaş Sakatı"]].map(([key, label]) => { const rule = business.nonBillableRules?.[key] || {}; return <article key={key}><h3>{label}</h3><Field label="Faturadaki davranış"><select value={rule.invoiceBehavior || "DO_NOT_INVOICE"} onChange={(event) => setBusiness((current) => ({ ...current, nonBillableRules: { ...current.nonBillableRules, [key]: { ...current.nonBillableRules?.[key], invoiceBehavior: event.target.value } } }))}><option value="DO_NOT_INVOICE">Faturaya alma</option><option value="ZERO_PRICE_EXEMPT">0 TL muafiyetli satır</option><option value="NORMAL_INVOICE">Normal fiyatla faturala</option></select></Field>{rule.invoiceBehavior === "ZERO_PRICE_EXEMPT" ? <><Field label="Muafiyet kodu"><input value={rule.exemptionCode || ""} onChange={(event) => setBusiness((current) => ({ ...current, nonBillableRules: { ...current.nonBillableRules, [key]: { ...current.nonBillableRules?.[key], exemptionCode: event.target.value } } }))} placeholder="Resmî İşNet kodu" /></Field><Field label="Muafiyet açıklaması"><input value={rule.exemptionReason || ""} onChange={(event) => setBusiness((current) => ({ ...current, nonBillableRules: { ...current.nonBillableRules, [key]: { ...current.nonBillableRules?.[key], exemptionReason: event.target.value } } }))} /></Field></> : null}</article>; })}</div><button type="button" className="primary" onClick={() => saveBusinessPart({ nonBillableRules: business.nonBillableRules }, "Test ve sakat kalem kuralları kaydedildi.")}><Save size={16} /> Kuralları Kaydet</button></section> : null}
    </main>
  );
}
