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
        ],
      },
      {
        label: "Firma ve Eşleştirme",
        tabs: [
          ["firma-kartlari", "Firma Kartları", "firma-kartlari"],
          ["firma-yetkilileri", "Departman ve Yetkililer", "users"],
          ["envanter-urunleri", "Ürün ve Alias Eşleştirme", "urunler"],
          ["gider-kategorileri", "Firma / Gider Kuralları", "raporlar"],
        ],
      },
      {
        label: "Belge Yönetimi",
        tabs: [
          ["tedarikci-faturalar", "Gelen Tedarikçi Faturaları", "tedarikci-fatura"],
          ["kesilen-faturalar", "Kesilen Faturalar", "dosya"],
          ["irsaliye-fatura-kontrol", "İrsaliye / Fatura Kontrolü", "file-check"],
        ],
      },
      {
        label: "Cari ve Ödeme",
        tabs: [
          ["cari-hareketler", "Cari Hareketler", "cari-kasa"],
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
  return getModuleTabs(module).find(([key]) => key === tabKey) || null;
}

export function getInitialRoute(pathname = window.location.pathname) {
  const [requestedModuleKey, requestedTabKey] = pathname.split("/").filter(Boolean);
  const module = findModule(requestedModuleKey) || MODULES[0];
  const normalizedTabKey =
    module.key === "isnet"
      ? ISNET_ROUTE_ALIASES[requestedTabKey] || requestedTabKey
      : requestedTabKey;
  const tabs = getModuleTabs(module);
  const tab = tabs.find(([key]) => key === normalizedTabKey) || tabs[0];
  return {
    moduleKey: module.key,
    tabKey: tab?.[0] || "",
  };
}
