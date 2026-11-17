import { useCallback, useEffect, useMemo, useState } from "react";
import { useActiveCompany } from "../context/ActiveCompanyContext";
import { useAuth } from "../context/AuthContext";
import { getMainCompanies, getUserPermissions, listUsers } from "../services/adminApi";
import { listSecurityCapabilityGrants, listSecurityCenterAudit } from "../services/securityCenterApi";
import { MODULES, getVisibleModuleTabs } from "../app/moduleRegistry";
import "./ProCompanyCenter.css";

const OWNER_ROLES = new Set(["SUPER_ADMIN", "ADMIN"]);
const rows = (value) => Array.isArray(value) ? value : Array.isArray(value?.items) ? value.items : [];
const codeOf = (value) => String(value || "").trim();
const trDate = (value) => {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("tr-TR");
};
const roleText = (value) => ({
  SUPER_ADMIN: "Süper Yönetici",
  ADMIN: "Süper Yönetici",
  COMPANY_ADMIN: "Firma Sahibi / Yetkilisi",
  MUHASEBE: "Muhasebe",
  DESEN: "Desen",
  IMALAT: "İmalat",
  BOYAHANE: "Boyahane",
  IK: "İnsan Kaynakları",
  PDKS: "PDKS",
  DENETIM: "Denetim",
  VIEWER: "Özel Yetkili",
}[String(value || "").toUpperCase()] || String(value || "Kullanıcı"));
const modules = MODULES.filter((row) => row.key !== "ana-sayfa");
const permissionLabels = [
  ["canView", "Görüntüle"], ["canCreate", "Oluştur"], ["canUpdate", "Düzenle"],
  ["canDelete", "Sil"], ["canApprove", "Onayla"],
];

