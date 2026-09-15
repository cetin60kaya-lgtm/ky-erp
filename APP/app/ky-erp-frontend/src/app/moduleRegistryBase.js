export const MODULES = [
  {
    key: "muhasebe",
    permissionKey: "MUHASEBE",
    label: "Muhasebe",
    icon: "muhasebe",
    groups: [
      {
        label: "Muhasebe",
        tabs: [
          ["yonetim-ozeti", "Yönetim Özeti", "genel-bakis"],
          ["firma-kartlari", "Firmalar / Cari / Çek", "firma-kartlari"],
          ["tedarikci-faturalar", "Tedarikçi Belgeleri", "tedarikci-fatura"],
          ["musteri-belgeleri", "Müşteri Belgeleri", "file-check"],
          ["mail-ekstre", "Ekstre ve Mail", "eposta"],
          ["mali-kontrol", "Mali Kontrol & Raporlar", "raporlar"],
        ],
      },
    ],
  },
  {
    key: "isnet",    permissionKey: "ISNET",
    label: "İşNet",
    icon: "e-belge",
    groups: [
      {
        label: "Yönetim",
        tabs: [["yonetim-merkezi", "Yönetim Merkezi", "dashboard"]],
      },
      {
        label: "Belge İşlemleri",
        tabs: [
          ["belge-akisi", "Belge ve İş Akışları", "dosya"],
          ["irsaliyeden-faturaya", "Müşteri İş Akışı", "file-check"],
        ],
      },
      {
        label: "Arşiv ve Gönderim",
        tabs: [
          ["kesilen-belgeler", "Belge Arşivi", "dosya"],
          ["cikti-kuyrugu", "Çıktı ve Mail", "eposta"],
        ],
      },
      {
        label: "Sistem",
        tabs: [["ayarlar", "Ayarlar ve Bağlantı", "ayarlar"]],
      },
    ],
    hiddenTabs: [
      ["gelen-irsaliyeler", "Gelen İrsaliyeler", "dosya"],
      ["giden-irsaliyeler", "Giden İrsaliyeler", "dosya"],
      ["gelen-faturalar", "Gelen Faturalar", "dosya"],
      ["giden-faturalar", "Giden Faturalar", "dosya"],
      ["yeni-irsaliye", "Yeni İrsaliye", "file-check"],
      ["mail-merkezi", "Mail Merkezi", "eposta"],
    ],
  },
  {
    key: "desen",
    permissionKey: "DESEN",
    label: "Desen",
    icon: "desen",
    groups: [
      {
        label: "Desen İşlemleri",
        tabs: [
          ["gelen-desenler", "Gelen Desenler", "dashboard"],
          ["desen-modeller", "Desen Havuzu", "dosya"],
          ["desen-yerlesim-is-akisi", "Yerleşim / Kalıp", "file-check"],
        ],
      },
      {
        label: "Rapor",
        tabs: [["desen-raporlari", "Desen Raporları", "raporlar"]],
      },
    ],
  },
  {
    key: "boyahane",
    permissionKey: "BOYAHANE",
    label: "Boyahane",
    icon: "boyahane",
    groups: [
      { label: "Günlük İş", tabs: [["is-akisi", "Ana Ekran", "dashboard"], ["uretim-gecmisi", "İmalat Boyaları", "imalat"]] },
      { label: "Renk & Reçete", tabs: [["receteler", "Numune Çalışmaları", "renk"], ["kayitli-renkler", "Kayıtlı Renkler", "renk"]] },
      { label: "Stok & Lot", tabs: [["urun-lotlar", "Stok, Lot ve Ürünler", "urunler"]] },
      { label: "Rapor & Kayıt", tabs: [["raporlar", "Raporlar ve İşlem Logları", "raporlar"]] },
    ],
  },
  {
    key: "gunluk-operasyon",
    permissionKey: "GUNLUK_OPERASYON",
    label: "Günlük Operasyon",
    icon: "operasyon",
    groups: [
      { label: "Operasyon", tabs: [["ana-ekran", "Ana Ekran", "dashboard"], ["gunluk-giris", "Günlük Giriş", "operasyon"]] },
      { label: "Personel & Ödeme", tabs: [["personel-kartlari", "Personel Kartları", "users"], ["odeme-fisleri", "Ödeme Fişleri", "odemeler"]] },
    ],
  },
  {
    key: "ik",
    permissionKey: "IK",
    label: "İK",
    icon: "ik",
    groups: [
      { label: "Personel", tabs: [["ozet", "İK Özet", "dashboard"], ["personel-kartlari", "Personel Kartları", "users"]] },
      { label: "Ücret & İzin", tabs: [["ucret-odeme-plani", "Maaş / Yol / Banka / Elden", "odemeler"], ["mesai-avans", "Mesai / Avans / Kesinti", "takvim"], ["yillik-izin", "Yıllık İzin / İzin Sicili", "takvim"], ["bordro-odeme", "Bordro & Ödeme", "odemeler"]] },
      { label: "Evrak & Kapanış", tabs: [["sgk-evrak-kontrol", "SGK / Evrak / Ay Sonu", "file-check"]] },
    ],
    hiddenTabs: [
      ["denetim-raporu", "Denetim Raporları", "raporlar"],
    ],
  },
  {
    key: "uretim",
    permissionKey: "IMALAT",
    label: "İmalat",
    icon: "imalat",
    groups: [
      { label: "Üretim", tabs: [["uretim-merkezi", "Model ve Üretim Kontrol Merkezi", "imalat"]] },
      { label: "Rapor", tabs: [["uretim-raporlari", "Üretim Raporları", "raporlar"]] },
      { label: "Makine & Vardiya", tabs: [["uretim-ayarlari", "Makine ve Vardiya Ayarları", "ayarlar"]] },
    ],
  },
  {
    key: "admin",
    permissionKey: "ADMIN",
    label: "Platform Yönetimi",
    icon: "guvenlik",
    groups: [
      {
        label: "Platform Yönetimi",
        tabs: [
          ["admin-yonetim-ozeti", "Yönetim Konsolu", "dashboard"],
          ["uygulama-sahibi", "Süper Yönetici & Güvenlik", "ayarlar"],
          ["kullanicilar", "Kullanıcı & Yetkiler", "users"],
          ["ana-firma-ayarlar", "Firmalar & Organizasyon", "ayarlar"],
        ],
      },
      {
        label: "Dosya ve Güvenlik",
        tabs: [
          ["dosya-klasor-yonetimi", "Dosya ve Klasör Yönetimi", "dosya"],
          ["eslestirmeler", "Eşleştirmeler", "file-check"],
          ["yedekleme-loglar", "Yedekleme / Loglar", "raporlar"],
          ["surum-merkezi", "Sürüm Merkezi", "ayarlar"],
        ],
      },
    ],
  },
  {
    key: "asistan",
    permissionKey: "ASISTAN",
    label: "KY ERP Asistan",
    icon: "asistan",
    tabs: [["sohbet", "Asistan Sohbeti", "dashboard"]],
  },
];

