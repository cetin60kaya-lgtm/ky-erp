export const MODULES = [
  {
    key: "muhasebe",
    permissionKey: "MUHASEBE",
    label: "Muhasebe",
    icon: "cari-kasa",
    tabs: [
      ["yonetim-ozeti", "Yönetim Özeti", "genel-bakis"],
      ["firma-kartlari", "Firma Kartları", "firma-kartlari"],
      ["firma-yetkilileri", "Firma Yetkilileri", "users"],
      ["gider-kategorileri", "Gider Kategorileri", "raporlar"],
      ["tedarikci-faturalar", "Tedarikçi Faturaları", "tedarikci-fatura"],
      ["kesilen-faturalar", "Kesilen Faturalar", "dosya"],
      ["musteri-irsaliyeleri", "İrsaliyeler", "musteri-irsaliye"],
      ["irsaliye-fatura-kontrol", "İrsaliye / Fatura", "file-check"],
      ["model-takip", "Model Üretim Takibi", "model-takip-merkezi"],
      ["cari-hareketler", "Cari Hareketler", "cari-kasa"],
      ["kar-zarar", "Gelir / Gider", "raporlar"],
      ["envanter-urunleri", "Ürünler", "urunler"],
      ["kdv-kontrol", "KDV Kontrol", "kdv"],
      ["cek-odeme", "Çek / Ödeme", "cekler"],
      ["mail-ekstre", "Mail / Ekstre", "eposta"],
      ["mail-sablonlari", "Mail Şablonları", "eposta"],
      ["muhasebe-raporlari", "Raporlar", "raporlar"],
    ],
  },
  {
    key: "isnet",
    permissionKey: "ISNET",
    label: "İşNet",
    icon: "eposta",
    tabs: [
      ["yonetim-merkezi", "Analiz ve Eşleştirme", "dashboard"],
      ["belge-akisi", "Gelen / Giden Belgeler", "dosya"],
      ["irsaliyeden-faturaya", "Fatura Kesme Yardımcısı", "file-check"],
      ["kesilen-belgeler", "Yerel Belge Arşivi", "dosya"],
      ["cikti-kuyrugu", "Çıktı ve Mail", "file-check"],
      ["ayarlar", "Ayarlar", "ayarlar"],
    ],
  },
  {
    key: "desen",
    permissionKey: "DESEN",
    label: "Desen",
    icon: "dosya",
    tabs: [
      ["gelen-desenler", "Gelen Desenler", "dashboard"],
      ["desen-modeller", "Desen Havuzu", "dosya"],
      ["desen-yerlesim-is-akisi", "Yerleşim / Kalıp", "file-check"],
      ["desen-raporlari", "Desen Raporları", "raporlar"],
    ],
  },
  {
    key: "boyahane",
    permissionKey: "BOYAHANE",
    label: "Boyahane",
    icon: "renk",
    tabs: [
      ["is-akisi", "İş Akışı", "dashboard"],
      ["kayitli-renkler", "Kayıtlı Renkler", "renk"],
      ["receteler", "Reçeteler", "file-check"],
      ["urun-lotlar", "Ürün ve Lotlar", "urunler"],
      ["uretim-gecmisi", "Üretim Geçmişi", "dosya"],
      ["boya-giderleri", "Boya Giderleri", "odeme"],
      ["raporlar", "Raporlar", "raporlar"],
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
    tabs: [
      ["uretim-girisi", "Üretim Girişi", "dashboard"],
      ["imalat-kontrol-rapor", "Denetim ve Rapor", "raporlar"],
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
    tabs: [
      ["admin-yonetim-ozeti", "Yönetim Özeti", "dashboard"],
      ["kullanicilar", "Kullanıcılar", "users"],
      ["ana-firma-ayarlar", "Ana Firma / Ayarlar", "ayarlar"],
      ["dosya-klasor-yonetimi", "Dosya ve Klasör Yönetimi", "dosya"],
      ["eslestirmeler", "Eşleştirmeler", "file-check"],
      ["yedekleme-loglar", "Yedekleme / Loglar", "raporlar"],
    ],
  },
];

export function getModuleTabs(module) {
  if (!module) return [];
  return module.groups
    ? module.groups.flatMap((group) => group.tabs)
    : module.tabs || [];
}

export function findModule(moduleKey) {
  return MODULES.find((module) => module.key === moduleKey) || null;
}

export function findTab(module, tabKey) {
  return getModuleTabs(module).find(([key]) => key === tabKey) || null;
}

export function getInitialRoute(pathname = window.location.pathname) {
  const [moduleKey, tabKey] = pathname.split("/").filter(Boolean);
  const module = findModule(moduleKey) || MODULES[0];
  const tabs = getModuleTabs(module);
  const tab = tabs.find(([key]) => key === tabKey) || tabs[0];
  return {
    moduleKey: module.key,
    tabKey: tab?.[0] || "",
  };
}
