import { MODULES, MODULE_ROUTE_ALIASES } from "./moduleRegistry";

const PDKS_MODULE = {
  key: "pdks",
  permissionKey: "PDKS",
  label: "KY PDKS",
  icon: "pdks",
  sidebarGroups: [["workspace", "KY PDKS", "dashboard", "Tek kurumsal çalışma alanı"]],
  groups: [{
    label: "KY PDKS Unified",
    tabs: [["workspace", "KY PDKS", "dashboard"]],
  }],
  hiddenTabs: [],
};

if (!MODULES.some((item) => item.key === "pdks")) {
  const ikIndex = MODULES.findIndex((item) => item.key === "ik");
  MODULES.splice(ikIndex >= 0 ? ikIndex + 1 : MODULES.length, 0, PDKS_MODULE);
}

// Historical URLs remain compatible. They never render old menu screens.
MODULE_ROUTE_ALIASES.pdks = {
  "ana-ekran": "workspace",
  "genel-bakis": "workspace",
  "canli-gecisler": "workspace",
  "giris-cikislar": "workspace",
  "giris-cikis": "workspace",
  "personel-bilgileri": "workspace",
  "personel-kartlari": "workspace",
  "puantaj": "workspace",
  "puantaj-sonuclari": "workspace",
  "calisma-tarihi": "workspace",
  "raporlar": "workspace",
  "denetim-yillik-temp": "workspace",
  "izinler": "workspace",
  "gruplar-vardiyalar": "workspace",
  "terminal": "workspace",
  "saat-terminal": "workspace",
  "senkron": "workspace",
};