export const MODULE_ROUTE_ALIASES = {
  muhasebe: {
    "genel-bakis": "yonetim-ozeti",
    firmalar: "firma-kartlari",
    cari: "firma-kartlari",
    "cari-hareketler": "firma-kartlari",
    "firma-yetkilileri": "firma-kartlari",
    "eposta-kisileri": "firma-kartlari",
    "cek-odeme": "firma-kartlari",
    "cek-kart": "firma-kartlari",
    "odeme-tahsilat": "firma-kartlari",
    odemeler: "firma-kartlari",
    "odeme-nakit-akisi": "firma-kartlari",
    "gider-kategorileri": "mali-kontrol",
    "gelir-gider": "mali-kontrol",
    "kar-zarar": "mali-kontrol",
    kar: "mali-kontrol",
    zarar: "mali-kontrol",
    "kdv-kontrol": "mali-kontrol",
    kdv: "mali-kontrol",
    "muhasebe-raporlari": "mali-kontrol",
    raporlar: "mali-kontrol",
    "isveren-ozeti": "mali-kontrol",
    "mail-sablonlari": "mail-ekstre",
    "eposta-ekstre": "mail-ekstre",
    ayarlar: "mail-ekstre",
    "belge-kontrol": "tedarikci-faturalar",
    "belge-is-akisi": "tedarikci-faturalar",
    "belge-yukle": "tedarikci-faturalar",
    "belge-merkezi": "tedarikci-faturalar",
    "tedarikci-fatura": "tedarikci-faturalar",
    "tedarik-fatura": "tedarikci-faturalar",
    "kesilen-faturalar": "musteri-belgeleri",
    "irsaliye-fatura-kontrol": "musteri-belgeleri",
    "fatura-kesim": "musteri-belgeleri",
    "fatura-kesim-yardimcisi": "musteri-belgeleri",
    "fatura-yardimci": "musteri-belgeleri",
    "musteri-irsaliyeleri": "musteri-belgeleri",
    "musteri-irsaliye": "musteri-belgeleri",
    "irsaliye-fatura": "musteri-belgeleri",
    "model-muhasebe": "tedarikci-faturalar",
    "model-takip": "musteri-belgeleri",
    "kontrol-paneli": "yonetim-ozeti",
    "hizli-giris": "firma-kartlari",
    "gelen-irsaliye": "musteri-belgeleri",
    "giden-fatura": "musteri-belgeleri",
    "bizim-fatura": "musteri-belgeleri",
    "bizim-irsaliye": "musteri-belgeleri",
  },
  isnet: {    "belge-merkezi": "belge-akisi",
    "is-akisi": "irsaliyeden-faturaya",
    "arsiv-gonderim": "cikti-kuyrugu",
  },
  desen: {
    desen: "gelen-desenler",
    "desen-yonetim-ozeti": "gelen-desenler",
    yerlesim: "desen-yerlesim-is-akisi",
    "kalip-yerlesim": "desen-yerlesim-is-akisi",
    "desen-klasor-ayarlari": "gelen-desenler",
  },
  boyahane: {
    "boyahane-yonetim-ozeti": "is-akisi",
    "renk-recete-is-akisi": "is-akisi",
    "renk-gramaj": "uretim-gecmisi",
    "hammadde-lot": "urun-lotlar",
    "onayli-envanter": "urun-lotlar",
    "boyahane-raporlari": "raporlar",
    "evraklar-denetim": "raporlar",
    "evrak-denetim": "raporlar",
    evraklar: "raporlar",
    "renk-havuzu": "kayitli-renkler",
    "boya-giderleri": "raporlar",
    "is-akisi-eski": "is-akisi",
    "recete": "receteler",
    "uretim-gecmis": "uretim-gecmisi",
    "urun-ve-lotlar": "urun-lotlar",
  },
  "gunluk-operasyon": {
    ozet: "ana-ekran",
    genel: "ana-ekran",
    "genel-bakis": "ana-ekran",
    "gunluk-personel": "gunluk-giris",
    "gun-giris": "gunluk-giris",
    "daily-entry": "gunluk-giris",
    "gunluk-personel-kartlari": "personel-kartlari",
    "daily-personnel": "personel-kartlari",
    "gun-haftalik-ozet": "ana-ekran",
    "haftalik-ozet": "ana-ekran",
    "daily-weekly-summary": "ana-ekran",
    "gunluk-odeme-fisleri": "odeme-fisleri",
    "daily-payments": "odeme-fisleri",
  },
  ik: {
    "ik-ozet": "ozet",
    "ik-yonetim-ozeti": "ozet",
    "ay-genel-kontrol": "ozet",
    "genel-kontrol": "ozet",
    "monthly-overview": "ozet",
    "aylik-personel": "personel-kartlari",
    "ay-personel-kartlari": "personel-kartlari",
    "monthly-personnel": "personel-kartlari",
    "maas-sozlesme": "ucret-odeme-plani",
    "ay-maas-sozlesme": "ucret-odeme-plani",
    "ucret": "ucret-odeme-plani",
    "maas": "ucret-odeme-plani",
    "odeme-plani": "ucret-odeme-plani",
    "ay-mesai-avans": "mesai-avans",
    "mesai-kesinti": "mesai-avans",
    "monthly-work-advance": "mesai-avans",
    "ay-bordro": "bordro-odeme",
    bordro: "bordro-odeme",
    "monthly-payroll": "bordro-odeme",
    "ay-odeme": "bordro-odeme",
    "monthly-payment": "bordro-odeme",
    "sgk-bordro-aktarim": "sgk-evrak-kontrol",
    "sgk-bordro-aktirim": "sgk-evrak-kontrol",
    "aylik-ik-kapanis": "sgk-evrak-kontrol",
    "ay-evrak": "sgk-evrak-kontrol",
    "evrak-belgeler": "sgk-evrak-kontrol",

    // Eski İK içi PDKS yolları ikinci puantaj ekranı açmaz.
    "puantaj-izin": "personel-kartlari",
    "izin-mesai-kesinti": "mesai-avans",
    "yillik-izin": "yillik-izin",
    "ay-izin-evrak": "yillik-izin",
    "izin-evrak": "yillik-izin",
    "monthly-leave-management": "yillik-izin",
    "puantaj-kart-takibi": "personel-kartlari",
    "gun-personel-kartlari": "personel-kartlari",
    "daily-personnel": "personel-kartlari",
    "gun-giris": "personel-kartlari",
    "gunluk-giris": "personel-kartlari",
    "daily-entry": "personel-kartlari",
    "gun-haftalik-ozet": "ozet",
    "haftalik-ozet": "ozet",
    "daily-weekly-summary": "ozet",
    "gun-odemeler": "mesai-avans",
    odemeler: "mesai-avans",
    "daily-payments": "mesai-avans",
  },
  uretim: {
    "uretim-hizli-giris": "uretim-merkezi",
    "uretim-is-havuzu": "uretim-merkezi",
    "uretim-denge": "uretim-merkezi",
    "uretim-girisi": "uretim-merkezi",
    "imalat-denetim": "uretim-merkezi",
    genel: "uretim-merkezi",
    makinalar: "uretim-ayarlari",
    "makine-tanimlari": "uretim-ayarlari",
    "makine-vardiya-takibi": "uretim-ayarlari",
    "uretim-kayit": "uretim-merkezi",
    kalite: "uretim-merkezi",
    "uretim-giris-is-akisi": "uretim-merkezi",
    "uretim-seri-havuz": "uretim-merkezi",
    "fis-aktarim-havuzu": "uretim-merkezi",
    "imalat-yonetim-ozeti": "uretim-merkezi",
    "manuel-is-ac": "uretim-merkezi",
    "imalat-kontrol-rapor": "uretim-raporlari",
    "uretim-raporu": "uretim-raporlari",
    "imalat-raporlari": "uretim-raporlari",
  },
  admin: {
    "ana-firma-yonetimi": "ana-firma-ayarlar",
    "eposta-kayit": "ana-firma-ayarlar",
    "firma-esleme": "eslestirmeler",
    "urun-esleme": "eslestirmeler",
    "kdv-baglantisi": "eslestirmeler",
    yedekleme: "yedekleme-loglar",
    loglar: "yedekleme-loglar",
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
