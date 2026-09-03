import { MODULES, MODULE_ROUTE_ALIASES } from "./moduleRegistry";

const PDKS_MODULE = {
  key: "pdks",
  permissionKey: "IK",
  label: "PDKS",
  icon: "takvim",
  groups: [
    {
      label: "PDKS Operasyon",
      tabs: [
        ["ana-ekran", "Ana Ekran", "dashboard"],
        ["bilgi-aktar", "Kart / Terminal Aktarımı", "dosya"],
        ["giris-cikislar", "Giriş / Çıkışlar", "takvim"],
        ["puantaj", "Puantaj", "takvim"],
        ["puantaj-sonuclari", "Puantaj Sonuçları", "raporlar"],
        ["calisma-tarihi", "Çalışma Tarihi", "takvim"],
      ],
    },
    {
      label: "İK'dan Okunan",
      tabs: [
        ["personel-bilgileri", "Personel (İK'dan)", "users"],
      ],
    },
    {
      label: "PDKS Tanımları",
      tabs: [
        ["gruplar-vardiyalar", "Gruplar / Vardiyalar", "ayarlar"],
        ["puantaj-kurallari", "Puantaj Kuralları", "ayarlar"],
        ["donemler", "Dönemler / Kapanış", "takvim"],
        ["servisler", "Servisler", "users"],
        ["tatiller", "Resmî Tatil Takvimi", "takvim"],
      ],
    },
    {
      label: "Terminal ve Rapor",
      tabs: [
        ["saat-terminal", "Saat / Terminal", "ayarlar"],
        ["raporlar", "Raporlar", "raporlar"],
      ],
    },
    {
      label: "Denetim",
      tabs: [["denetim-yillik-temp", "Yıllık TEMP / Denetim", "file-check"]],
    },
  ],
  hiddenTabs: [
    ["izinler", "İzinler (İK'ya taşındı)", "takvim"],
    ["bordro", "Bordro (İK'ya taşındı)", "odemeler"],
    ["avanslar", "Avanslar (İK'ya taşındı)", "odemeler"],
    ["bolumler", "Bölümler (İK ana kaynak)", "users"],
    ["gorevler", "Görevler (İK ana kaynak)", "users"],
    ["durumlar", "Durumlar (İK ana kaynak)", "file-check"],
    ["firmalar", "Firmalar (Yönetim ana kaynak)", "firma-kartlari"],
    ["kullanicilar", "Kullanıcılar (Yönetim ana kaynak)", "users"],
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
  "izin": "puantaj-sonuclari",
  "izinler": "puantaj-sonuclari",
  "ozel-izin": "puantaj-sonuclari",
  "bordro": "puantaj-sonuclari",
  "avanslar": "puantaj-sonuclari",
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