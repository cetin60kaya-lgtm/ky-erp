import {
  MODULES as BASE_MODULES,
  MODULE_ROUTE_ALIASES as BASE_ROUTE_ALIASES,
} from "./moduleRegistryBase";

const DEPOLAMA_MODULE = {
  key: "depolama",
  permissionKey: "STORAGE_ADMIN",
  label: "Bağlantılar & Depolama",
  icon: "dosya",
  groups: [
    {
      label: "Bağlantılar",
      tabs: [
        ["depolama-genel", "Genel Bakış", "dashboard"],
        ["depolama-kaynaklar", "Dosya Servisleri", "dosya"],
        ["depolama-mail", "E-posta Hesapları", "eposta"],
        ["depolama-atamalar", "Bölüm / Dosya Atamaları", "file-check"],
      ],
    },
    {
      label: "Dosya Sistemi",
      tabs: [
        ["depolama-dosyalar", "Dosya İndeksi", "dosya"],
        ["depolama-senkronizasyon", "Senkronizasyon & Agent", "ayarlar"],
        ["depolama-yedekleme", "Yedekleme & Loglar", "raporlar"],
      ],
    },
  ],
};

const ILETISIM_MODULE = {
  key: "iletisim",
  permissionKey: "MAIL",
  label: "Mail & Dosyalar",
  icon: "eposta",
  groups: [
    {
      label: "Mail",
      tabs: [
        ["mail-gelen", "Gelen Kutusu", "eposta"],
        ["mail-gonderilen", "Gönderilenler", "eposta"],
        ["mail-taslaklar", "Taslaklar", "dosya"],
        ["mail-yanit-bekleyen", "Yanıt Bekleyenler", "file-check"],
        ["mail-sablonlar", "Şablonlar", "dosya"],
      ],
    },
    {
      label: "Dosyalar",
      tabs: [
        ["drive-dosyalar", "Dosyalar", "dosya"],
        ["drive-son-kullanilanlar", "Son Kullanılanlar", "takvim"],
        ["drive-firma-dosyalari", "Firma Dosyaları", "dosya"],
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
  const newKeys = new Set([
    "e-belge-genel", "e-belge-gelen-faturalar", "e-belge-giden-faturalar",
    "e-belge-gelen-irsaliyeler", "e-belge-giden-irsaliyeler", "e-belge-yukleme",
    "e-belge-eslestirmeler", "e-belge-onay-sorunlar", "e-belge-entegrasyonlar", "e-belge-gecmis",
  ]);
  const legacyTabs = [
    ...(module.groups || []).flatMap((group) => group.tabs || []),
    ...(module.hiddenTabs || []),
  ]
    .filter(([key]) => !newKeys.has(key))
    .filter(([key], index, rows) => rows.findIndex(([otherKey]) => otherKey === key) === index);
  return {
    ...module,
    label: "e-Belge Merkezi",
    icon: "dosya",
    groups: [
      { label: "Belge Yönetimi", tabs: [
        ["e-belge-genel", "Genel Bakış", "dashboard"],
        ["e-belge-gelen-faturalar", "Gelen Faturalar", "dosya"],
        ["e-belge-giden-faturalar", "Giden Faturalar", "dosya"],
        ["e-belge-gelen-irsaliyeler", "Gelen İrsaliyeler", "dosya"],
        ["e-belge-giden-irsaliyeler", "Giden İrsaliyeler", "dosya"],
        ["e-belge-yukleme", "Belge Havuzu / Yükleme", "file-check"],
      ]},
      { label: "Kontrol", tabs: [
        ["e-belge-eslestirmeler", "Eşleştirmeler", "baglanti"],
        ["e-belge-onay-sorunlar", "Onay / Sorunlar", "uyari"],
      ]},
      { label: "Sistem", tabs: [
        ["e-belge-entegrasyonlar", "Entegrasyonlar", "ayarlar"],
        ["e-belge-gecmis", "Geçmiş / Arşiv", "raporlar"],
      ]},
    ],
    hiddenTabs: legacyTabs,
  };
}

const baseModules = BASE_MODULES
  .map(withoutStorageDuplicates)
  .map(withCompanyBilling)
  .map(withEBelgeNavigation);
const eBelgeModule = baseModules.find((module) => module.key === "isnet");
const modulesWithoutEBelge = baseModules.filter((module) => module.key !== "isnet");
const adminIndex = modulesWithoutEBelge.findIndex((module) => module.key === "admin");
export const MODULES = adminIndex >= 0
  ? [
      ...modulesWithoutEBelge.slice(0, adminIndex),
      ...(eBelgeModule ? [eBelgeModule] : []),
      ILETISIM_MODULE,
      DEPOLAMA_MODULE,
      ...modulesWithoutEBelge.slice(adminIndex),
    ]
  : [...modulesWithoutEBelge, ...(eBelgeModule ? [eBelgeModule] : []), ILETISIM_MODULE, DEPOLAMA_MODULE];

export const MODULE_ROUTE_ALIASES = {
  ...BASE_ROUTE_ALIASES,
  muhasebe: {
    ...(BASE_ROUTE_ALIASES.muhasebe || {}),
  },
  admin: {
    ...(BASE_ROUTE_ALIASES.admin || {}),
    "giris-onay": "admin-yonetim-ozeti",
    onaylar: "admin-yonetim-ozeti",
    "bekleyen-girisler": "admin-yonetim-ozeti",
    "giris-onaylari": "admin-yonetim-ozeti",
  },
  isnet: {
    ...(BASE_ROUTE_ALIASES.isnet || {}),
    "e-belge": "e-belge-genel",
    "e-belge-merkezi": "e-belge-genel",
    "belge-merkezi": "e-belge-genel",
    "e-fatura": "e-belge-gelen-faturalar",
    "e-irsaliye": "e-belge-gelen-irsaliyeler",
  },
  iletisim: {
    mail: "mail-gelen",
    gelen: "mail-gelen",
    gonderilen: "mail-gonderilen",
    taslaklar: "mail-taslaklar",
    "yanit-bekleyen": "mail-yanit-bekleyen",
    sablonlar: "mail-sablonlar",
    drive: "drive-dosyalar",
    dosyalar: "drive-dosyalar",
    "son-kullanilanlar": "drive-son-kullanilanlar",
    "firma-dosyalari": "drive-firma-dosyalari",
  },
  depolama: {
    genel: "depolama-genel",
    baglantilar: "depolama-kaynaklar",
    servisler: "depolama-kaynaklar",
    kaynaklar: "depolama-kaynaklar",
    mail: "depolama-mail",
    email: "depolama-mail",
    eposta: "depolama-mail",
    mailhesaplari: "depolama-mail",
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
