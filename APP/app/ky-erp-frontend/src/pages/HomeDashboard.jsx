import { ArrowRight, BellRing, CalendarDays, Factory, FileText, LayoutDashboard, ShieldCheck, Wallet, Wrench } from "lucide-react";
import { visibleNavigationGroups } from "../app/navigationGroups";
import "../styles/ky-pro-home.css";

const ICONS = { daily: BellRing, production: Factory, finance: Wallet, communication: FileText, management: Wrench };
const SHORTCUTS = [
  { key: "gunluk-operasyon", title: "Günlük Operasyon", detail: "Mevcut seri giriş ekranına git" },
  { key: "ik", title: "İK Aylık", detail: "Personel, bordro ve izin" },
  { key: "muhasebe", title: "Muhasebe", detail: "Finans ve cari işlemler" },
  { key: "pdks", title: "PDKS", detail: "SGK'lı kart takip personeli" },
];

function firstTabFor(module) {
  return module?.groups?.[0]?.tabs?.[0]?.[0] || module?.tabs?.[0]?.[0] || "";
}

export default function HomeDashboard({ modules = [], activeMainCompany, openModule }) {
  const allowedGroups = visibleNavigationGroups(modules).map((group) => ({
    ...group,
    title: group.homeTitle,
    Icon: ICONS[group.key],
  }));
  const accessible = new Map(modules.filter((module) => module.key !== "ana-sayfa").map((module) => [module.key, module]));
  const shortcuts = SHORTCUTS.filter((entry) => accessible.has(entry.key));
  const company = activeMainCompany?.name || activeMainCompany?.title || "Aktif çalışma alanı";
  const dateLabel = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul", dateStyle: "full",
  }).format(new Date());
  const navigate = (moduleKey, requestedTab = "") => {
    const module = accessible.get(moduleKey);
    if (module) openModule?.(module.key, { tabKey: requestedTab || firstTabFor(module) });
  };

  return (
    <div className="ky-pro-home">
      <header className="ky-pro-home-hero">
        <div className="ky-pro-home-welcome">
          <span className="ky-pro-home-eyebrow"><LayoutDashboard size={16} /> ÇALIŞMA ALANI</span>
          <h1>İyi çalışmalar</h1>
          <p>İşlerinize kaldığınız yerden devam edin. Bütün bölümler yalnızca hesabınızın yetkileriyle açılır.</p>
          <div className="ky-pro-home-context">
            <span className="ky-pro-home-company">{company}</span>
            <span className="ky-pro-home-date"><CalendarDays size={15} />{dateLabel}</span>
          </div>
        </div>
        <div className="ky-pro-home-security">
          <ShieldCheck size={22} aria-hidden="true" />
          <div><strong>Güvenli çalışma alanı</strong><small>Firma ve modül erişimleri hesabınıza göre belirlenir. Tutar ve puantaj verileri ilgili gerçek ekranlardan okunur.</small></div>
        </div>
      </header>
      {shortcuts.length > 0 ? (
        <section className="ky-pro-home-section" aria-label="Sık kullanılan işlemler">
          <div className="ky-pro-home-heading"><div><span>BAŞLANGIÇ</span><h2>Sık kullanılan işlemler</h2></div></div>
          <div className="ky-pro-home-shortcuts">
            {shortcuts.map((entry) => (
              <button type="button" key={entry.key} onClick={() => navigate(entry.key, entry.key === "gunluk-operasyon" ? "daily-entry" : "")}>
                <span><strong>{entry.title}</strong><small>{entry.detail}</small></span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <section className="ky-pro-home-section" aria-label="Modül çalışma alanları">
        <div className="ky-pro-home-heading">
          <div><span>BÖLÜMLER</span><h2>Çalışma alanları</h2></div>
          <p>Sol menüden veya aşağıdaki bağlantılardan istediğiniz modüle geçin.</p>
        </div>
        <div className="ky-pro-home-grid">
          {allowedGroups.map(({ key, title, description, modules: groupModules, Icon }) => (
            <article className="ky-pro-home-card" key={key}>
              <div className="ky-pro-home-card-header"><span className="ky-pro-home-icon"><Icon size={20} /></span><div><h3>{title}</h3><p>{description}</p></div></div>
              <div className="ky-pro-home-card-actions">
                {groupModules.map((module) => (
                  <button type="button" key={module.key} onClick={() => navigate(module.key)}>
                    <span>{module.label}</span><ArrowRight size={17} aria-hidden="true" />
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
