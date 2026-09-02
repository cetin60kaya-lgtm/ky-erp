import { MODULES, MODULE_ROUTE_ALIASES } from "./moduleRegistry";

const PDKS_MODULE = {
  key: "pdks",
  permissionKey: "IK",
  label: "PDKS",
  icon: "takvim",
  groups: [
    {
      label: "Günlük",
      description: "Kart, giriş/çıkış ve puantaj",
      tabs: [
        ["ana-ekran", "PDKS İşlem Merkezi", "dashboard"],
        ["bilgi-aktar", "Bilgi Aktar", "dosya"],
        ["giris-cikislar", "Kart / Giriş / Çıkış", "takvim"],
        ["puantaj", "Puantaj", "takvim"],
        ["puantaj-sonuclari", "Puantaj Sonuçları", "raporlar"],
        ["calisma-tarihi", "Çalışma Tarihi / Günlük Onay", "takvim"],
      ],
    },
    {
      label: "Personel & İK",
      description: "Personel, izin ve bordro bağlantısı",
      tabs: [
        ["personel-bilgileri", "Personel", "users"],
        ["izinler", "İzin / Devamsızlık", "takvim"],
        ["avanslar", "Avans / Fazla Mesai", "odemeler"],
        ["bordro", "Bordro Bağlantısı", "odemeler"],
      ],
    },
    {
      label: "Tanımlar",
      description: "Vardiya ve çalışma kuralları",
      tabs: [
        ["gruplar-vardiyalar", "Vardiya / Çalışma Grupları", "ayarlar"],
        ["puantaj-kurallari", "Çalışma / Puantaj Kuralları", "ayarlar"],
        ["donemler", "Dönemler", "takvim"],
        ["tatiller", "Resmî Tatiller", "takvim"],
        ["bolumler", "Bölümler", "users"],
        ["gorevler", "Görevler", "users"],
        ["servisler", "Servisler", "users"],
        ["durumlar", "Durumlar", "file-check"],
        ["firmalar", "Firmalar", "firma-kartlari"],
      ],
    },
    {
      label: "Terminal & Sistem",
      description: "Cihaz, saat ve senkron yönetimi",
      tabs: [
        ["cihaz-baglantilari", "Cihaz Bağlantıları", "ayarlar"],
        ["saat-terminal", "Saat / Terminal", "takvim"],
        ["senkron", "Senkronizasyon", "file-check"],
        ["kullanicilar", "PDKS Kullanıcıları", "users"],
      ],
    },
    {
      label: "Rapor & Denetim",
      description: "Raporlar ve yıllık denetim paketi",
      tabs: [
        ["raporlar", "PDKS Raporları", "raporlar"],
        ["denetim-yillik-temp", "Yıllık Denetim Paketi", "file-check"],
      ],
    },
  ],
};

const existingIndex = MODULES.findIndex((item) => item.key === "pdks");
if (existingIndex >= 0) MODULES.splice(existingIndex, 1, PDKS_MODULE);
else {
  const ikIndex = MODULES.findIndex((item) => item.key === "ik");
  MODULES.splice(ikIndex >= 0 ? ikIndex + 1 : MODULES.length, 0, PDKS_MODULE);
}

MODULE_ROUTE_ALIASES.pdks = {
  "genel-bakis": "ana-ekran",
  "islem-merkezi": "ana-ekran",
  "bilgi-aktarimi": "bilgi-aktar",
  "giris-cikis": "giris-cikislar",
  "kart-hareketleri": "giris-cikislar",
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
  "cihaz": "cihaz-baglantilari",
  "cihazlar": "cihaz-baglantilari",
  "senkronizasyon": "senkron",
  "denetim": "denetim-yillik-temp",
  "temp": "denetim-yillik-temp",
  "yillik-denetim": "denetim-yillik-temp",
};
