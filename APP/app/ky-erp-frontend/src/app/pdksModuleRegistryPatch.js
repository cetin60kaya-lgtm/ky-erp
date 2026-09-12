import { MODULES, MODULE_ROUTE_ALIASES } from "./moduleRegistry";

const PDKS_MODULE = {
  key: "pdks",
  permissionKey: "IK",
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

if (!MODULES.some((item) => item.key === "pdks")) {
  const ikIndex = MODULES.findIndex((item) => item.key === "ik");
  MODULES.splice(ikIndex >= 0 ? ikIndex + 1 : MODULES.length, 0, PDKS_MODULE);
}

MODULE_ROUTE_ALIASES.pdks = {
  "genel-bakis": "ana-ekran",
  "canli-gecisler": "ana-ekran",
  "bilgi-aktarimi": "bilgi-aktar",
  "giris-cikis": "giris-cikislar",
  "personel": "personel-bilgileri",
  "personel-kartlari": "personel-bilgileri",
  "puantaj-sonuc": "puantaj-sonuclari",
  "izin": "izinler",
  "ozel-izin": "izinler",
  "puantaj-bilgi": "puantaj-kurallari",
  "puanbilgi": "puantaj-kurallari",
  "gruplar": "gruplar-vardiyalar",
  "vardiyalar": "gruplar-vardiyalar",
  "calisma-gruplari": "gruplar-vardiyalar",
  "terminal": "saat-terminal",
  "saat": "saat-terminal",
  "cihazlar": "cihaz-baglantilari",
  "sync": "senkron",
  "denetim": "denetim-yillik-temp",
  "temp": "denetim-yillik-temp",
};
