import { MODULES } from "./moduleRegistry";

const APPLICATION_SETTINGS_TAB = ["uygulama-ayarlari", "Uygulama Ayarları", "ayarlar"];

function canonicalRole(value) {
  return String(value || "").trim().toUpperCase().replace(/İ/g, "I");
}

function isOwner(user) {
  return ["SUPER_ADMIN", "ADMIN"].includes(canonicalRole(user?.role));
}

export function syncApplicationSettingsTabForUser(user) {
  const adminModule = MODULES.find((module) => module.key === "admin");
  if (!adminModule?.groups?.length) return;

  const group = adminModule.groups.find((item) => item.label === "Platform Yönetimi") || adminModule.groups[0];
  if (!group) return;

  const currentTabs = Array.isArray(group.tabs) ? group.tabs : [];
  const cleanTabs = currentTabs.filter(([key]) => key !== APPLICATION_SETTINGS_TAB[0]);

  if (!isOwner(user)) {
    if (cleanTabs.length !== currentTabs.length) group.tabs = cleanTabs;
    return;
  }

  const companyIndex = cleanTabs.findIndex(([key]) => key === "ana-firma-ayarlar");
  const billingIndex = cleanTabs.findIndex(([key]) => key === "firma-ucretlendirme");
  const insertIndex = billingIndex >= 0 ? billingIndex + 1 : companyIndex >= 0 ? companyIndex + 1 : cleanTabs.length;
  group.tabs = [
    ...cleanTabs.slice(0, insertIndex),
    APPLICATION_SETTINGS_TAB,
    ...cleanTabs.slice(insertIndex),
  ];
}

export { APPLICATION_SETTINGS_TAB };
