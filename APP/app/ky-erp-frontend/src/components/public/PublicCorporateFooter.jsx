import { ArrowRight, Mail, Phone } from "lucide-react";
import "../../styles/public-corporate-footer.css";

const APP_URL = "https://app.kyerp.net/";
const CONTACT_EMAIL = "iletisim@kyerp.net";
const CONTACT_PHONE = "+90 542 394 06 54";
const CONTACT_PHONE_HREF = "tel:+905423940654";

export default function PublicCorporateFooter() {
  return (
    <footer className="ky-corporate-footer" id="iletisim">
      <div className="ky-corporate-footer__main">
        <div className="ky-corporate-footer__brand">
          <a className="ky-public-logo ky-public-logo--footer" href="#top" aria-label="KY ERP ana sayfa">
            <span>KY</span>
            <div><strong>KY ERP</strong><small>Enterprise Resource Planning</small></div>
          </a>
          <p>Tekstil üretim ve işletme süreçlerini tek merkezde birleştiren bütünleşik ERP sistemi.</p>
        </div>

        <nav className="ky-corporate-footer__links" aria-label="Footer hızlı erişim">
          <strong>Hızlı Erişim</strong>
          <a href="#ozellikler">Özellikler</a>
          <a href="#moduller">Modüller</a>
          <a href="#surec">İş Akışı</a>
          <a href="#guvenlik">Güvenlik</a>
          <a href={APP_URL}>Uygulamaya Giriş <ArrowRight size={14} /></a>
        </nav>

        <div className="ky-corporate-footer__contact">
          <strong>İletişim</strong>
          <a href={CONTACT_PHONE_HREF}><Phone size={16} /><span>{CONTACT_PHONE}</span></a>
          <a href={`mailto:${CONTACT_EMAIL}`}><Mail size={16} /><span>{CONTACT_EMAIL}</span></a>
          <a className="ky-corporate-footer__domain" href="https://kyerp.net/">kyerp.net</a>
          <small>admin@kyerp.net yalnız sistem bildirimleri için ayrılmıştır.</small>
        </div>
      </div>

      <div className="ky-corporate-footer__bottom">
        <span>© 2026 KY ERP. Tüm hakları saklıdır.</span>
        <div className="ky-corporate-footer__legal" aria-label="Yasal bilgilendirme başlıkları">
          <span>KVKK</span>
          <span>Gizlilik</span>
          <span>Kullanım Koşulları</span>
          <span>Çerez Politikası</span>
        </div>
      </div>
    </footer>
  );
}
