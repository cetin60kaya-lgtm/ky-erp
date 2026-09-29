import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Plus, RotateCcw, Save, Search, Trash2 } from "lucide-react";
import { ErpIcon } from "../../components/erp/IconMap";
import { MODULES } from "../../app/moduleRegistry";
import { buildLeftClickActionCatalog } from "../../app/leftClickMenuCatalog";
import {
  DEFAULT_LEFT_CLICK_MENU_SETTINGS,
  loadLeftClickMenuSettings,
  normalizeLeftClickMenuSettings,
  resetLeftClickMenuSettings,
  saveLeftClickMenuSettings,
} from "../../services/applicationUiSettings";
import "./AdminApplicationSettings.css";

function normalizeSearch(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function AdminApplicationSettings() {
  const catalog = useMemo(() => buildLeftClickActionCatalog(MODULES), []);
  const catalogById = useMemo(() => new Map(catalog.map((item) => [item.id, item])), [catalog]);
  const [settings, setSettings] = useState(() => normalizeLeftClickMenuSettings(DEFAULT_LEFT_CLICK_MENU_SETTINGS));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Uygulama ayarları yükleniyor...");

  useEffect(() => {
    let alive = true;
    loadLeftClickMenuSettings()
      .then((value) => {
        if (!alive) return;
        setSettings(value);
        setMessage("Ayarlar güncel. Değişiklikleri düzenleyip kaydedebilirsiniz.");
      })
      .catch((error) => {
        if (!alive) return;
        setMessage(`Ayarlar alınamadı: ${error?.message || "Bilinmeyen hata"}`);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const selectedActions = useMemo(
    () => settings.items.map((id) => catalogById.get(id)).filter(Boolean),
    [catalogById, settings.items],
  );

  const availableActions = useMemo(() => {
    const selected = new Set(settings.items);
    const query = normalizeSearch(search);
    return catalog
      .filter((item) => !selected.has(item.id))
      .filter((item) => !query || normalizeSearch(`${item.label} ${item.description || ""} ${item.moduleLabel || ""}`).includes(query))
      .slice(0, 40);
  }, [catalog, search, settings.items]);

  function patch(next) {
    setSettings((current) => normalizeLeftClickMenuSettings({ ...current, ...next }));
  }

  function move(index, direction) {
    setSettings((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.items.length) return current;
      const items = [...current.items];
      [items[index], items[target]] = [items[target], items[index]];
      return { ...current, items };
    });
  }

  function remove(id) {
    setSettings((current) => ({ ...current, items: current.items.filter((item) => item !== id) }));
  }

  function add(id) {
    setSettings((current) => current.items.includes(id) ? current : { ...current, items: [...current.items, id] });
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage("Uygulama ayarları kaydediliyor...");
    try {
      const saved = await saveLeftClickMenuSettings(settings);
      setSettings(saved);
      setMessage("Sol tık menüsü tüm uygulama için kaydedildi ve bu oturumda hemen etkinleşti.");
    } catch (error) {
      setMessage(`Kaydedilemedi: ${error?.message || "Sunucu hatası"}`);
    } finally {
      setSaving(false);
    }
  }

  function restoreDefaults() {
    const defaults = resetLeftClickMenuSettings();
    setSettings(defaults);
    setMessage("Varsayılan düzen hazırlandı. Kalıcı olması için Kaydet'e basın.");
  }

  return (
    <div className="admin-app-settings">
      <header className="admin-app-settings-hero">
        <div>
          <span className="admin-app-settings-kicker">PLATFORM YÖNETİMİ / SÜPER YÖNETİCİ</span>
          <h1>Uygulama Ayarları</h1>
          <p>KY ERP genel arayüz davranışlarını tek yerden yönetin. İlk bölüm, uygulamanın her ekranında çalışan sol tık hızlı menüsüdür.</p>
        </div>
        <div className="admin-app-settings-actions">
          <button type="button" className="secondary" onClick={restoreDefaults} disabled={saving}><RotateCcw size={15} /> Varsayılan</button>
          <button type="button" className="primary" onClick={save} disabled={saving || loading}><Save size={15} /> {saving ? "Kaydediliyor" : "Kaydet"}</button>
        </div>
      </header>

      <div className={`admin-app-settings-status ${/kaydedilemedi|alınamadı/i.test(message) ? "error" : ""}`}>
        <Check size={15} /> <span>{message}</span>
      </div>

      <section className="admin-app-settings-card">
        <div className="admin-app-settings-card-head">
          <div>
            <h2>Sol Tık Hızlı Menüsü</h2>
            <p>Normal buton, giriş alanı ve linkler kendi görevini yapmaya devam eder. Menü yalnız uygun çalışma alanı tıklamasında açılır.</p>
          </div>
          <label className="app-setting-switch">
            <input type="checkbox" checked={settings.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />
            <span />
            <b>{settings.enabled ? "Aktif" : "Kapalı"}</b>
          </label>
        </div>

        <div className="admin-app-settings-options">
          <label><input type="checkbox" checked={settings.blankAreaOnly} onChange={(event) => patch({ blankAreaOnly: event.target.checked })} /><span><b>Sadece çalışma alanında aç</b><small>Üst bar, sekmeler ve sol menüde yanlışlıkla açılmaz.</small></span></label>
          <label><input type="checkbox" checked={settings.includeActiveModuleTabs} onChange={(event) => patch({ includeActiveModuleTabs: event.target.checked })} /><span><b>Aktif modül ekranlarını otomatik ekle</b><small>Açık modülün ilk ekranları menünün üstünde görünür.</small></span></label>
          <label><input type="checkbox" checked={settings.showIcons} onChange={(event) => patch({ showIcons: event.target.checked })} /><span><b>İkonları göster</b><small>İşlem ve ekran ikonları görünür.</small></span></label>
          <label><input type="checkbox" checked={settings.compact} onChange={(event) => patch({ compact: event.target.checked })} /><span><b>Kompakt görünüm</b><small>Daha kısa ve hızlı menü satırları kullanılır.</small></span></label>
          <label className="number-option"><span><b>Aktif modül ekranı</b><small>Otomatik gösterilecek ekran adedi</small></span><input type="number" min="1" max="8" value={settings.activeModuleTabLimit} onChange={(event) => patch({ activeModuleTabLimit: event.target.value })} /></label>
          <label className="number-option"><span><b>Toplam menü sınırı</b><small>Bir açılışta en fazla gösterilecek satır</small></span><input type="number" min="5" max="24" value={settings.maxItems} onChange={(event) => patch({ maxItems: event.target.value })} /></label>
        </div>
      </section>

      <div className="admin-app-settings-grid">
        <section className="admin-app-settings-card menu-order-card">
          <div className="admin-app-settings-card-head slim">
            <div><h2>Menü Sırası</h2><p>Buradaki sıra sabit işlemlerin gösterim sırasıdır.</p></div>
            <strong>{selectedActions.length} işlem</strong>
          </div>
          <div className="menu-order-list">
            {selectedActions.map((action, index) => (
              <div className="menu-order-row" key={action.id}>
                <i><ErpIcon name={action.icon || "hizli"} size={16} /></i>
                <span><b>{action.label}</b><small>{action.moduleLabel || action.description}</small></span>
                <div>
                  <button type="button" title="Yukarı" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
                  <button type="button" title="Aşağı" disabled={index === selectedActions.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
                  <button type="button" title="Çıkar" className="danger" onClick={() => remove(action.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
            {!selectedActions.length ? <div className="empty-state">Sabit işlem yok. Sağ taraftan ekleyebilirsiniz.</div> : null}
          </div>
        </section>

        <section className="admin-app-settings-card menu-catalog-card">
          <div className="admin-app-settings-card-head slim">
            <div><h2>İşlem / Ekran Ekle</h2><p>Genel işlemler veya KY ERP ekranlarından seçim yapın.</p></div>
          </div>
          <label className="menu-catalog-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="İşlem veya ekran ara..." /></label>
          <div className="menu-catalog-list">
            {availableActions.map((action) => (
              <button type="button" key={action.id} onClick={() => add(action.id)}>
                <i><ErpIcon name={action.icon || "hizli"} size={16} /></i>
                <span><b>{action.label}</b><small>{action.moduleLabel || action.description}</small></span>
                <Plus size={15} />
              </button>
            ))}
            {!availableActions.length ? <div className="empty-state">Aramaya uygun ek işlem bulunamadı.</div> : null}
          </div>
        </section>
      </div>

      <section className="admin-app-settings-card preview-card">
        <div className="admin-app-settings-card-head slim"><div><h2>Canlı Önizleme</h2><p>Kaydettiğinizde tüm ekranlarda aynı düzen kullanılır.</p></div></div>
        <div className={`left-click-preview ${settings.compact ? "compact" : ""}`}>
          <strong>Sol Tık Menüsü</strong>
          {selectedActions.slice(0, Math.min(settings.maxItems, 8)).map((action) => (
            <div key={action.id}>{settings.showIcons ? <ErpIcon name={action.icon || "hizli"} size={15} /> : null}<span>{action.label}</span></div>
          ))}
        </div>
      </section>
    </div>
  );
}
