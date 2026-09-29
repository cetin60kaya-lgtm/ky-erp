import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  FileImage,
  FileText,
  KeyRound,
  LockKeyhole,
  MailCheck,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UploadCloud,
  UserCheck,
  WalletCards,
} from "lucide-react";
import "../../styles/public-presentation-stories.css";

const SECURITY_STEPS = [
  {
    key: "credentials",
    eyebrow: "01 · HESAP",
    title: "Kimlik bilgisi ve Turnstile kontrolü",
    text: "Giriş isteği önce hesap bilgisi, cihaz ve Cloudflare bot korumasıyla doğrulanır.",
  },
  {
    key: "phone",
    eyebrow: "02 · TELEFON ONAYI",
    title: "Bilgisayardaki sayı telefondan eşleştirilir",
    text: "Kayıtlı güvenilir telefonda doğru iki haneli sayı seçildiğinde giriş isteği doğrulanır.",
  },
  {
    key: "mfa",
    eyebrow: "03 · YEDEK MFA",
    title: "Google veya Microsoft Authenticator",
    text: "Telefon onayı kullanılamadığında desteklenen Authenticator yöntemi güvenli yedek akış olarak devreye alınabilir.",
  },
  {
    key: "access",
    eyebrow: "04 · YETKİ",
    title: "Firma sahibi ve yetkili kullanıcı kapsamı",
    text: "Kullanıcılar yalnızca kendilerine verilen firma, modül ve işlem izinleriyle çalışma alanına erişir.",
  },
];

const ACCOUNTING_DOCS = [
  { key: "xml", label: "XML", file: "GelenFatura_2026_0917.xml", icon: FileText },
  { key: "pdf", label: "PDF", file: "Fatura_2026_0917.pdf", icon: FileText },
  { key: "image", label: "Görsel", file: "fatura-tarama.jpg", icon: FileImage },
];

const ACCOUNTING_PHASES = [
  ["Belge okundu", "Fatura numarası, tarih ve kalemler ayrıştırıldı"],
  ["Cari eşleşti", "Tedarikçi kaydı ve belge ilişkisi hazır"],
  ["Gider tanımı", "Kimyasal hammadde / üretim gideri sınıflandırması"],
  ["Finansal etki", "Cari, gider ve kâr-zarar görünümüne işlendi"],
];

function SecurityVisual({ activeStep }) {
  const step = SECURITY_STEPS[activeStep];
  return (
    <div className={`ky-story-security-visual is-${step.key}`}>
      <div className="ky-story-window">
        <div className="ky-story-window__bar">
          <span><i /> KY ERP Güvenli Giriş</span>
          <em>Canlı güvenlik akışı</em>
        </div>
        <div className="ky-story-login-card">
          <div className="ky-story-login-brand"><span>KY</span><b>Kurumsal Giriş</b></div>
          <div className="ky-story-field"><small>Kurumsal e-posta</small><strong>kullanici@firma.com</strong></div>
          <div className="ky-story-field"><small>Şifre</small><strong>••••••••••</strong></div>
          <div className="ky-story-turnstile"><ShieldCheck size={17} /><span>Cloudflare doğrulaması</span><b>✓</b></div>
          <button type="button">Giriş isteğini doğrula <ArrowRight size={15} /></button>
        </div>
        <div className="ky-story-sensitive ky-story-sensitive--one" aria-hidden="true" />
        <div className="ky-story-sensitive ky-story-sensitive--two" aria-hidden="true" />
      </div>

      <div className="ky-story-phone">
        <div className="ky-story-phone__speaker" />
        <div className="ky-story-phone__head"><span>KY</span><div><b>KY ERP Güvenlik</b><small>Giriş Onayı</small></div></div>
        <p>Bilgisayarda gördüğünüz sayıyı seçin.</p>
        <strong className="ky-story-match">42</strong>
        <div className="ky-story-number-grid"><span>18</span><span className="active">42</span><span>73</span></div>
        <div className="ky-story-phone__status"><BadgeCheck size={16} /> Güvenilir telefon</div>
      </div>

      <div className="ky-story-authenticators">
        <span className="ky-story-auth-card google"><b>G</b><small>Google</small><em>Authenticator</em></span>
        <span className="ky-story-auth-card microsoft"><b>M</b><small>Microsoft</small><em>Authenticator</em></span>
      </div>

      <div className="ky-story-access-card">
        <header><UserCheck size={17} /><b>Yetki kapsamı</b><span>Firma bazlı</span></header>
        <div><span>Muhasebe</span><b>✓</b></div>
        <div><span>e-Belge</span><b>✓</b></div>
        <div><span>İK</span><b className="off">—</b></div>
        <div><span>Sistem Merkezi</span><b className="off">—</b></div>
      </div>

      <div className="ky-story-veil" aria-hidden="true"><span>Yetkili içerik</span></div>
    </div>
  );
}

