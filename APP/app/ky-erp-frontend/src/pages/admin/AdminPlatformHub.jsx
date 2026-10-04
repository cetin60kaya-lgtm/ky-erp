import { useEffect, useMemo, useState } from "react";
import AdminSystemOverview from "./AdminSystemOverview";
import AdminUsersPanel from "./AdminUsersPanel";
import AdminCompanySettings from "./AdminCompanySettings";
import AdminCompanyAuthority from "./AdminCompanyAuthority";
import AdminCompanyBilling from "./AdminCompanyBilling";
import AdminOwnerSecurity from "./AdminOwnerSecurity";
import SecurityCenterPanel from "./SecurityCenterPanel";
import AdminApplicationSettings from "./AdminApplicationSettings";
import AdminMappings from "./AdminMappings";
import AdminBackupLogs from "./AdminBackupLogs";
import AdminBuildCenter from "./AdminBuildCenter";
import "./AdminPlatformHub.css";

const GROUPS = {
  management: {
    label: "Yönetim",
    copy: "Kullanıcı, firma, paket ve günlük yönetim tek ekranda.",
    panels: [
      ["overview", "Genel Bakış"],
      ["users", "Kullanıcılar"],
      ["companies", "Firmalar"],
      ["authority", "Firma Yetkisi"],
      ["billing", "Paket / Kullanım"],
    ],
  },
  security: {
    label: "Güvenlik",
    copy: "Süper Yönetici, KY Güvenlik, giriş onayı ve oturum denetimi.",
    panels: [
      ["securityCenter", "Güvenlik Merkezi"],
      ["owner", "Süper Yönetici"],
    ],
  },
  system: {
    label: "Sistem",
    copy: "Uygulama ayarları, eşleştirmeler, yedek ve sürüm yönetimi.",
    panels: [
      ["application", "Uygulama"],
      ["mappings", "Eşleştirmeler"],
      ["backup", "Yedek / Log"],
      ["build", "Sürüm / Build"],
    ],
  },
};

const ROUTE_TARGETS = {
  "admin-yonetim-ozeti": ["management", "overview"],
  "kullanicilar": ["management", "users"],
  "ana-firma-ayarlar": ["management", "companies"],
  "firma-ucretlendirme": ["management", "billing"],
  "admin-guvenlik": ["security", "securityCenter"],
  "uygulama-sahibi": ["security", "owner"],
  "giris-onaylari": ["security", "securityCenter"],
  "admin-sistem": ["system", "application"],
  "uygulama-ayarlari": ["system", "application"],
  "eslestirmeler": ["system", "mappings"],
  "yedekleme-loglar": ["system", "backup"],
  "surum-merkezi": ["system", "build"],
};

function routeTarget(activeTab) {
  return ROUTE_TARGETS[String(activeTab || "")] || ["management", "overview"];
}

export default function AdminPlatformHub({ activeTab, activeMainCompany }) {
  const initial = routeTarget(activeTab);
  const [group, setGroup] = useState(initial[0]);
  const [panel, setPanel] = useState(initial[1]);

  useEffect(() => {
    const [nextGroup, nextPanel] = routeTarget(activeTab);
    setGroup(nextGroup);
    setPanel(nextPanel);
  }, [activeTab]);

  const selectedGroup = GROUPS[group] || GROUPS.management;
  const activeCompanyLabel = activeMainCompany?.name || activeMainCompany?.slug || "Aktif firma seçilmedi";

  const content = useMemo(() => {
    if (panel === "overview") return <AdminSystemOverview activeMainCompany={activeMainCompany} />;
    if (panel === "users") return <AdminUsersPanel activeMainCompany={activeMainCompany} />;
    if (panel === "companies") return <AdminCompanySettings activeMainCompany={activeMainCompany} />;
    if (panel === "authority") return <AdminCompanyAuthority activeMainCompany={activeMainCompany} />;
    if (panel === "billing") return <AdminCompanyBilling activeMainCompany={activeMainCompany} />;
    if (panel === "owner") return <AdminOwnerSecurity />;
    if (panel === "securityCenter") return <SecurityCenterPanel />;
    if (panel === "application") return <AdminApplicationSettings />;
    if (panel === "mappings") return <AdminMappings activeMainCompany={activeMainCompany} />;
    if (panel === "backup") return <AdminBackupLogs activeMainCompany={activeMainCompany} />;
    if (panel === "build") return <AdminBuildCenter />;
    return <AdminSystemOverview activeMainCompany={activeMainCompany} />;
  }, [panel, activeMainCompany]);

  function chooseGroup(key) {
    const next = GROUPS[key];
    if (!next) return;
    setGroup(key);
    setPanel(next.panels[0][0]);
  }

  return (
    <div className="aph-page">
      <header className="aph-header">
        <div>
          <span>PLATFORM YÖNETİMİ</span>
          <h1>KY ERP Yönetim Merkezi</h1>
          <p>Uygulamanın yönetim kalbi üç ana ekranda toplanmıştır. Aynı anda yalnız seçili işlem yüklenir.</p>
        </div>
        <div className="aph-company"><small>AKTİF FİRMA</small><strong>{activeCompanyLabel}</strong></div>
      </header>

      <nav className="aph-main-tabs">
        {Object.entries(GROUPS).map(([key, item]) => (
          <button type="button" className={group === key ? "active" : ""} onClick={() => chooseGroup(key)} key={key}>
            <strong>{item.label}</strong>
            <span>{item.copy}</span>
          </button>
        ))}
      </nav>

      <div className="aph-subbar">
        <div>
          <strong>{selectedGroup.label}</strong>
          <span>{selectedGroup.copy}</span>
        </div>
        <nav>
          {selectedGroup.panels.map(([key, label]) => (
            <button type="button" className={panel === key ? "active" : ""} onClick={() => setPanel(key)} key={key}>{label}</button>
          ))}
        </nav>
      </div>

      <main className="aph-content" key={panel}>{content}</main>
    </div>
  );
}
