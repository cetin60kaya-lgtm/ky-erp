import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  Factory,
  FileText,
  FlaskConical,
  Gauge,
  LockKeyhole,
  Menu,
  Palette,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
  X,
} from "lucide-react";
import PublicCorporateFooter from "../components/public/PublicCorporateFooter";
import PublicReferencesSection from "../components/public/PublicReferencesSection";
import "../styles/public-landing.css";

const APP_URL = "https://app.kyerp.net/";

const MODULES = [
  {
    icon: Gauge,
    title: "PDKS & Personel Takip",
    text: "Kart hareketleri, giriş-çıkış takibi, günlük devam ve puantaj kontrolü.",
    items: ["Kart hareketleri", "Günlük devam", "Puantaj"],
  },
  {
    icon: UsersRound,
    title: "İnsan Kaynakları",
    text: "Personel kartlarından izin, mesai, avans, kesinti, bordro ve ödeme süreçlerine kadar tek merkez.",
    items: ["Personel kartı", "İzin & mesai", "Bordro & ödeme"],
  },
  {
    icon: BarChart3,
    title: "Muhasebe",
    text: "Cari hesap, müşteri ve tedarikçi hareketleri, KDV, ödeme, gelir-gider ve raporlama.",
    items: ["Cari hesap", "KDV", "Gelir & gider"],
  },
  {
    icon: FileText,
    title: "e-Fatura & e-İrsaliye",
    text: "İşNet entegrasyonu ile belge akışları, arşiv, hazırlık ve kontrollü faturalama süreçleri.",
    items: ["İşNet", "Belge akışı", "Arşiv"],
  },
  {
    icon: Factory,
    title: "İmalat",
    text: "Model, baskı bölgesi, üretim adedi, hata, makine ve vardiya takibini aynı üretim merkezinde birleştirir.",
    items: ["Model takibi", "Üretim kayıtları", "Makine & vardiya"],
  },
  {
    icon: FlaskConical,
    title: "Boyahane",
    text: "Numune, reçete, kayıtlı renk, imalat boyaları, ürün, stok ve lot süreçlerini birbirine bağlar.",
    items: ["Reçete", "Renk", "Stok & lot"],
  },
  {
    icon: Palette,
    title: "Desen",
    text: "Gelen desenlerden model ve desen havuzuna, kalıp-yerleşim ve görsel arşive kadar üretim öncesi kontrol.",
    items: ["Desen havuzu", "Kalıp & yerleşim", "Görsel arşiv"],
  },
  {
    icon: Sparkles,
    title: "KY ERP Asistan",
    text: "ERP içindeki bilgileri bulmaya, iş akışlarını değerlendirmeye ve kontrollü işlemleri hızlandırmaya yardımcı olur.",
    items: ["Hızlı sorgu", "Analiz", "İşlem desteği"],
  },
];

const FLOW = [
  ["01", "Müşteri & Belge", "Sipariş ve belge akışı"],
  ["02", "Desen", "Model, baskı bölgesi ve yerleşim"],
  ["03", "Boyahane", "Renk, reçete, stok ve lot"],
  ["04", "İmalat", "Üretim, makine, vardiya ve adet"],
  ["05", "Muhasebe", "Cari, belge, ödeme ve rapor"],
];

