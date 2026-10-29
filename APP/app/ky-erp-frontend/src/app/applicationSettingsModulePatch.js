import { MODULES } from "./moduleRegistry";

const APPLICATION_SETTINGS_TAB = ["uygulama-ayarlari", "Uygulama Ayarları", "ayarlar"];

// Uygulama Ayarları, Platform Yönetimi > Sistem > Uygulama içindedir.
// Eski oturumdan kalmış çift sol menü girişini temizle; gizli rota korunur.
export function syncApplicationSettingsTabForUser() {
  const adminModule = MODULES.find((module) => module.key === "admin");
  const group = adminModule?.groups?.find((item) => item.label === "Platform Yönetimi");
  if (!group || !Array.isArray(group.tabs)) return;
  if (group.tabs.some(([key]) => key === APPLICATION_SETTINGS_TAB[0])) {
    group.tabs = group.tabs.filter(([key]) => key !== APPLICATION_SETTINGS_TAB[0]);
  }
}

export { APPLICATION_SETTINGS_TAB };
