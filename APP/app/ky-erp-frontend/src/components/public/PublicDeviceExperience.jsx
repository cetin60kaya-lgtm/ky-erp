import { ArrowRight, CheckCircle2, ShieldCheck, Smartphone, Workflow } from "lucide-react";
import "../../styles/public-device-experience.css";

const APP_URL = "https://app.kyerp.net/";

const PLATFORMS = ["Windows PC", "Android", "iPhone", "iPad", "Tarayıcı", "PWA"];
const FLOW = [
  ["1", "Hesabınla gir", "Kurumsal e-posta veya kullanıcı adı"],
  ["2", "Güvenliği doğrula", "Telefon sayı eşleştirme veya desteklenen MFA"],
  ["3", "Yetkili alanına geç", "Firma, modül ve işlem izinlerine göre çalışma alanı"],
];

function MiniWorkspace({ compact = false }) {
  return (
    <div className={`ky-device-workspace${compact ? " compact" : ""}`}>
      <header><span>KY</span><b>KY ERP</b><em><i /> Aktif</em></header>
      <div className="ky-device-workspace__body">
        <aside><i className="active" /><i /><i /><i /></aside>
        <main>
          <div className="ky-device-workspace__title"><b>Çalışma Alanı</b><span>Yetkili görünüm</span></div>
          <div className="ky-device-workspace__cards"><span /><span /><span /></div>
          <div className="ky-device-workspace__rows"><i /><i /><i /></div>
        </main>
      </div>
    </div>
  );
}

export default function PublicDeviceExperience() {
  return (
    <section className="ky-device-experience" id="cihazlar">
      <div className="ky-device-experience__head">
        <div>
          <span className="ky-public-kicker">HER CİHAZDA AYNI DÜZEN</span>
          <h2>Masada PC. Sahada telefon. <em>Aynı KY ERP.</em></h2>
          <p>Arayüz; masaüstü, tablet ve telefon profillerine uyarlanır. Android ve iPhone/iPad tarafında tarayıcı veya kurulu PWA deneyimiyle temel işlemler erişilebilir kalır.</p>
        </div>
        <div className="ky-device-platforms">{PLATFORMS.map((item) => <span key={item}>{item}</span>)}</div>
      </div>

      <div className="ky-device-experience__stage">
        <div className="ky-device-desktop"><MiniWorkspace /></div>
        <div className="ky-device-tablet"><MiniWorkspace compact /></div>
        <div className="ky-device-phone"><span className="ky-device-phone__speaker" /><MiniWorkspace compact /></div>
        <div className="ky-device-fog fog-one" aria-hidden="true" />
        <div className="ky-device-fog fog-two" aria-hidden="true" />
        <div className="ky-device-security-chip"><ShieldCheck size={16} /><span><b>Güvenli erişim</b><small>Yetkiye göre içerik</small></span></div>
        <div className="ky-device-sync-chip"><Workflow size={16} /><span><b>Tek iş akışı</b><small>Cihaz değişse de düzen aynı</small></span></div>
      </div>

      <div className="ky-device-entry-flow">
        <div className="ky-device-entry-flow__title"><Smartphone size={20} /><span><b>İlk girişten çalışma alanına</b><small>Firma seçme ekranı olmadan kimlik → güvenlik → yetkili alan</small></span></div>
        <div className="ky-device-entry-flow__steps">
          {FLOW.map(([no, title, text]) => <div key={no}><span>{no}</span><p><b>{title}</b><small>{text}</small></p><CheckCircle2 size={16} /></div>)}
        </div>
        <a href={APP_URL}>Doğrudan Sisteme Gir <ArrowRight size={17} /></a>
      </div>
    </section>
  );
}
