import {
  ArrowUpRight,
  Building2,
  Factory,
  Mail,
  MapPin,
  Palette,
  Phone,
  UserRound,
  UsersRound,
} from "lucide-react";
import "../../styles/public-references.css";

const HAKAN_EMPRIME = {
  name: "HAKAN EMPRİME",
  business: "Tekstil Aksesuarları ve Yan Ürünleri",
  contact: "Mecit Hakan Gürsu",
  address: "Bağlar Mah. 19. Sok. No: 4/11, Bağcılar / İstanbul",
  phone: "0532 428 40 18",
  phoneHref: "tel:+905324284018",
  email: "hkngursu@hotmail.com",
  emailHref: "mailto:hkngursu@hotmail.com",
};

export default function PublicReferencesSection() {
  return (
    <section className="ky-public-section ky-public-references" id="referanslar">
      <div className="ky-public-section__head ky-public-references__head">
        <div>
          <span className="ky-public-kicker">REFERANSLAR</span>
          <h2>Gerçek işletme süreçlerinde kullanılan KY ERP.</h2>
        </div>
        <p>
          KY ERP; üretim, personel ve mali süreçlerin aynı veri akışında ilerlemesi için sahadaki gerçek iş
          akışlarıyla birlikte geliştirilmektedir.
        </p>
      </div>

      <article className="ky-reference-card">
        <div className="ky-reference-card__brand">
          <div className="ky-reference-card__logo-wrap" aria-label="Hakan Emprime logo">
            <img src="/hakan-emprime-mark.svg" alt="Hakan Emprime" />
          </div>
          <div className="ky-reference-card__identity">
            <span className="ky-reference-card__badge">İlk Referans</span>
            <h3>{HAKAN_EMPRIME.name}</h3>
            <p>{HAKAN_EMPRIME.business}</p>
            <strong>Profesyonel tekstil baskı ve üretim hizmetleri</strong>
          </div>
        </div>

        <div className="ky-reference-card__services" aria-label="KY ERP kullanım alanları">
          <div><Factory size={18} /><span><b>Üretim Yönetimi</b><small>İmalat ve operasyon takibi</small></span></div>
          <div><Palette size={18} /><span><b>Desen & Boyahane</b><small>Desenden reçete ve üretime</small></span></div>
          <div><UsersRound size={18} /><span><b>İK & PDKS</b><small>Personel ve devam kontrolü</small></span></div>
          <div><Building2 size={18} /><span><b>Muhasebe</b><small>Cari, belge ve finansal takip</small></span></div>
        </div>

        <div className="ky-reference-card__contact">
          <div className="ky-reference-card__contact-title">Firma Bilgileri</div>
          <div className="ky-reference-card__contact-grid">
            <div><UserRound size={17} /><span><small>Yetkili</small><strong>{HAKAN_EMPRIME.contact}</strong></span></div>
            <div><MapPin size={17} /><span><small>Adres</small><strong>{HAKAN_EMPRIME.address}</strong></span></div>
            <a href={HAKAN_EMPRIME.phoneHref}><Phone size={17} /><span><small>Telefon</small><strong>{HAKAN_EMPRIME.phone}</strong></span><ArrowUpRight size={15} /></a>
            <a href={HAKAN_EMPRIME.emailHref}><Mail size={17} /><span><small>E-posta</small><strong>{HAKAN_EMPRIME.email}</strong></span><ArrowUpRight size={15} /></a>
          </div>
        </div>
      </article>
    </section>
  );
}
