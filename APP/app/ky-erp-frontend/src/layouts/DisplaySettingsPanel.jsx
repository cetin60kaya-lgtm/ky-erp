import {
  Check,
  Download,
  ExternalLink,
  Monitor,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Smartphone,
  Tablet,
  X,
} from "lucide-react";
import { displayModeLabel } from "../utils/displayPreferences";
import "./DisplaySettingsPanel.css";

const MODE_OPTIONS = [
  { value: "auto", label: "Otomatik", description: "Cihaz ve ekran boyutuna göre kendisi ayarlar.", icon: Settings2 },
  { value: "pc", label: "PC Modu", description: "Geniş çalışma alanı, tablolar ve çok kolonlu düzen.", icon: Monitor },
  { value: "tablet", label: "Tablet Modu", description: "Dokunmatik kullanım, dengeli kolonlar ve açılır menü.", icon: Tablet },
  { value: "phone", label: "Telefon Modu", description: "Tek kolon, büyük dokunma alanları ve kompakt üst bar.", icon: Smartphone },
];

const SCALE_OPTIONS = ["auto", 80, 90, 100, 110, 125];

function SettingRow({ icon: Icon, title, description, children }) {
  return (
    <div className="display-settings-row">
      <span className="display-settings-row-icon"><Icon size={18} /></span>
      <span className="display-settings-row-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className="display-settings-row-control">{children}</span>
    </div>
  );
}

function detectPlatform() {
  try {
    const ua = String(window.navigator?.userAgent || "");
    const ios = /iPhone|iPad|iPod/i.test(ua)
      || (String(window.navigator?.platform || "") === "MacIntel" && Number(window.navigator?.maxTouchPoints || 0) > 1);
    if (ios) return { key: "ios", label: "iPhone / iPad" };
    if (/Android/i.test(ua)) return { key: "android", label: "Android" };
    if (/Windows/i.test(ua)) return { key: "windows", label: "Windows / PC" };
    if (/Macintosh|Mac OS X/i.test(ua)) return { key: "mac", label: "macOS" };
  } catch { /* noop */ }
  return { key: "other", label: "Bu cihaz" };
}

function isStandaloneApp() {
  try {
    return Boolean(
      window.matchMedia?.("(display-mode: standalone)")?.matches
      || window.navigator?.standalone === true,
    );
  } catch { return false; }
}

