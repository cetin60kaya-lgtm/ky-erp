// Sol menü: günlük kullanılan modüller doğrudan, yalnız ayarlar tek açılır alanda.
// Modül anahtarları/izinleri/rotaları değiştirilmez.
export const KY_PRIMARY_MENU_KEYS = [
  "ana-sayfa",
  "muhasebe",
  "e-belge",
  "gunluk-operasyon",
  "ik",
  "pdks",
  "desen",
  "uretim",
  "boyahane",
  "compliance",
  "iletisim",
];

export const KY_SETTINGS_MENU_KEYS = ["admin", "depolama", "sistem-merkezi"];
// Asistan mevcut üst arama / Hızlı İşlem üzerinden açılır; yönetim menüsünü yanlışlıkla görünür kılmaz.
export const KY_QUICK_ACCESS_KEYS = ["asistan"];

export function visibleMenuModules(modules = [], keys = []) {
  const accessible = new Map(modules.filter((module) => module?.key).map((module) => [module.key, module]));
  return keys.map((key) => accessible.get(key)).filter(Boolean);
}

// Bu gruplar yalnız breadcrumb / mantıksal sınıflandırma içindir; sol menüde açılır başlık oluşturmaz.
export const KY_NAV_GROUPS = [
  { key: "finance", title: "Muhasebe", description: "Cari, faturalar ve e-Belge", keys: ["muhasebe", "e-belge"] },
  { key: "daily", title: "Personel & İK", description: "Günlük operasyon, aylık İK ve PDKS", keys: ["gunluk-operasyon", "ik", "pdks"] },
  { key: "production", title: "Üretim", description: "Desen, imalat ve boyahane", keys: ["desen", "uretim", "boyahane"] },
  { key: "company", title: "Denetim", description: "Evrak ve uygunluk", keys: ["compliance"] },
  { key: "communication", title: "İletişim", description: "Mail ve dosyalar", keys: ["iletisim", "asistan"] },
  { key: "management", title: "Ayarlar & Sistem", description: "Yönetim, güvenlik, bağlantılar ve asistan", keys: ["admin", "depolama", "sistem-merkezi"] },
];
export function visibleNavigationGroups(modules = []) {
  const access = new Map(modules.filter((module) => module?.key && module.key !== "ana-sayfa").map((module) => [module.key, module]));
  return KY_NAV_GROUPS.map((group) => ({ ...group, modules: group.keys.map((key) => access.get(key)).filter(Boolean) })).filter((group) => group.modules.length);
}
export function navigationGroupFor(moduleKey) {
  return KY_NAV_GROUPS.find((group) => group.keys.includes(moduleKey))?.key || "";
}
