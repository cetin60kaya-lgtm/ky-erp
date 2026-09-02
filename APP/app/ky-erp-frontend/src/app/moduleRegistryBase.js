import {
  MODULES as CORE_MODULES,
  MODULE_ROUTE_ALIASES as CORE_ROUTE_ALIASES,
} from "./moduleRegistryBaseCore";

function withCompanyBilling(module) {
  if (module.key !== "admin") return module;
  const groups = (module.groups || []).map((group) => ({ ...group, tabs: [...(group.tabs || [])] }));
  const system = groups.find((group) => group.label === "Sistem Yönetimi") || groups[0];
  if (system && !system.tabs.some(([key]) => key === "firma-ucretlendirme")) {
    const companyIndex = system.tabs.findIndex(([key]) => key === "ana-firma-ayarlar");
    system.tabs.splice(companyIndex >= 0 ? companyIndex + 1 : system.tabs.length, 0,
      ["firma-ucretlendirme", "Firma Paket / Kullanım", "odemeler"]);
  }
  return { ...module, groups };
}

export const MODULES = CORE_MODULES.map(withCompanyBilling);
export const MODULE_ROUTE_ALIASES = {
  ...CORE_ROUTE_ALIASES,
  admin: {
    ...(CORE_ROUTE_ALIASES.admin || {}),
    "firma-paket": "firma-ucretlendirme",
    "firma-kullanim": "firma-ucretlendirme",
    "ucretlendirme": "firma-ucretlendirme",
    "token-kullanim": "firma-ucretlendirme",
  },
};

export const MUHASEBE_ROUTE_ALIASES = MODULE_ROUTE_ALIASES.muhasebe;
export const URETIM_ROUTE_ALIASES = MODULE_ROUTE_ALIASES.uretim;

export function normalizeModuleTabKey(module, tabKey) {
  const rawKey = String(tabKey || "").trim();
  if (!rawKey) return rawKey;
  return MODULE_ROUTE_ALIASES[module?.key]?.[rawKey] || rawKey;
}

export function getModuleGroups(module) {
  if (!module) return [];
  if (Array.isArray(module.groups) && module.groups.length) return module.groups;
  if (Array.isArray(module.tabs) && module.tabs.length) return [{ label: "", tabs: module.tabs }];
  return [];
}
export function getVisibleModuleTabs(module) { return getModuleGroups(module).flatMap((group) => group.tabs || []); }
export function getModuleTabs(module) { return module ? [...getVisibleModuleTabs(module), ...(module.hiddenTabs || [])] : []; }
export function getDefaultTabKey(module) { return getVisibleModuleTabs(module)[0]?.[0] || ""; }
export function findModule(moduleKey) { return MODULES.find((module) => module.key === moduleKey) || null; }
export function findTab(module, tabKey) {
  const normalizedTabKey = normalizeModuleTabKey(module, tabKey);
  return getModuleTabs(module).find(([key]) => key === normalizedTabKey) || null;
}
export function getInitialRoute(pathname) {
  const resolvedPathname = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  const [requestedModuleKey, requestedTabKey] = resolvedPathname.split("/").filter(Boolean);
  const module = findModule(requestedModuleKey) || MODULES[0];
  const normalizedTabKey = normalizeModuleTabKey(module, requestedTabKey);
  const tab = findTab(module, normalizedTabKey);
  return { moduleKey: module.key, tabKey: tab?.[0] || getDefaultTabKey(module) };
}
