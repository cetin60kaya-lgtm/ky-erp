import {
  MODULES as BASE_MODULES,
  MODULE_ROUTE_ALIASES as BASE_ROUTE_ALIASES,
} from "./moduleRegistryBase";

const DEPOLAMA_MODULE = {
  key: "depolama",
  permissionKey: "ADMIN",
  label: "Depolama",
  icon: "dosya",
  groups: [
    {
      label: "Depolama Merkezi",
      tabs: [
        ["depolama-genel", "Genel Bakış", "dashboard"],
        ["depolama-kaynaklar", "Bağlantılar", "dosya"],
        ["depolama-atamalar", "Bölüm / Dosya Atamaları", "file-check"],
      ],
    },
    {
      label: "Dosya ve Senkronizasyon",
      tabs: [
        ["depolama-dosyalar", "Dosya İndeksi", "dosya"],
        ["depolama-senkronizasyon", "Senkronizasyon / Agent", "ayarlar"],
        ["depolama-yedekleme", "Yedekleme / Loglar", "raporlar"],
      ],
    },
  ],
};

const adminIndex = BASE_MODULES.findIndex((module) => module.key === "admin");
export const MODULES = adminIndex >= 0
  ? [
      ...BASE_MODULES.slice(0, adminIndex),
      DEPOLAMA_MODULE,
      ...BASE_MODULES.slice(adminIndex),
    ]
  : [...BASE_MODULES, DEPOLAMA_MODULE];

export const MODULE_ROUTE_ALIASES = {
  ...BASE_ROUTE_ALIASES,
  depolama: {
    genel: "depolama-genel",
    baglantilar: "depolama-kaynaklar",
    kaynaklar: "depolama-kaynaklar",
    atamalar: "depolama-atamalar",
    yonlendirmeler: "depolama-atamalar",
    dosyalar: "depolama-dosyalar",
    senkronizasyon: "depolama-senkronizasyon",
    agent: "depolama-senkronizasyon",
    yedekleme: "depolama-yedekleme",
    loglar: "depolama-yedekleme",
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
  if (Array.isArray(module.tabs) && module.tabs.length) {
    return [{ label: "", tabs: module.tabs }];
  }
  return [];
}

export function getVisibleModuleTabs(module) {
  return getModuleGroups(module).flatMap((group) => group.tabs || []);
}

export function getModuleTabs(module) {
  if (!module) return [];
  return [...getVisibleModuleTabs(module), ...(module.hiddenTabs || [])];
}

export function getDefaultTabKey(module) {
  return getVisibleModuleTabs(module)[0]?.[0] || "";
}

export function findModule(moduleKey) {
  return MODULES.find((module) => module.key === moduleKey) || null;
}

export function findTab(module, tabKey) {
  const normalizedTabKey = normalizeModuleTabKey(module, tabKey);
  return getModuleTabs(module).find(([key]) => key === normalizedTabKey) || null;
}

export function getInitialRoute(pathname) {
  const resolvedPathname =
    pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "/");
  const [requestedModuleKey, requestedTabKey] = resolvedPathname
    .split("/")
    .filter(Boolean);
  const module = findModule(requestedModuleKey) || MODULES[0];
  const normalizedTabKey = normalizeModuleTabKey(module, requestedTabKey);
  const tab = findTab(module, normalizedTabKey);
  return {
    moduleKey: module.key,
    tabKey: tab?.[0] || getDefaultTabKey(module),
  };
}
