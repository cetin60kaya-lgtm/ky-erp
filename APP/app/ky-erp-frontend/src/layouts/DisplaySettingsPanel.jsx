import {
  Check,
  Monitor,
  RotateCcw,
  Settings2,
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

export default function DisplaySettingsPanel({ display, onClose }) {
  const orientation = display.viewport.width >= display.viewport.height ? "Yatay" : "Dikey";
  const detected = displayModeLabel(display.recommendedMode);
  const active = displayModeLabel(display.effectiveMode);

  return (
    <div className="display-settings-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="display-settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Ekran ayarları"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="display-settings-head">
          <div>
            <small>Ayarlar</small>
            <h2>Sistem <span>›</span> Ekran</h2>
            <p>KY ERP görünümünü Windows ekran ayarları mantığıyla otomatik veya manuel yönetin.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Ekran ayarlarını kapat"><X size={20} /></button>
        </header>

        <div className="display-settings-body">
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
                      ? \`\${display.recommendedScale}% (Önerilen / Otomatik)\`
                      : \`\${scale}%\`}
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