function AppPreview() {
  return (
    <div className="ky-public-preview" aria-label="KY ERP uygulama görünümü">
      <div className="ky-public-preview__topbar">
        <div className="ky-public-preview__brand">KY</div>
        <span>Üretim Kontrol Merkezi</span>
        <div className="ky-public-preview__status"><i /> Sistem aktif</div>
      </div>
      <div className="ky-public-preview__body">
        <aside>
          <span className="active">Genel Bakış</span>
          <span>Muhasebe</span>
          <span>İK & PDKS</span>
          <span>Boyahane</span>
          <span>Desen</span>
          <span>İmalat</span>
        </aside>
        <main>
          <div className="ky-public-preview__heading">
            <div><small>KY ERP</small><strong>İşletme Özeti</strong></div>
            <button type="button">Bugün</button>
          </div>
          <div className="ky-public-preview__cards">
            <div><small>Üretim</small><strong>Model Takibi</strong><span>Aktif iş akışı</span></div>
            <div><small>Boyahane</small><strong>Renk & Reçete</strong><span>Lot bağlantılı</span></div>
            <div><small>İK</small><strong>PDKS & Puantaj</strong><span>Günlük kontrol</span></div>
          </div>
          <div className="ky-public-preview__flow">
            <div className="ky-public-preview__flow-title"><Workflow size={17} /> Süreç Akışı</div>
            <div className="ky-public-preview__flow-row"><i className="done" /><b>Desen</b><span>Model hazır</span><em>Tamamlandı</em></div>
            <div className="ky-public-preview__flow-row"><i className="live" /><b>Boyahane</b><span>Renk hazırlanıyor</span><em>İşlemde</em></div>
            <div className="ky-public-preview__flow-row"><i /><b>İmalat</b><span>Üretim sırası</span><em>Bekliyor</em></div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function PublicLandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.title = "KY ERP | Tekstil Üretim ve İşletme Yönetimi";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      "content",
      "KY ERP; PDKS, İK, muhasebe, e-Fatura/e-İrsaliye, boyahane, desen ve imalat süreçlerini tek merkezde birleştiren tekstil ERP sistemidir.",
    );
  }, []);

  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);

  return (
    <div className="ky-public" id="top">
      <header className="ky-public-header">
        <a className="ky-public-logo" href="#top" aria-label="KY ERP ana sayfa">
          <span>KY</span>
          <div><strong>KY ERP</strong><small>Enterprise Resource Planning</small></div>
        </a>

        <nav className={menuOpen ? "is-open" : ""} aria-label="Ana menü">
          <a href="#ozellikler" onClick={() => setMenuOpen(false)}>Özellikler</a>
          <a href="#moduller" onClick={() => setMenuOpen(false)}>Modüller</a>
          <a href="#surec" onClick={() => setMenuOpen(false)}>İş Akışı</a>
          <a href="#referanslar" onClick={() => setMenuOpen(false)}>Referanslar</a>
          <a href="#guvenlik" onClick={() => setMenuOpen(false)}>Güvenlik</a>
          <a href="#iletisim" onClick={() => setMenuOpen(false)}>İletişim</a>
        </nav>

        <div className="ky-public-header__actions">
          <a className="ky-public-login" href={APP_URL}>Uygulamaya Giriş <ArrowRight size={17} /></a>
          <button
            className="ky-public-menu"
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            aria-label="Menüyü aç veya kapat"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <main>
        <section className="ky-public-hero">
          <div className="ky-public-hero__copy">
            <div className="ky-public-eyebrow"><span /> Tekstil işletmeleri için bütünleşik ERP</div>
            <h1>Üretimi, insanı ve finansı <em>tek merkezden</em> yönetin.</h1>
            <p>
              KY ERP; PDKS ve insan kaynaklarından muhasebeye, desenden boyahaneye ve imalata kadar
              tekstil işletmesinin günlük operasyonlarını aynı sistemde birleştirir.
            </p>
            <div className="ky-public-hero__actions">
              <a className="ky-public-primary" href={APP_URL}>KY ERP'ye Giriş <ArrowRight size={18} /></a>
              <a className="ky-public-secondary" href="#moduller">Sistemi İncele</a>
            </div>
            <div className="ky-public-trust">
              <span><CheckCircle2 size={17} /> Rol bazlı yetkilendirme</span>
              <span><CheckCircle2 size={17} /> MFA desteği</span>
              <span><CheckCircle2 size={17} /> İşlem kayıtları</span>
            </div>
          </div>
          <div className="ky-public-hero__visual"><AppPreview /></div>
        </section>

        <section className="ky-public-strip" id="ozellikler">
          <div><Boxes size={22} /><span><b>Tek sistem</b><small>Dağınık operasyon yerine ortak iş akışı</small></span></div>
          <div><Workflow size={22} /><span><b>Bağlantılı süreçler</b><small>Belgeden üretime, üretimden rapora</small></span></div>
          <div><ShieldCheck size={22} /><span><b>Yetkili erişim</b><small>Kullanıcı ve modül bazlı kontrol</small></span></div>
          <div><Sparkles size={22} /><span><b>Akıllı yardımcı</b><small>ERP içinde arama, analiz ve işlem desteği</small></span></div>
        </section>

        <section className="ky-public-section ky-public-modules" id="moduller">
          <div className="ky-public-section__head">
            <div>
              <span className="ky-public-kicker">MODÜLLER</span>
              <h2>İşletmenin ana bölümleri aynı veri akışında.</h2>
            </div>
            <p>Her bölüm kendi iş ekranına sahip olur; bilgiler gerektiği yerde diğer modüllerle kontrollü olarak birleşir.</p>
          </div>

          <div className="ky-public-module-grid">
            {MODULES.map(({ icon: Icon, title, text, items }) => (
              <article className="ky-public-module" key={title}>
                <div className="ky-public-module__icon"><Icon size={22} /></div>
                <h3>{title}</h3>
                <p>{text}</p>
                <div className="ky-public-module__items">
                  {items.map((item) => <span key={item}>{item}</span>)}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="ky-public-section ky-public-process" id="surec">
          <div className="ky-public-process__intro">
            <span className="ky-public-kicker">UÇTAN UCA İŞ AKIŞI</span>
            <h2>Bir modelin yolculuğu sistem içinde kopmadan ilerler.</h2>
            <p>
              Sipariş ve belgeden başlayan süreç; desen, renk hazırlığı, üretim ve mali takibe kadar ortak model ve firma ilişkileriyle devam eder.
            </p>
            <a href={APP_URL}>Uygulamayı aç <ArrowRight size={17} /></a>
          </div>
          <div className="ky-public-process__flow">
            {FLOW.map(([no, title, text], index) => (
              <div className="ky-public-process__step" key={no}>
                <span>{no}</span>
                <div><strong>{title}</strong><small>{text}</small></div>
                {index < FLOW.length - 1 ? <ArrowRight size={18} /> : <CheckCircle2 size={19} />}
              </div>
            ))}
          </div>
        </section>

        <PublicReferencesSection />

        <section className="ky-public-section ky-public-security" id="guvenlik">
          <div className="ky-public-security__panel">
            <div className="ky-public-security__icon"><LockKeyhole size={32} /></div>
            <span className="ky-public-kicker">GÜVENLİK & YETKİ</span>
            <h2>Herkes yalnızca işi için gereken alanı görür.</h2>
            <p>
              KY ERP; kullanıcı, rol ve modül izinlerini ayrı yönetir. MFA doğrulaması, oturum yönetimi ve işlem kayıtları kritik iş akışlarının denetlenebilir kalmasına yardımcı olur.
            </p>
          </div>
          <div className="ky-public-security__list">
            <div><ShieldCheck size={21} /><span><strong>Rol bazlı erişim</strong><small>Modül ve işlem seviyesinde yetki kontrolü</small></span></div>
            <div><LockKeyhole size={21} /><span><strong>MFA doğrulaması</strong><small>Desteklenen doğrulayıcı uygulamalarla ek güvenlik</small></span></div>
            <div><FileText size={21} /><span><strong>İşlem geçmişi</strong><small>Kritik hareketlerde izlenebilir kayıt yapısı</small></span></div>
            <div><Boxes size={21} /><span><strong>Özel işletme verisi</strong><small>ERP içeriği tanıtım sitesinde yayınlanmaz</small></span></div>
          </div>
        </section>

        <section className="ky-public-cta">
          <div>
            <span>KY ERP</span>
            <h2>İşletmenizin çalışma merkezine geçin.</h2>
            <p>Yetkili kullanıcılar güvenli giriş ekranından KY ERP uygulamasına devam edebilir.</p>
          </div>
          <a href={APP_URL}>Uygulamaya Giriş <ArrowRight size={19} /></a>
        </section>
      </main>

      <PublicCorporateFooter />
    </div>
  );
}
