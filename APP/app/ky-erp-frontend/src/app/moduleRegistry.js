import {
  MODULES as BASE_MODULES,
  MODULE_ROUTE_ALIASES as BASE_ROUTE_ALIASES,
} from "./moduleRegistryBase";

const PDKS_MODULE = {
  key: "pdks",
  permissionKey: "PDKS",
  label: "PDKS",
  icon: "pdks",
  sidebarGroups: [
    ["ana-ekran", "Günlük", "dashboard", "Kart, giriş/çıkış ve puantaj"],
    ["personel-bilgileri", "Personel & İK", "users", "Personel, izin ve çalışma bağlantısı"],
    ["gruplar-vardiyalar", "Tanımlar", "ayarlar", "Vardiya ve çalışma kuralları"],
    ["saat-terminal", "Terminal & Sistem", "ayarlar", "Cihaz, saat ve senkron yönetimi"],
    ["raporlar", "Rapor & Denetim", "raporlar", "Raporlar ve yıllık denetim paketi"],
  ],
  groups: [
    {
      label: "Günlük",
      tabs: [
        ["ana-ekran", "Canlı Geçişler", "dashboard"],
        ["bilgi-aktar", "Kart / Terminal Aktarımı", "dosya"],
        ["giris-cikislar", "Giriş / Çıkışlar", "takvim"],
        ["puantaj", "Puantaj", "takvim"],
        ["puantaj-sonuclari", "Puantaj Sonuçları", "raporlar"],
      ],
    },
    {
      label: "Personel & İK",
      tabs: [
        ["personel-bilgileri", "Personel (İK Kaynağı)", "users"],
        ["izinler", "İzinler", "takvim"],
        ["calisma-tarihi", "Çalışma Tarihi", "takvim"],
      ],
    },
    {
      label: "Tanımlar",
      tabs: [
        ["gruplar-vardiyalar", "Gruplar / Vardiyalar", "ayarlar"],
        ["puantaj-kurallari", "Puantaj Kuralları", "ayarlar"],
        ["donemler", "Dönemler / Kapanış", "takvim"],
        ["servisler", "Servisler", "users"],
        ["tatiller", "Resmî Tatil Takvimi", "takvim"],
      ],
    },
    {
      label: "Terminal & Sistem",
      tabs: [
        ["saat-terminal", "Saat / Terminal", "ayarlar"],
        ["cihaz-baglantilari", "Cihaz Bağlantıları", "ayarlar"],
        ["senkron", "Senkronizasyon", "sync"],
      ],
    },
    {
      label: "Rapor & Denetim",
      tabs: [
        ["raporlar", "Raporlar", "raporlar"],
        ["denetim-yillik-temp", "Yıllık TEMP / Denetim", "file-check"],
      ],
    },
  ],
  hiddenTabs: [
    ["kullanicilar", "Kullanıcı Yetkileri (Yönetim)", "users"],
    ["bolumler", "Bölümler (İK ana kaynak)", "users"],
    ["gorevler", "Görevler (İK ana kaynak)", "users"],
    ["durumlar", "Durumlar (İK ana kaynak)", "file-check"],
    ["firmalar", "Firmalar (Yönetim ana kaynak)", "firma-kartlari"],
  ],
};

