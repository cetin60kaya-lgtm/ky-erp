import { ArrowRight, BellRing, Factory, FileText, LayoutDashboard, ShieldCheck, Wallet, Wrench } from "lucide-react";
import { visibleNavigationGroups } from "../app/navigationGroups";
import "../styles/ky-pro-home.css";

const ICONS = { daily: BellRing, production: Factory, finance: Wallet, communication: FileText, management: Wrench };

export default function HomeDashboard({ modules = [], activeMainCompany, user, openModule }) {
  const firstName = String(user?.fullName || user?.username || "").trim().split(/\s+/)[0];
  const company = activeMainCompany?.name || activeMainCompany?.title || "Çalışma alanınız";
  const allowedGroups = visibleNavigationGroups(modules).map((group) => ({
    ...group, title: group.homeTitle, Icon: ICONS[group.key],
  }));

  const navigate = (module) => {
    const firstTab = module?.groups?.[0]?.tabs?.[0]?.[0] || module?.tabs?.[0]?.[0] || "";
    openModule?.(module.key, { tabKey: firstTab });
  };

  return (
    <div className="ky-pro-home">
      <section className="ky-pro-home-hero">
        <div className="ky-pro-home-welcome">
          <span className="ky-pro-home-eyebrow"><LayoutDashboard size={15} /> ANA SAYFA</span>
          <h1>{firstName ? `Hoş geldiniz, ${firstName}` : "İşletme çalışma alanı"}</h1>
          <p>Günlük işlemlere, üretim süreçlerine ve finans ekranlarına tek yerden ulaşın.</p>
          <span className="ky-pro-home-company">{company}</span>
        </div>
        <div className="ky-pro-home-security">
          <ShieldCheck size={21} aria-hidden="true" />
          <div><strong>Yetkili çalışma alanı</strong><small>Yalnız hesabınıza tanımlı ekranlar listelenir. Güncel işlem tutarlarını ilgili modülden görüntüleyin.</small></div>
        </div>
      </section>
      <section className="ky-pro-home-section" aria-label="Çalışma alanları">
        <div className="ky-pro-home-heading"><div><span>HIZLI ERİŞİM</span><h2>Çalışma alanlarınız</h2></div><p>İhtiyacınız olan bölümü seçerek doğrudan işleme başlayın.</p></div>
        <div className="ky-pro-home-grid">
          {allowedGroups.map(({ title, description, modules: groupModules, Icon }) => (
            <article className="ky-pro-home-card" key={title}>
              <div className="ky-pro-home-card-header"><span className="ky-pro-home-icon"><Icon size={20} /></span><div><h3>{title}</h3><p>{description}</p></div></div>
              <div className="ky-pro-home-card-actions">
                {groupModules.map((module) => (
                  <button type="button" key={module.key} onClick={() => navigate(module)}>
                    <span>{module.label}</span><ArrowRight size={16} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
