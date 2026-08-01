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
          ["tedarikci-faturalar", "Gelen Tedarikçi Faturaları", "tedarikci-fatura"],
          ["kesilen-faturalar", "Kesilen Faturalar", "dosya"],
          ["irsaliye-fatura-kontrol", "İrsaliye / Fatura Kontrolü", "file-check"],
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
    hiddenTabs: [
      ["cari-hareketler", "Cari Hareketler (Firmalar ve Cari içinde)", "cari-kasa"],
      ["firma-yetkilileri", "Departman ve Yetkililer (Firmalar ve Cari içinde)", "users"],
      ["envanter-urunleri", "Ürün Eşleştirme (Fatura kontrolünde)", "urunler"],
      ["gider-kategorileri", "Gider Kuralları (Kâr / Zarar içinde)", "raporlar"],
      ["musteri-irsaliyeleri", "Müşteri İrsaliyeleri (Eski Bağlantı)", "musteri-irsaliye"],
      ["model-takip", "Model Üretim Takibi (Eski Bağlantı)", "model-takip-merkezi"],
    ],
  },
  {
    key: "isnet",
    permissionKey: "ISNET",
    label: "İşNet",
    icon: "eposta",
    groups: [
      {
        label: "İşNet İşlemleri",
        tabs: [
          ["yonetim-merkezi", "Yönetim Merkezi", "dashboard"],
          ["belge-merkezi", "Belge Merkezi", "dosya"],
          ["is-akisi", "İrsaliye ve Fatura İş Akışı", "file-check"],
          ["arsiv-gonderim", "Arşiv ve Gönderim", "eposta"],
          ["ayarlar", "Ayarlar ve Bağlantı", "ayarlar"],
        ],
      },
    ],
    hiddenTabs: [
      ["irsaliyeden-faturaya", "Fatura Önizleme ve Gönderim", "file-check"],
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
        label: "Üretim Akışı",
        tabs: [
          ["is-akisi", "İş Akışı", "dashboard"],
          ["kayitli-renkler", "Kayıtlı Renkler", "renk"],
          ["receteler", "Reçeteler", "file-check"],
        ],
      },
      {
        label: "Stok ve Geçmiş",
        tabs: [
          ["urun-lotlar", "Ürün ve Lotlar", "urunler"],
          ["uretim-gecmisi", "Üretim Geçmişi", "dosya"],
          ["boya-giderleri", "Boya Giderleri", "odeme"],
          ["raporlar", "Raporlar", "raporlar"],
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
  },
  {
    key: "uretim",
    permissionKey: "IMALAT",
    label: "İmalat",
    icon: "dashboard",
    groups: [
      {
        label: "Üretim Girişi",
        tabs: [
          ["uretim-hizli-giris", "Akıllı Hızlı Giriş", "dashboard"],
          ["uretim-is-havuzu", "Üretim İş Havuzu", "dosya"],
        ],
      },
      {
        label: "Kontrol ve Yönetim",
        tabs: [
          ["uretim-denge", "İrsaliye / Üretim Dengesi", "file-check"],
          ["uretim-raporlari", "Üretim Raporları", "raporlar"],
          ["uretim-ayarlari", "Makine ve Vardiya Ayarları", "ayarlar"],
        ],
      },
    ],
    hiddenTabs: [
      ["uretim-girisi", "Üretim Girişi (Eski Bağlantı)", "dashboard"],
      ["imalat-kontrol-rapor", "Denetim ve Rapor (Eski Bağlantı)", "raporlar"],
      ["imalat-denetim", "Üretim Dengesi (Eski Bağlantı)", "file-check"],
      ["uretim-raporu", "Üretim Raporu (Eski Bağlantı)", "raporlar"],
    ],
  },
  {
    key: "asistan",
    permissionKey: "ASISTAN",
    label: "KY ERP Asistan",
    icon: "dashboard",
    tabs: [["sohbet", "Asistan Sohbeti", "dashboard"]],
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
];

const ISNET_ROUTE_ALIASES = {
  "belge-akisi": "belge-merkezi",
  "gelen-irsaliyeler": "belge-merkezi",
  "giden-irsaliyeler": "belge-merkezi",
  "gelen-faturalar": "belge-merkezi",
  "giden-faturalar": "belge-merkezi",
  "belge-kaynagi": "is-akisi",
  "yeni-irsaliye": "is-akisi",
  "kesilen-belgeler": "arsiv-gonderim",
  "cikti-kuyrugu": "arsiv-gonderim",
  "mail-merkezi": "arsiv-gonderim",
};

export const MUHASEBE_ROUTE_ALIASES = {
  "genel-bakis": "yonetim-ozeti",
  firmalar: "firma-kartlari",
  cari: "firma-kartlari",
  "cari-hareketler": "firma-kartlari",
  "firma-yetkilileri": "firma-kartlari",
  "eposta-kisileri": "firma-kartlari",
  "gider-kategorileri": "kar-zarar",
  "gelir-gider": "kar-zarar",
  kdv: "kdv-kontrol",
  "cek-kart": "cek-odeme",
  "eposta-ekstre": "mail-ekstre",
  "belge-kontrol": "tedarikci-faturalar",
  "belge-is-akisi": "tedarikci-faturalar",
  "belge-yukle": "tedarikci-faturalar",
  "belge-merkezi": "tedarikci-faturalar",
  "tedarikci-fatura": "tedarikci-faturalar",
  "fatura-kesim": "kesilen-faturalar",
  "fatura-kesim-yardimcisi": "kesilen-faturalar",
  "musteri-belgeleri": "kesilen-faturalar",
  "musteri-irsaliyeleri": "irsaliye-fatura-kontrol",
  "musteri-irsaliye": "irsaliye-fatura-kontrol",
  "irsaliye-fatura": "irsaliye-fatura-kontrol",
  raporlar: "muhasebe-raporlari",
};

export function normalizeModuleTabKey(module, tabKey) {
  if (module?.key === "muhasebe") return MUHASEBE_ROUTE_ALIASES[tabKey] || tabKey;
  if (module?.key === "isnet") return ISNET_ROUTE_ALIASES[tabKey] || tabKey;
  return tabKey;
}

export function getModuleTabs(module) {
  if (!module) return [];
  const visible = module.groups
    ? module.groups.flatMap((group) => group.tabs)
    : module.tabs || [];
  return [...visible, ...(module.hiddenTabs || [])];
}

export function findModule(moduleKey) {
  return MODULES.find((module) => module.key === moduleKey) || null;
}

export function findTab(module, tabKey) {
  const normalizedTabKey = normalizeModuleTabKey(module, tabKey);
  return getModuleTabs(module).find(([key]) => key === normalizedTabKey) || null;
}

export function getInitialRoute(pathname = window.location.pathname) {
  const [requestedModuleKey, requestedTabKey] = pathname.split("/").filter(Boolean);
  const module = findModule(requestedModuleKey) || MODULES[0];
  const normalizedTabKey = normalizeModuleTabKey(module, requestedTabKey);
  const tabs = getModuleTabs(module);
  const tab = tabs.find(([key]) => key === normalizedTabKey) || tabs[0];
  return {
    moduleKey: module.key,
    tabKey: tab?.[0] || "",
  };
}
