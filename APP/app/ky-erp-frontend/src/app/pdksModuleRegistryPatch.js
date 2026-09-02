import { MODULES, MODULE_ROUTE_ALIASES } from "./moduleRegistry";

const PDKS_MODULE = {
  key: "pdks",
  permissionKey: "IK",
  label: "PDKS",
  icon: "takvim",
  tabs: [["ana-ekran", "PDKS Merkezi", "dashboard"]],
  hiddenTabs: [
    ["bilgi-aktar", "Bilgi Aktar", "dosya"],
    ["giris-cikislar", "Giriş / Çıkışlar", "takvim"],
    ["personel-bilgileri", "Personel Bilgileri", "users"],
    ["puantaj", "Puantaj", "takvim"],
    ["puantaj-sonuclari", "Puantaj Sonuçları", "raporlar"],
    ["izinler", "İzinler", "takvim"],
    ["bordro", "Bordro", "odemeler"],
    ["avanslar", "Avanslar", "odemeler"],
    ["calisma-tarihi", "Çalışma Tarihi", "takvim"],
    ["gruplar-vardiyalar", "Gruplar / Vardiyalar", "ayarlar"],
    ["puantaj-kurallari", "Puantaj Kuralları", "ayarlar"],
    ["donemler", "Dönemler", "takvim"],
    ["bolumler", "Bölümler", "users"],
    ["gorevler", "Görevler", "users"],
    ["servisler", "Servisler", "users"],
    ["durumlar", "Durumlar", "file-check"],
    ["firmalar", "Firmalar", "firma-kartlari"],
    ["tatiller", "Tatiller", "takvim"],
    ["saat-terminal", "Saat / Terminal", "ayarlar"],
    ["kullanicilar", "Kullanıcılar", "users"],
    ["raporlar", "Raporlar", "raporlar"],
    ["denetim-yillik-temp", "Yıllık TEMP / Denetim", "file-check"],
  ],
};

if (!MODULES.some((item) => item.key === "pdks")) {
  const ikIndex = MODULES.findIndex((item) => item.key === "ik");
  MODULES.splice(ikIndex >= 0 ? ikIndex + 1 : MODULES.length, 0, PDKS_MODULE);
}

MODULE_ROUTE_ALIASES.pdks = {
  "genel-bakis": "ana-ekran",
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
  "denetim": "denetim-yillik-temp",
  "temp": "denetim-yillik-temp",
};