export default function ProCompanyCenter({ onOpenModule, onClose }) {
  const { user } = useAuth();
  const { companies: permitted, activeCompanySlug, setActiveCompanySlug } = useActiveCompany();
  const isOwner = OWNER_ROLES.has(String(user?.role || "").toUpperCase());
  const [companies, setCompanies] = useState(null);
  const [users, setUsers] = useState(null);
  const [grants, setGrants] = useState(null);
  const [sourceErrors, setSourceErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [search, setSearch] = useState("");
  const [audit, setAudit] = useState(null);
  const [auditError, setAuditError] = useState("");
  const [permissionUser, setPermissionUser] = useState(null);
  const [permissions, setPermissions] = useState(null);
  const [permissionError, setPermissionError] = useState("");
  const [permissionLoading, setPermissionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isOwner) return;
    setLoading(true);
    const [firms, people, capabilityGrants] = await Promise.allSettled([
      getMainCompanies({ _ts: Date.now() }), listUsers(), listSecurityCapabilityGrants(),
    ]);
    const errors = [];
    if (firms.status === "fulfilled") setCompanies(rows(firms.value));
    else { setCompanies(null); errors.push("Ana firma listesi sunucudan doğrulanamadı."); }
    if (people.status === "fulfilled") setUsers(rows(people.value));
    else { setUsers(null); errors.push("Kullanıcı listesi alınamadı."); }
    if (capabilityGrants.status === "fulfilled") setGrants(rows(capabilityGrants.value));
    else { setGrants(null); errors.push("Devredilmiş güvenlik yetkileri alınamadı."); }
    setSourceErrors(errors);
    setLoading(false);
  }, [isOwner]);

  useEffect(() => { load(); }, [load]);
  const available = companies === null ? permitted : companies;
  const normalized = useMemo(() => rows(available).map((row) => ({
    ...row,
    slug: codeOf(row.slug || row.mainCompanySlug || row.id),
    name: codeOf(row.name || row.title || row.slug || row.id),
    isActive: row.isActive !== false && row.is_active !== 0 && row.status !== "INACTIVE",
  })).filter((row) => row.slug), [available]);

  useEffect(() => {
    if (!normalized.length) return;
    if (!normalized.some((row) => row.slug === selectedSlug)) {
      setSelectedSlug(normalized.find((row) => row.slug === activeCompanySlug)?.slug || normalized[0].slug);
    }
  }, [activeCompanySlug, normalized, selectedSlug]);

  const selected = normalized.find((row) => row.slug === selectedSlug) || null;
  const shown = normalized.filter((row) => (row.name + " " + row.slug)
    .toLocaleLowerCase("tr-TR").includes(search.trim().toLocaleLowerCase("tr-TR")));
  const companyUsers = users === null || !selected ? null : users.filter((row) => codeOf(row.mainCompanySlug) === selected.slug);
  const managers = companyUsers?.filter((row) => String(row.role || "").toUpperCase() === "COMPANY_ADMIN") || [];
  const companyGrants = grants === null || !selected ? null : grants.filter((row) => codeOf(row.mainCompanySlug) === selected.slug);
  const companySelected = Boolean(selected?.isActive && selected.slug === activeCompanySlug
    && permitted.some((row) => row.slug === selected.slug));

  useEffect(() => {
    if (!selectedSlug || !isOwner) return;
    let active = true;
    setAudit(null);
    setAuditError("");
    listSecurityCenterAudit(100, selectedSlug)
      .then((result) => { if (active) setAudit(rows(result)); })
      .catch((error) => { if (active) setAuditError(error?.message || "Güvenlik hareketleri alınamadı."); });
    return () => { active = false; };
  }, [selectedSlug, isOwner]);

  const choose = (row) => {
    setSelectedSlug(row.slug);
    setPermissionUser(null);
    setPermissions(null);
    setPermissionError("");
    if (row.isActive && permitted.some((company) => company.slug === row.slug)) {
      setActiveCompanySlug(row.slug);
    }
  };

  const showPermissions = async (row) => {
    if (permissionUser?.id === row.id) { setPermissionUser(null); return; }
    setPermissionUser(row);
    setPermissions(null);
    setPermissionError("");
    setPermissionLoading(true);
    try { setPermissions(rows(await getUserPermissions(row.id))); }
    catch (error) { setPermissionError(error?.message || "Kullanıcı yetkileri okunamadı."); }
    finally { setPermissionLoading(false); }
  };

  if (!isOwner) return <main className="ky-pro-firm-center"><h2>Firma yönetimi</h2><p>Bu bölüm yalnız Süper Yöneticiye açıktır.</p></main>;

  return <main className="ky-pro-firm-center" aria-label="KY ERP PRO Firma Merkezi">
    <header className="ky-pro-firm-hero">
      <div><small>KY ERP PRO · SİSTEM YÖNETİMİ</small><h1>Firmalarım</h1>
        <p>Firma sahibi, kullanıcılar, modüller, izinler ve güvenlik hareketleri tek ekranda.</p></div>
      <div className="ky-pro-firm-actions">
        <button type="button" onClick={load} disabled={loading}>{loading ? "Yükleniyor" : "Yenile"}</button>
        <button type="button" onClick={onClose}>Kapat</button>
      </div>
    </header>
    {sourceErrors.map((error) => <p className="ky-pro-firm-error" role="alert" key={error}>{error} Eksik veri sıfır kabul edilmedi.</p>)}
    <section className="ky-pro-firm-list" aria-label="Ana firmalar">
      <div className="ky-pro-firm-row"><h2>Firma seç</h2><span>{companies === null ? "Tam liste doğrulanmadı" : String(normalized.length) + " firma"}</span></div>
      <input aria-label="Firma ara" type="search" placeholder="Firma adı veya kısa kod ara..." value={search} onChange={(e) => setSearch(e.target.value)}/>
      <div className="ky-pro-firm-choices">
        {shown.map((row) => <button type="button" key={row.slug} onClick={() => choose(row)} aria-pressed={row.slug === selectedSlug}>
          <strong>{row.name}</strong><small>{row.slug}</small><span>{row.isActive ? "Aktif" : "Pasif"}</span></button>)}
      </div>
      {!shown.length ? <p>Bu aramada firma bulunamadı.</p> : null}
    </section>
    {selected ? <section className="ky-pro-firm-detail" aria-label={selected.name + " firma detayı"}>
      <div className="ky-pro-firm-detail-head">
        <div><small>SEÇİLİ FİRMA</small><h2>{selected.name}</h2><p>{selected.slug} · {selected.isActive ? "Aktif firma" : "Pasif firma"}</p></div>
        <span>{companySelected ? "ERP kapsamı seçili" : selected.isActive ? "Firma seçimi bekleniyor" : "Yalnız görüntüleme"}</span>
      </div>
      {selected.isActive && !companySelected ? <p className="ky-pro-firm-notice">Bu firma ERP çalışma alanına geçmeden önce yetkili aktif firma listesiyle eşleşmelidir. Yetki doğrulanmadan işlem açılmaz.</p> : null}
      <div className="ky-pro-firm-metrics">
        <div><strong>{companyUsers === null ? "—" : companyUsers.length}</strong><span>Kayıtlı kullanıcı</span></div>
        <div><strong>{companyUsers === null ? "—" : managers.length}</strong><span>Firma yetkilisi</span></div>
        <div><strong>{companyGrants === null ? "—" : companyGrants.length}</strong><span>Ek güvenlik yetkisi</span></div>
      </div>
      <section className="ky-pro-firm-card">
        <h3>Firma sahibi / Yetkilileri</h3>
        {companyUsers === null ? <p>Kullanıcı kaynağı doğrulanamadı.</p>
          : managers.length ? managers.map((row) => <p key={row.id}><strong>{row.fullName || row.username}</strong> · {roleText(row.role)}{row.isActive === false ? " · Pasif" : ""}</p>)
            : <p>Bu firmaya atanmış COMPANY_ADMIN rolünde kullanıcı bulunamadı. Sistem sahibi yetkisi firma yöneticisi kaydı yerine geçmez.</p>}
        {companySelected ? <div className="ky-pro-firm-actions"><button type="button" onClick={() => onOpenModule?.("admin", "firma-yetkilileri")}>Firma Yetkililerini Aç</button>
          <button type="button" onClick={() => onOpenModule?.("admin", "kullanicilar")}>Kullanıcı Yönetimini Aç</button></div> : null}
      </section>
      <section className="ky-pro-firm-card">
        <h3>Bölümler / İşlem Ekranları</h3>
        <p>ERP'nin mevcut iş modülleri; yeni kopya sistem değil. Yetki kontrolü sunucu tarafında korunur.</p>
        <div className="ky-pro-firm-modules">
          {modules.map((module) => {
            const first = getVisibleModuleTabs(module)[0];
            if (!first) return null;
            return <button type="button" key={module.key} disabled={!companySelected}
              onClick={() => onOpenModule?.(module.key, first[0])}>
              <strong>{module.label}</strong><small>{getVisibleModuleTabs(module).length} işlem</small></button>;
          })}
        </div>
      </section>
      <section className="ky-pro-firm-card">
        <h3>Kullanıcılar ve Gerçek Modül Yetkileri</h3>
        {companyUsers === null ? <p>Kullanıcı listesi alınamadı; yetki değerlendirmesi yapılamaz.</p> :
          companyUsers.length ? <div className="ky-pro-firm-users">{companyUsers.map((row) =>
            <div className="ky-pro-firm-user" key={row.id}>
              <div><strong>{row.fullName || row.username}</strong><small>{roleText(row.role)} · {row.isActive === false ? "Pasif" : "Aktif"}</small></div>
              <button type="button" disabled={permissionLoading} onClick={() => showPermissions(row)}>
                {permissionUser?.id === row.id ? "Kapat" : "Yetkileri Gör"}</button>
              {permissionUser?.id === row.id ? <div className="ky-pro-firm-permissions">
                {permissionLoading ? <p>Sunucu izinleri okunuyor...</p> : permissionError ? <p className="ky-pro-firm-error">{permissionError}</p>
                  : permissions?.length ? permissions.map((permission) =>
                    <div key={permission.moduleKey || permission.module_key}>
                      <strong>{permission.moduleKey || permission.module_key}</strong>
                      <span>{permissionLabels.filter(([key]) => permission[key] === true).map(([, label]) => label).join(" · ") || "Yetki yok"}</span>
                    </div>) : <p>Kayıtlı modül izni bulunamadı; rolün sunucu yetkisi ayrıca geçerlidir.</p>}
              </div> : null}
            </div>)}</div> : <p>Bu firma için kullanıcı bulunamadı.</p>}
      </section>
      <section className="ky-pro-firm-card">
        <div className="ky-pro-firm-row"><h3>Güvenlik İşlem Geçmişi</h3><small>Son 100 firma olayı</small></div>
        <p>Bu kayıtlar giriş, oturum, cihaz ve yetki değişiklikleridir. Fatura, bordro ve üretim olaylarının tamamını temsil etmez.</p>
        {auditError ? <p className="ky-pro-firm-error" role="alert">{auditError}</p> : audit === null ? <p>Sunucudan kayıtlar okunuyor...</p> :
          audit.length ? <div className="ky-pro-firm-audit">{audit.map((row) => <div key={row.id}>
            <strong>{row.label || row.action || "Güvenlik olayı"}</strong>
            <span>{row.actorName || "Sistem"}{row.targetName ? " → " + row.targetName : ""}</span>
            <small>{trDate(row.createdAt)}</small>
          </div>)}</div> : <p>Bu firmada son kayıtlar içinde güvenlik olayı bulunamadı.</p>}
        {companySelected ? <button type="button" className="ky-pro-firm-deep-link" onClick={() => onOpenModule?.("admin", "admin-guvenlik")}>Güvenlik Merkezine Git</button> : null}
      </section>
    </section> : null}
  </main>;
}
