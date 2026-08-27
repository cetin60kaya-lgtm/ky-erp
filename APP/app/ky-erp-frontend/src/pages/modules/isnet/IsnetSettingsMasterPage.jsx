import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Building2,
  CheckCircle2,
  Link2,
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
import { getFirmaKartlari } from "../../../services/muhasebeApi";
import { getDesenSimpleModels } from "../../../services/desenApi";
import {
  getIsnetSettings,
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
import "./IsnetSettingsMasterPage.css";

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

export default function IsnetSettingsMasterPage({
  activeMainCompany,
  openModule,
}) {
  const [section, setSection] = useState("connection");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [connection, setConnection] = useState({
    username: "",
    password: "",
    companyId: "",
    companies: [],
    connectionMode: "portal",
    hasPassword: false,
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
    try {
      const tenant = activeMainCompany?.slug || activeMainCompany?.id;
      const result = await loadModuleData({
        scope: `isnet:${tenant}:ayarlar`,
        sources: {
          connection: { critical: true, load: () => getIsnetSettings() },
          business: { critical: true, load: () => getIsnetBusinessSettings(activeMainCompany) },
          companies: { fallback: [], load: () => getFirmaKartlari(activeMainCompany) },
          models: { fallback: [], load: () => getDesenSimpleModels(activeMainCompany, { limit: 3000 }) },
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
          connectionMode: connectionResult?.connectionMode || "portal",
          hasPassword: connectionResult?.hasPassword === true,
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

  async function testConnection() {
    const result = await runAction(
      "test",
      () => testIsnetSettings({
        username: connection.username,
        password: connection.password,
        companyId: connection.companyId,
      }),
      "İşNet bağlantısı doğrulandı. Yetkili firma listesinden seçim yapabilirsiniz.",
      false,
    );
    if (result) {
      const companyRows = rowsOf(result.companies || result.authorizedCompanies);
      setConnection((current) => ({
        ...current,
        companies: companyRows,
        companyId:
          current.companyId ||
          (companyRows.length === 1 ? String(companyRows[0].id) : ""),
      }));
    }
  }

  async function saveConnection() {
    await runAction(
      "save-connection",
      () => saveIsnetSettings({
        username: connection.username,
        password: connection.password || undefined,
        companyId: connection.companyId,
        connectionMode: connection.connectionMode || "portal",
      }),
      "İşNet kullanıcı, şifre durumu ve seçili firma kaydedildi.",
    );
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
        sourceModule: "isnet",
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

      {notice ? <div className={`ism-notice ${notice.tone}`}>{notice.text}</div> : null}

      <nav className="ism-tabs">{SECTIONS.map(([key, label, Icon]) => <button key={key} type="button" className={section === key ? "active" : ""} onClick={() => setSection(key)}><Icon size={16} /> {label}</button>)}</nav>

      {section === "connection" ? <section className="ism-grid two">
        <article className="ism-card"><div className="ism-card-head"><div><h2>İşNet Portal Bağlantısı</h2><p>Şifre ekrana geri okunmaz; kayıtlı şifre boş bırakılarak kullanılabilir.</p></div><span className={connection.hasPassword ? "ready" : "warning"}>{connection.hasPassword ? "Şifre kayıtlı" : "Şifre gerekli"}</span></div><div className="ism-form-grid"><Field label="Kullanıcı adı / TCKN"><input value={connection.username} onChange={(event) => setConnection((current) => ({ ...current, username: event.target.value }))} /></Field><Field label="Şifre"><input type="password" value={connection.password} placeholder={connection.hasPassword ? "Kayıtlı şifreyi kullanmak için boş bırakın" : "İşNet şifresi"} onChange={(event) => setConnection((current) => ({ ...current, password: event.target.value }))} /></Field><Field label="Bağlantı modu"><select value={connection.connectionMode} onChange={(event) => setConnection((current) => ({ ...current, connectionMode: event.target.value }))}><option value="portal">NetteFatura portalı</option><option value="api">İşNet API</option></select></Field><Field label="Yetkili firma"><select value={connection.companyId} onChange={(event) => setConnection((current) => ({ ...current, companyId: event.target.value }))}><option value="">Firma seçin</option>{connection.companies.map((row) => <option key={row.id} value={row.id}>{row.name || row.companyName} ({row.id})</option>)}</select></Field></div><div className="ism-actions"><button type="button" disabled={!connection.username || busy === "test"} onClick={testConnection}>{busy === "test" ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />} Bağlantıyı Test Et</button><button type="button" className="primary" disabled={!connection.companyId || busy === "save-connection"} onClick={saveConnection}><Save size={16} /> Firmayı Seç ve Kaydet</button></div></article>
        <article className="ism-card explanation"><ShieldCheck size={26} /><h2>Güvenli Çalışma</h2><p>Canlı bağlantı kurulamazsa uygulama yerel kayıtları gösterir fakat portal verisini güncelmiş gibi işaretlemez. Resmî irsaliye veya fatura kullanıcı onayı olmadan gönderilmez.</p></article>
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