export default function DisplaySettingsPanel({
  display,
  canInstallMainApp = false,
  onInstallMainApp,
  securityAppEligible = false,
  onOpenSecurityCenter,
  onClose,
}) {
  const orientation = display.viewport.width >= display.viewport.height ? "Yatay" : "Dikey";
  const detected = displayModeLabel(display.recommendedMode);
  const active = displayModeLabel(display.effectiveMode);
  const platform = detectPlatform();
  const standalone = isStandaloneApp();

  function openSecurityInstaller(target) {
    const url = new URL("https://app.kyerp.net/security/");
    url.searchParams.set("install", "1");
    url.searchParams.set("platform", target);
    window.open(url.toString(), "_blank", "noopener,noreferrer");
  }

  const mainInstallLabel = standalone
    ? "KY ERP bu cihazda yüklü"
    : canInstallMainApp
      ? `KY ERP'yi ${platform.label} cihazına kur`
      : platform.key === "ios"
        ? "iPhone / iPad kurulum adımı"
        : "Kurulum desteğini kontrol et";

  return (
    <div className="display-settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="display-settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Görünüm ve uygulamalar"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="display-settings-head">
          <div>
            <small>Ayarlar</small>
            <h2>Sistem <span>›</span> Görünüm & Uygulamalar</h2>
            <p>Ekran düzeni, cihaz görünümü ve KY ERP uygulama kurulumlarını tek merkezden yönetin.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Görünüm ve uygulamaları kapat"><X size={20} /></button>
        </header>

        <div className="display-settings-body">
          <section className="display-settings-section">
            <h3>Uygulamalar</h3>
            <div className="display-apps-grid">
              <article className="display-app-card primary">
                <div className="display-app-card-head">
                  <span className="display-app-icon"><Monitor size={22} /></span>
                  <div>
                    <small>ANA UYGULAMA</small>
                    <strong>KY ERP</strong>
                    <p>Muhasebe, İK, PDKS, üretim, mail ve yönetim merkezi.</p>
                  </div>
                </div>

                <div className="display-platform-badges">
                  <span>Windows / PC</span>
                  <span>Android</span>
                  <span>iPhone / iPad</span>
                  <span>Tablet</span>
                </div>

                <button
                  type="button"
                  className="display-app-install"
                  disabled={standalone || (!canInstallMainApp && platform.key !== "ios")}
                  onClick={() => {
                    if (platform.key === "ios" && !canInstallMainApp) return;
                    onInstallMainApp?.();
                  }}
                >
                  <Download size={17} />
                  {mainInstallLabel}
                </button>

                {platform.key === "ios" && !standalone ? (
                  <div className="display-install-note">
                    <strong>iPhone / iPad</strong>
                    <span>Safari → Paylaş → Ana Ekrana Ekle → Ekle. Apple, web uygulamalarında sessiz tek tuş kurulumuna izin vermez.</span>
                  </div>
                ) : null}

                {!standalone && !canInstallMainApp && platform.key !== "ios" ? (
                  <div className="display-install-note">
                    <strong>{platform.label}</strong>
                    <span>Chrome / Edge kurulum penceresi hazır olduğunda düğme otomatik aktif olur. Tarayıcı menüsündeki “Uygulamayı yükle” seçeneği de aynı KY ERP uygulamasını kurar.</span>
                  </div>
                ) : null}

                {standalone ? (
                  <div className="display-installed-state"><Check size={16} /> Bu cihaz KY ERP uygulama modunda çalışıyor.</div>
                ) : null}
              </article>

              {securityAppEligible ? (
              <article className="display-app-card security">
                <div className="display-app-card-head">
                  <span className="display-app-icon"><ShieldCheck size={22} /></span>
                  <div>
                    <small>GÜVENLİK UYGULAMASI</small>
                    <strong>KY ERP Güvenlik</strong>
                    <p>Güvenilir cihaz, giriş onayı, 6 haneli giriş kodu ve bağlantı yenileme.</p>
                  </div>
                </div>

                <div className="display-platform-badges">
                  <span>Android Telefon</span>
                  <span>Android Tablet</span>
                  <span>iPhone</span>
                  <span>iPad</span>
                </div>

                <div className="display-security-install-actions">
                  <button type="button" onClick={() => openSecurityInstaller("android")}>
                    <Download size={16} /> Android için indir / kur
                  </button>
                  <button type="button" onClick={() => openSecurityInstaller("ios")}>
                    <Smartphone size={16} /> iPhone / iPad için kur
                  </button>
                </div>

                <button type="button" className="display-security-center" onClick={onOpenSecurityCenter}>
                  <ShieldCheck size={16} />
                  Telefon Onayı & Güvenilir Cihaz Merkezi
                  <ExternalLink size={14} />
                </button>
              </article>
              ) : null}
            </div>

            <div className="display-apps-footnote">
              <strong>Tek uygulama merkezi:</strong>
              <span>Yeni Windows masaüstü paketi, Android paketi veya başka platform çıkarsa indirme seçeneği bu bölüme eklenecek; kullanıcı farklı menülerde aramayacak.</span>
            </div>
          </section>

          <section className="display-settings-section">
            <h3>Görünüm modu</h3>
            <div className="display-mode-grid">
              {MODE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = display.preferences.mode === option.value;
                return (
                  <button
                    type="button"
                    key={option.value}
                    className={selected ? "selected" : ""}
                    onClick={() => display.setMode(option.value)}
                  >
                    <Icon size={20} />
                    <span><strong>{option.label}</strong><small>{option.description}</small></span>
                    {selected ? <Check size={18} /> : null}
                  </button>
                );
              })}
            </div>
            <div className="display-settings-detected">
              Algılanan cihaz: <strong>{detected}</strong>
              <span>•</span>
              Aktif düzen: <strong>{active}</strong>
              <span>•</span>
              Platform: <strong>{platform.label}</strong>
            </div>
          </section>

          <section className="display-settings-section">
            <h3>Ölçek ve düzen</h3>

            <SettingRow
              icon={Settings2}
              title="Ölçek"
              description="Metin, menü, kart ve çalışma alanı boyutunu değiştirir."
            >
              <select
                value={String(display.preferences.scale)}
                onChange={(event) => display.setScale(event.target.value === "auto" ? "auto" : Number(event.target.value))}
              >
                {SCALE_OPTIONS.map((scale) => (
                  <option key={scale} value={scale}>
                    {scale === "auto"
                      ? `${display.recommendedScale}% (Önerilen / Otomatik)`
                      : `${scale}%`}
                  </option>
                ))}
              </select>
            </SettingRow>

            <SettingRow
              icon={Monitor}
              title="Ekran çözünürlüğü"
              description="Tarayıcı tarafından algılanan fiziksel ekran çözünürlüğü."
            >
              <span className="display-settings-value">
                {display.physicalWidth} × {display.physicalHeight}
              </span>
            </SettingRow>

            <SettingRow
              icon={Tablet}
              title="Uygulama alanı"
              description="KY ERP'nin o anda kullanabildiği görünür çalışma alanı."
            >
              <span className="display-settings-value">
                {Math.round(display.viewport.width)} × {Math.round(display.viewport.height)}
              </span>
            </SettingRow>

            <SettingRow
              icon={Smartphone}
              title="Ekran yönü"
              description="Cihaz döndürüldüğünde otomatik yeniden düzenlenir."
            >
              <span className="display-settings-value">{orientation}</span>
            </SettingRow>
          </section>

          <section className="display-settings-section compact">
            <h3>Geçerli ayar</h3>
            <div className="display-settings-summary">
              <div><span>Görünüm</span><strong>{active}</strong></div>
              <div><span>Ölçek</span><strong>{display.effectiveScale}%</strong></div>
              <div><span>Yön</span><strong>{orientation}</strong></div>
            </div>
          </section>
        </div>

        <footer className="display-settings-footer">
          <button type="button" className="reset" onClick={display.reset}>
            <RotateCcw size={16} /> Önerilen ayarlara dön
          </button>
          <button type="button" className="done" onClick={onClose}>Tamam</button>
        </footer>
      </section>
    </div>
  );
}