const DEPOLAMA_MODULE = {
  key: "depolama",
  permissionKey: "STORAGE_ADMIN",
  label: "Bağlantılar",
  icon: "depolama",
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
        ["mail-sabitlenen", "Sabitlenenler", "file-check"],
        ["mail-gonderilen", "Gönderilmiş Postalar", "eposta"],
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

const COMPLIANCE_MODULE = {
  key: "compliance",
  permissionKey: "COMPLIANCE",
  label: "Denetim",
  icon: "file-check",
  groups: [
    {
      label: "Kontrol Merkezi",
      tabs: [
        ["denetim-genel", "Genel Bakış", "dashboard"],
        ["denetim-evraklar", "Evrak Takip", "dosya"],
        ["denetim-takvim", "Süre & Takvim", "takvim"],
        ["denetim-capa", "Düzeltici Faaliyet / CAPA", "uyari"],
      ],
    },
    {
      label: "Standartlar",
      tabs: [
        ["denetim-standartlar", "Denetim Standartları", "file-check"],
        ["denetim-ayarlar", "Ayarlar & Özelleştirme", "ayarlar"],
      ],
    },
  ],
};

const DAILY_OPERATIONS_MODULE = {
  key: "gunluk-operasyon",
  permissionKey: "IK",
  label: "Günlük Operasyon",
  icon: "takvim",
  groups: [
    {
      label: "Günlük Operasyon",
      tabs: [
        ["daily-dashboard", "Ana Sayfa", "dashboard"],
        ["daily-entry", "Günlük Giriş", "takvim"],
        ["daily-cards", "Personel Kartları", "users"],
        ["daily-weekly", "Haftalık Özet", "raporlar"],
        ["daily-payments", "Ödemeler", "odemeler"],
      ],
    },
  ],
};

const SYSTEM_SENTINEL_MODULE = {
  key: "sistem-merkezi",
  permissionKey: "SYSTEM_SENTINEL",
  label: "Sistem Merkezi",
  icon: "guvenlik",
  groups: [{ label: "Sistem Kontrol", tabs: [["sistem-nobetcisi", "Sistem Nöbetçisi", "terminal"]] }],
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

function withOperationalGroups(module) {
  if (module.key === "muhasebe") {
    return {
      ...module,
      groups: [
        { label: "Özet & Cari", tabs: [["yonetim-ozeti", "Yönetim Özeti", "genel-bakis"], ["firma-kartlari", "Firmalar & Cari", "firma-kartlari"]] },
        { label: "Belge Akışı", tabs: [["tedarikci-faturalar", "Alış & Tedarikçi", "tedarikci-fatura"], ["musteri-belgeleri", "Satış & Müşteri", "file-check"]] },
        { label: "Finans & Kontrol", tabs: [["finans-islemleri", "Finans İşlemleri", "odemeler"], ["mail-ekstre", "Ekstre & Mail", "eposta"], ["mali-kontrol", "Mali Kontrol & Raporlar", "raporlar"]] },
      ],
    };
  }
  if (module.key === "e-belge") {
    return {
      ...module,
      label: "e-Belge",
      groups: [
        { label: "Operasyon", tabs: [["genel-bakis", "Genel Bakış", "dashboard"], ["gelen-belgeler", "Gelen Belgeler", "dosya"], ["giden-belgeler", "Giden Belgeler", "dosya"], ["belge-havuzu", "Belge Havuzu", "upload"]] },
        { label: "Kontrol & Eşleştirme", tabs: [["eslestirmeler", "Eşleştirmeler", "file-check"], ["onay-sorunlar", "Onay & Sorunlar", "uyari"], ["is-akislari", "İş Akışları", "file-check"]] },
        { label: "Arşiv & Sistem", tabs: [["arsiv-cikti", "Arşiv & Çıktı", "dosya"], ["entegrasyonlar", "Entegrasyonlar", "ayarlar"]] },
      ],
    };
  }
  if (module.key === "asistan") return { ...module, label: "Asistan" };
  return module;
}

const preparedBaseModules = BASE_MODULES
  .map(withoutStorageDuplicates)
  .map(withCompanyBilling)
  .map(withOperationalGroups);

const modulesByKey = new Map(preparedBaseModules.map((module) => [module.key, module]));
modulesByKey.set(PDKS_MODULE.key, PDKS_MODULE);
modulesByKey.set(DAILY_OPERATIONS_MODULE.key, DAILY_OPERATIONS_MODULE);
modulesByKey.set(ILETISIM_MODULE.key, ILETISIM_MODULE);
modulesByKey.set(COMPLIANCE_MODULE.key, COMPLIANCE_MODULE);
modulesByKey.set(DEPOLAMA_MODULE.key, DEPOLAMA_MODULE);
modulesByKey.set(SYSTEM_SENTINEL_MODULE.key, SYSTEM_SENTINEL_MODULE);

const CANONICAL_MODULE_ORDER = [
  "muhasebe",
  "e-belge",
  "ik",
  "gunluk-operasyon",
  "pdks",
  "desen",
  "boyahane",
  "uretim",
  "iletisim",
  "compliance",
  "depolama",
  "sistem-merkezi",
  "admin",
  "asistan",
];

export const MODULES = CANONICAL_MODULE_ORDER
  .map((key) => modulesByKey.get(key))
  .filter(Boolean);

export const MODULE_ROUTE_ALIASES = {
  ...BASE_ROUTE_ALIASES,
  muhasebe: {},
  "e-belge": {},
  "gunluk-operasyon": {
    "ana-sayfa": "daily-dashboard",
    "genel-bakis": "daily-dashboard",
    "dashboard": "daily-dashboard",
    "gunluk-giris": "daily-entry",
    "gunluk-personel-kartlari": "daily-cards",
    "personel-kartlari": "daily-cards",
    "haftalik-ozet": "daily-weekly",
    "gunluk-odeme-fisleri": "daily-payments",
    "odeme-fisleri": "daily-payments",
  },
  pdks: {
    "genel-bakis": "ana-ekran",
    "canli-gecisler": "ana-ekran",
    "bilgi-aktarimi": "bilgi-aktar",
    "giris-cikis": "giris-cikislar",
    personel: "personel-bilgileri",
    "personel-kartlari": "personel-bilgileri",
    "puantaj-sonuc": "puantaj-sonuclari",
    izin: "izinler",
    "ozel-izin": "izinler",
    "puantaj-bilgi": "puantaj-kurallari",
    puanbilgi: "puantaj-kurallari",
    gruplar: "gruplar-vardiyalar",
    vardiyalar: "gruplar-vardiyalar",
    "calisma-gruplari": "gruplar-vardiyalar",
    terminal: "saat-terminal",
    saat: "saat-terminal",
    cihazlar: "cihaz-baglantilari",
    sync: "senkron",
    denetim: "denetim-yillik-temp",
    temp: "denetim-yillik-temp",
  },
  admin: {
    ...(BASE_ROUTE_ALIASES.admin || {}),
    "giris-onay": "admin-yonetim-ozeti",
    onaylar: "admin-yonetim-ozeti",
    "bekleyen-girisler": "admin-yonetim-ozeti",
    "giris-onaylari": "admin-yonetim-ozeti",
  },
  iletisim: {
    mail: "mail-gelen",
    gelen: "mail-gelen",
    sabitlenen: "mail-sabitlenen",
    sabitler: "mail-sabitlenen",
    gonderilen: "mail-gonderilen",
    taslaklar: "mail-taslaklar",
    "yanit-bekleyen": "mail-yanit-bekleyen",
    sablonlar: "mail-sablonlar",
    drive: "drive-dosyalar",
    dosyalar: "drive-dosyalar",
    "son-kullanilanlar": "drive-son-kullanilanlar",
    "firma-dosyalari": "drive-firma-dosyalari",
  },
  compliance: {
    genel: "denetim-genel",
    evraklar: "denetim-evraklar",
    evrak: "denetim-evraklar",
    takvim: "denetim-takvim",
    capa: "denetim-capa",
    standartlar: "denetim-standartlar",
    ayarlar: "denetim-ayarlar",
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
  if (Array.isArray(module.tabs) && module.tabs.length) return [{ label: "", tabs: module.tabs }];
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
