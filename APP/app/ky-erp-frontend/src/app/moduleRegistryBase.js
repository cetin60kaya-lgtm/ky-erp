export const MODULES = [
  {
    key: "muhasebe",
    permissionKey: "MUHASEBE",
    label: "Muhasebe",
    icon: "cari-kasa",
    groups: [
      {
        label: "Yönetim",
        tabs: [
          ["yonetim-ozeti", "Yönetim Özeti", "genel-bakis"],
          ["firma-kartlari", "Firmalar ve Cari", "firma-kartlari"],
        ],
      },
      {
        label: "Fatura ve Belge",
        tabs: [
          ["tedarikci-faturalar", "Tedarikçi İrsaliye / Faturaları", "tedarikci-fatura"],
          ["kesilen-faturalar", "Bizim Kesilen Faturalarımız", "dosya"],
          ["irsaliye-fatura-kontrol", "Müşteri İrsaliye / Bizim Belgeler", "file-check"],
        ],
      },
      {
        label: "Cari ve Ödeme",
        tabs: [
          ["cek-odeme", "Çek / Ödeme", "cekler"],
          ["mail-ekstre", "Ekstre ve Mail Takibi", "eposta"],
        ],
      },
      {
        label: "Mali Kontrol",
        tabs: [
          ["kar-zarar", "Gelir / Gider ve Kâr / Zarar", "raporlar"],
          ["kdv-kontrol", "Gelen / Giden KDV Kontrolü", "kdv"],
        ],
      },
      {
        label: "Rapor ve Şablon",
        tabs: [
          ["muhasebe-raporlari", "Muhasebe Raporları", "raporlar"],
          ["mail-sablonlari", "Mail Şablonları", "eposta"],
        ],
      },
    ],
  },
  {
    key: "isnet",
    permissionKey: "ISNET",
    label: "İşNet",
    icon: "eposta",
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
    icon: "dosya",
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
    icon: "renk",
    groups: [
      {
        label: "Hakan Emprime Boyahane",
        tabs: [
          ["is-akisi", "Ana Ekran", "dashboard"],
          ["receteler", "Numune Çalışmaları", "file-check"],
          ["uretim-gecmisi", "İmalat Boyaları", "dosya"],
          ["kayitli-renkler", "Kayıtlı Renkler", "renk"],
          ["urun-lotlar", "Stok, Lot ve Ürünler", "urunler"],
          ["raporlar", "Raporlar ve İşlem Logları", "raporlar"],
        ],
      },
    ],
  },
  {
    key: "ik",
    permissionKey: "IK",
    label: "İK",
    icon: "users",
    groups: [
      {
        label: "İK Yönetimi",
        tabs: [
          ["ozet", "İK Özet", "dashboard"],
          ["personel-kartlari", "Personel Kartı", "users"],
          ["mesai-avans", "Mesai • Avans • Kesinti", "takvim"],
          ["puantaj-izin", "Yıllık İzin / Günlük Durum", "takvim"],
          ["bordro-odeme", "Bordro & Ödeme", "odemeler"],
          ["sgk-evrak-kontrol", "SGK • Evrak • Ay Sonu", "file-check"],
        ],
      },
      {
        label: "Günlük Personel",
        tabs: [
          ["gunluk-personel", "Günlük Giriş", "users"],
          ["gunluk-personel-kartlari", "Günlük Personel Kartları", "users"],
          ["ik-raporlari", "Haftalık Özet", "takvim"],
          ["gunluk-odeme-fisleri", "Günlük Ödeme Fişleri", "odemeler"],
        ],
      },
    ],
    hiddenTabs: [
      ["denetim-raporu", "Denetim Raporları", "raporlar"],
    ],
  },
  {
    key: "uretim",
    permissionKey: "IMALAT",
    label: "İmalat",
    icon: "dashboard",
    groups: [
      {
        label: "Tek Merkez Üretim",
        tabs: [
          ["uretim-merkezi", "Model ve Üretim Kontrol Merkezi", "dashboard"],
          ["uretim-raporlari", "Üretim Raporları", "raporlar"],
          ["uretim-ayarlari", "Makine ve Vardiya Ayarları", "ayarlar"],
        ],
      },
    ],
  },
  {
    key: "admin",
    permissionKey: "ADMIN",
    label: "Yönetim",
    icon: "ayarlar",
    groups: [
      {
        label: "Sistem Yönetimi",
        tabs: [
          ["admin-yonetim-ozeti", "Yönetim Özeti", "dashboard"],
          ["uygulama-sahibi", "Uygulama Sahibi", "ayarlar"],
          ["kullanicilar", "Kullanıcılar", "users"],
          ["ana-firma-ayarlar", "Ana Firma / Ayarlar", "ayarlar"],
        ],
      },
      {
        label: "Dosya ve Güvenlik",
        tabs: [
          ["dosya-klasor-yonetimi", "Dosya ve Klasör Yönetimi", "dosya"],
          ["eslestirmeler", "Eşleştirmeler", "file-check"],
          ["yedekleme-loglar", "Yedekleme / Loglar", "raporlar"],
        ],
      },
    ],
  },
  {
    key: "asistan",
    permissionKey: "ASISTAN",
    label: "KY ERP Asistan",
    icon: "dashboard",
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
    "gider-kategorileri": "kar-zarar",
    "gelir-gider": "kar-zarar",
    kar: "kar-zarar",
    zarar: "kar-zarar",
    kdv: "kdv-kontrol",
    "cek-kart": "cek-odeme",
    "odeme-tahsilat": "cek-odeme",
    odemeler: "cek-odeme",
    "odeme-nakit-akisi": "cek-odeme",
    "eposta-ekstre": "mail-ekstre",
    "belge-kontrol": "tedarikci-faturalar",
    "belge-is-akisi": "tedarikci-faturalar",
    "belge-yukle": "tedarikci-faturalar",
    "belge-merkezi": "tedarikci-faturalar",
    "tedarikci-fatura": "tedarikci-faturalar",
    "tedarik-fatura": "tedarikci-faturalar",
    "fatura-kesim": "kesilen-faturalar",
    "fatura-kesim-yardimcisi": "kesilen-faturalar",
    "fatura-yardimci": "kesilen-faturalar",
    "musteri-belgeleri": "kesilen-faturalar",
    "musteri-irsaliyeleri": "irsaliye-fatura-kontrol",
    "musteri-irsaliye": "irsaliye-fatura-kontrol",
    "irsaliye-fatura": "irsaliye-fatura-kontrol",
    "model-muhasebe": "tedarikci-faturalar",
    "model-takip": "irsaliye-fatura-kontrol",
    "isveren-ozeti": "muhasebe-raporlari",
    "kontrol-paneli": "yonetim-ozeti",
    "hizli-giris": "firma-kartlari",
    "gelen-irsaliye": "irsaliye-fatura-kontrol",
    "giden-fatura": "kesilen-faturalar",
    "bizim-fatura": "kesilen-faturalar",
    "bizim-irsaliye": "irsaliye-fatura-kontrol",
    raporlar: "muhasebe-raporlari",
    ayarlar: "mail-sablonlari",
  },
  isnet: {
    "belge-merkezi": "belge-akisi",
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
  ik: {
    "ik-ozet": "ozet",
    "ik-yonetim-ozeti": "ozet",
    "ay-genel-kontrol": "ozet",
    "genel-kontrol": "ozet",
    "monthly-overview": "ozet",
    "aylik-personel": "personel-kartlari",
    "ay-personel-kartlari": "personel-kartlari",
    "monthly-personnel": "personel-kartlari",
    "ay-mesai-avans": "mesai-avans",
    "mesai-kesinti": "mesai-avans",
    "monthly-work-advance": "mesai-avans",
    "izin-mesai-kesinti": "puantaj-izin",
    "ay-maas-sozlesme": "puantaj-izin",
    "maas-sozlesme": "puantaj-izin",
    "yillik-izin": "puantaj-izin",
    "ay-izin-evrak": "puantaj-izin",
    "izin-evrak": "puantaj-izin",
    "monthly-leave-management": "puantaj-izin",
    "puantaj-kart-takibi": "puantaj-izin",
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
    "gun-personel-kartlari": "gunluk-personel-kartlari",
    "daily-personnel": "gunluk-personel-kartlari",
    "gun-giris": "gunluk-personel",
    "gunluk-giris": "gunluk-personel",
    "daily-entry": "gunluk-personel",
    "gun-haftalik-ozet": "ik-raporlari",
    "haftalik-ozet": "ik-raporlari",
    "daily-weekly-summary": "ik-raporlari",
    "gun-odemeler": "gunluk-odeme-fisleri",
    odemeler: "gunluk-odeme-fisleri",
    "daily-payments": "gunluk-odeme-fisleri",
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
