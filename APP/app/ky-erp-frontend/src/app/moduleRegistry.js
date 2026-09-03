import {
  MODULES as BASE_MODULES,
  MODULE_ROUTE_ALIASES as BASE_ROUTE_ALIASES,
} from "./moduleRegistryBase";

const DEPOLAMA_MODULE = {
  key: "depolama",
  permissionKey: "STORAGE_ADMIN",
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

function withoutStorageDuplicates(module) {
  if (module.key !== "admin") return module;
  const storageKeys = new Set(["dosya-klasor-yonetimi", "yedekleme-loglar"]);
  const hidden = [...(module.hiddenTabs || [])];
  for (const group of module.groups || []) {
    for (const tab of group.tabs || []) {
      if (storageKeys.has(tab[0]) && !hidden.some((row) => row[0] === tab[0])) hidden.push(tab);
    }
  }
  return {
    ...module,
    groups: (module.groups || [])
      .map((group) => ({ ...group, tabs: (group.tabs || []).filter(([key]) => !storageKeys.has(key)) }))
      .filter((group) => group.tabs.length),
    hiddenTabs: hidden,
  };
}

function withCompanyBilling(module) {
  if (module.key !== "admin") return module;
  const billingTab = ["firma-ucretlendirme", "Firma Paket / Kullanım", "odemeler"];
  if ((module.groups || []).some((group) => (group.tabs || []).some(([key]) => key === billingTab[0]))) return module;
  const groups = (module.groups || []).map((group, groupIndex) => {
    if (groupIndex !== 0) return group;
    const tabs = [...(group.tabs || [])];
    const companyIndex = tabs.findIndex(([key]) => key === "ana-firma-ayarlar");
    tabs.splice(companyIndex >= 0 ? companyIndex + 1 : tabs.length, 0, billingTab);
    return { ...group, tabs };
  });
  return { ...module, groups };
}

function withEBelgeNavigation(module) {
  if (module.key !== "isnet") return module;
  const legacyTabs = [
    ...(module.groups || []).flatMap((group) => group.tabs || []),
    ...(module.hiddenTabs || []),
  ].filter(([key], index, rows) => rows.findIndex(([otherKey]) => otherKey === key) === index);
  return {
    ...module,
    label: "e-Belge Merkezi",
    icon: "dosya",
    groups: [
      {
        label: "e-Belge Merkezi",
        tabs: [["e-belge-merkezi", "e-Belge Merkezi", "dosya"]],
      },
    ],
    hiddenTabs: legacyTabs,
  };
}

const baseModules = BASE_MODULES
  .map(withoutStorageDuplicates)
  .map(withCompanyBilling)
  .map(withEBelgeNavigation);
const adminIndex = baseModules.findIndex((module) => module.key === "admin");
export const MODULES = adminIndex >= 0
  ? [
      ...baseModules.slice(0, adminIndex),
      DEPOLAMA_MODULE,
      ...baseModules.slice(adminIndex),
    ]
  : [...baseModules, DEPOLAMA_MODULE];

export const MODULE_ROUTE_ALIASES = {
  ...BASE_ROUTE_ALIASES,
  muhasebe: {
    ...(BASE_ROUTE_ALIASES.muhasebe || {}),
  },
  isnet: {
    ...(BASE_ROUTE_ALIASES.isnet || {}),
    "e-belge": "e-belge-merkezi",
    "belge-merkezi": "e-belge-merkezi",
    "e-fatura": "e-belge-merkezi",
    "e-irsaliye": "e-belge-merkezi",
  },
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
  const resolvedPathname = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");
  const [requestedModuleKey, requestedTabKey] = resolvedPathname.split("/").filter(Boolean);
  const module = findModule(requestedModuleKey) || MODULES[0];
  const normalizedTabKey = normalizeModuleTabKey(module, requestedTabKey);
  const tab = findTab(module, normalizedTabKey);
  return { moduleKey: module.key, tabKey: tab?.[0] || getDefaultTabKey(module) };
}