function AccountingVisual({ docIndex, setDocIndex }) {
  const doc = ACCOUNTING_DOCS[docIndex];
  const DocIcon = doc.icon;
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setPhase((value) => (value + 1) % ACCOUNTING_PHASES.length), 2800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => setPhase(0), [docIndex]);

  return (
    <div className="ky-story-accounting-visual">
      <div className="ky-story-upload-card">
        <div className="ky-story-upload-icon"><UploadCloud size={28} /></div>
        <span>Belgeyi bırakın</span>
        <h3>XML, PDF veya görsel</h3>
        <p>Tanıtım önizlemesi · gerçek firma verisi gösterilmez.</p>
        <div className="ky-story-doc-switch">
          {ACCOUNTING_DOCS.map((item, index) => (
            <button type="button" key={item.key} className={index === docIndex ? "active" : ""} onClick={() => setDocIndex(index)}>{item.label}</button>
          ))}
        </div>
        <div className="ky-story-file-pill"><DocIcon size={16} /><span>{doc.file}</span><BadgeCheck size={15} /></div>
      </div>

      <div className="ky-story-accounting-flow">
        {ACCOUNTING_PHASES.map(([title, text], index) => (
          <div key={title} className={index <= phase ? "done" : ""}>
            <span>{index + 1}</span><p><b>{title}</b><small>{text}</small></p><em>{index < phase ? "✓" : index === phase ? "İşleniyor" : "Sırada"}</em>
          </div>
        ))}
      </div>

      <div className="ky-story-finance-card">
        <header><WalletCards size={17} /><b>Muhasebe etkisi</b><span>Yetkili görünüm</span></header>
        <div className="ky-story-finance-grid">
          <article><small>Cari hesap</small><strong>ABC Kimya</strong><span>Tedarikçi</span></article>
          <article><small>Gider sınıfı</small><strong>Hammadde</strong><span>Üretim gideri</span></article>
          <article className="masked"><small>Cari bakiye</small><strong>₺ 48.750,00</strong><span>Hassas finansal veri</span></article>
          <article className="masked"><small>Kâr / zarar</small><strong>₺ 132.480,00</strong><span>Aylık etki</span></article>
        </div>
        <div className="ky-story-profit-line"><i style={{ width: `${58 + phase * 9}%` }} /><span>Belge → Cari → Gider → Kâr/Zarar</span></div>
      </div>
    </div>
  );
}

export default function PublicPresentationStories() {
  const [securityStep, setSecurityStep] = useState(0);
  const [docIndex, setDocIndex] = useState(0);
  const activeSecurity = useMemo(() => SECURITY_STEPS[securityStep], [securityStep]);

  useEffect(() => {
    const timer = window.setInterval(() => setSecurityStep((value) => (value + 1) % SECURITY_STEPS.length), 4800);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setDocIndex((value) => (value + 1) % ACCOUNTING_DOCS.length), 9200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="ky-presentation-stories">
      <section className="ky-story ky-story-security" id="guvenlik">
        <div className="ky-story-copy">
          <span className="ky-public-kicker">GÜVENLİK SUNUMU</span>
          <h2>Giriş yapmak değil. <em>Yetkili olduğunuzu doğrulamak.</em></h2>
          <p>KY ERP; telefon sayı eşleştirme, desteklenen Authenticator yöntemleri, cihaz kontrolleri ve firma/modül yetkilerini tek güvenlik akışında birleştirir.</p>
          <div className="ky-story-steps">
            {SECURITY_STEPS.map((item, index) => (
              <button type="button" key={item.key} className={index === securityStep ? "active" : ""} onClick={() => setSecurityStep(index)}>
                <span>{String(index + 1).padStart(2, "0")}</span><div><small>{item.eyebrow}</small><b>{item.title}</b></div>
              </button>
            ))}
          </div>
          <div className="ky-story-active-copy"><ShieldCheck size={18} /><span><b>{activeSecurity.title}</b><small>{activeSecurity.text}</small></span></div>
        </div>
        <SecurityVisual activeStep={securityStep} />
      </section>

      <section className="ky-story ky-story-accounting" id="muhasebe-demo">
        <div className="ky-story-copy">
          <span className="ky-public-kicker">MUHASEBE & e-BELGE</span>
          <h2>Belgeyi yükleyin. <em>Muhasebe akışı yerine otursun.</em></h2>
          <p>XML, PDF veya görsel belgenin içeriği okunur; cari ve belge ilişkisi hazırlanır, gider sınıfı belirlenir ve finansal görünümde izlenebilir hale gelir.</p>
          <div className="ky-story-accounting-points">
            <span><FileText size={18} /><b>XML / PDF / Görsel</b><small>Tek yükleme alanı</small></span>
            <span><Building2 size={18} /><b>Cari eşleştirme</b><small>Tedarikçi ve belge ilişkisi</small></span>
            <span><WalletCards size={18} /><b>Gelir / Gider</b><small>Kategori ve finansal etki</small></span>
            <span><Sparkles size={18} /><b>Akıllı kontrol</b><small>Eksik veya eşleşmeyen alan uyarısı</small></span>
          </div>
          <div className="ky-story-private-note"><LockKeyhole size={16} /><span>Finansal rakamlar ve gerçek işletme verileri tanıtım alanında bilinçli olarak puslu gösterilir.</span></div>
        </div>
        <AccountingVisual docIndex={docIndex} setDocIndex={setDocIndex} />
      </section>

      <div className="ky-story-bottom-note"><MailCheck size={17} /><span>Sunum ekranları ürün iş akışını gösterir; kişisel, firma ve finansal veriler public alanda yayınlanmaz.</span><KeyRound size={17} /></div>
    </div>
  );
}
