import { ArrowRight, CalendarDays, ClipboardList, Factory, FileText, LayoutDashboard, ShieldCheck, UsersRound, Wallet } from "lucide-react";
import "../styles/ky-pro-home.css";

const SHORTCUTS = [
  { key: "muhasebe", title: "Muhasebe", detail: "Cari ve finans işlemleri" },
  { key: "gunluk-operasyon", tab: "daily-entry", title: "Günlük Operasyon", detail: "Günlük personel girişi" },
  { key: "ik", title: "İK Aylık", detail: "Maaş, bordro ve izin" },
  { key: "pdks", title: "PDKS", detail: "Kart ve devam takibi" },
];

const OVERVIEW = [
  { key: "gunluk-operasyon", tab: "daily-dashboard", title: "Günlük İşler", detail: "Günlük kayıt ve hakediş durumunu kontrol et", icon: ClipboardList },
  { key: "pdks", tab: "ana-ekran", title: "Personel Durumu", detail: "Bugünkü kart okutma ve giriş/çıkışları görüntüle", icon: UsersRound },
  { key: "uretim", tab: "uretim-merkezi", title: "Açık İmalat", detail: "Modellerin üretim ve kalan iş durumuna git", icon: Factory },
  { key: "e-belge", tab: "gelen-belgeler", title: "Belgeler & Faturalar", detail: "Gelen belge ve kontrol bekleyen işlemlere git", icon: FileText },
];

const FOLLOW_UP = [
  { key: "muhasebe", tab: "finans-islemleri", title: "Cari ve ödeme planını kontrol et", description: "Muhasebe / Finans İşlemleri" },
  { key: "gunluk-operasyon", tab: "daily-payments", title: "Günlük hakediş ve ödemeleri kontrol et", description: "Günlük Operasyon / Hakediş & Ödeme" },
  { key: "compliance", tab: "denetim-takvim", title: "Evrak süreleri ve denetim takvimini kontrol et", description: "Denetim Merkezi / Süre & Takvim" },
];

function firstTabFor(module) {
  return module?.groups?.[0]?.tabs?.[0]?.[0] || module?.tabs?.[0]?.[0] || "";
}

export default function HomeDashboard({ modules = [], activeMainCompany, openModule }) {
  const accessible = new Map(modules.filter((module) => module.key !== "ana-sayfa").map((module) => [module.key, module]));
  const company = activeMainCompany?.name || activeMainCompany?.title || "Aktif çalışma alanı";
  const dateLabel = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul", dateStyle: "full",
  }).format(new Date());
  const navigate = (moduleKey, requestedTab = "") => {
    const module = accessible.get(moduleKey);
    if (module) openModule?.(module.key, { tabKey: requestedTab || firstTabFor(module) });
  };
  const shortcuts = SHORTCUTS.filter((item) => accessible.has(item.key));
  const overview = OVERVIEW.filter((item) => accessible.has(item.key));
  const followUp = FOLLOW_UP.filter((item) => accessible.has(item.key));

  return (
    <div className="ky-pro-home">
      <header className="ky-pro-home-hero">
        <div className="ky-pro-home-welcome">
          <span className="ky-pro-home-eyebrow"><LayoutDashboard size={16} /> GENEL BAKIŞ</span>
          <h1>İşletme Özeti</h1>
          <p>Günlük kontrol ve sık kullandığınız işlemler tek ekranda.</p>
          <div className="ky-pro-home-context">
            <span className="ky-pro-home-company">{company}</span>
            <span className="ky-pro-home-date"><CalendarDays size={15} />{dateLabel}</span>
          </div>
        </div>
        <div className="ky-pro-home-security">
          <ShieldCheck size={20} aria-hidden="true" />
          <div><strong>Yetkili çalışma alanı</strong><small>Yalnızca erişim izniniz olan bölümler gösterilir.</small></div>
        </div>
      </header>

      {shortcuts.length > 0 ? (
        <section className="ky-pro-home-section" aria-label="Sık kullanılan işlemler">
          <div className="ky-pro-home-heading"><div><span>HIZLI ERİŞİM</span><h2>Sık kullanılan işlemler</h2></div></div>
          <div className="ky-pro-home-shortcuts">
            {shortcuts.map((entry) => (
              <button type="button" key={entry.key} onClick={() => navigate(entry.key, entry.tab)}>
                <span><strong>{entry.title}</strong><small>{entry.detail}</small></span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {overview.length > 0 ? (
        <section className="ky-pro-home-section" aria-label="Günlük işletme takibi">
          <div className="ky-pro-home-heading">
            <div><span>GÜNLÜK KONTROL</span><h2>İşletme durumu</h2></div>
            <p>Gerçek kayıt ve adetler ilgili modül ekranlarında görüntülenir.</p>
          </div>
          <div className="ky-pro-home-overview">
            {overview.map(({ key, title, detail, icon: Icon, tab }) => (
              <button type="button" key={key} className="ky-pro-home-overview-card" onClick={() => navigate(key, tab)}>
                <span className="ky-pro-home-overview-icon"><Icon size={21} /></span>
                <strong>{title}</strong>
                <small>{detail}</small>
                <span className="ky-pro-home-overview-action">İşlemleri aç <ArrowRight size={15} /></span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {followUp.length > 0 ? (
        <section className="ky-pro-home-section ky-pro-home-follow-up" aria-label="Kontrol bağlantıları">
          <div className="ky-pro-home-heading"><div><span>TAKİP</span><h2>Kontrol listesi</h2></div></div>
          <div className="ky-pro-home-follow-up-list">
            {followUp.map((entry) => (
              <button type="button" key={entry.key} onClick={() => navigate(entry.key, entry.tab)}>
                <span className="ky-pro-home-follow-up-icon"><Wallet size={17} /></span>
                <span><strong>{entry.title}</strong><small>{entry.description}</small></span>
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
