// Tek kaynak: uygulama menüsü ve ana sayfa kartları aynı modül gruplarını kullanır.
export const KY_NAV_GROUPS = [
  { key: "daily", title: "Personel Yönetimi", homeTitle: "Personel yönetimi", description: "İK aylık, günlük personel ve PDKS işlemleri", keys: ["ik", "gunluk-operasyon", "pdks"] },
  { key: "production", title: "Üretim", homeTitle: "Üretim akışı", description: "Modelden üretime tek süreç", keys: ["desen", "boyahane", "uretim"] },
  { key: "finance", title: "Finans", homeTitle: "Finans ve belgeler", description: "Cari, ödeme ve belge yönetimi", keys: ["muhasebe", "e-belge"] },
  { key: "company", title: "Firma İşlemleri", homeTitle: "Firma işlemleri", description: "Firma denetimi, uygunluk ve evrak süre takibi", keys: ["compliance"] },
  { key: "communication", title: "İletişim", homeTitle: "İletişim ve dosyalar", description: "Evrak ve iletişim süreçleri", keys: ["iletisim", "asistan"] },
  { key: "management", title: "Yönetim ve Sistem", homeTitle: "Yönetim ve sistem", description: "Bağlantılar, cihazlar ve platform yönetimi", keys: ["depolama", "sistem-merkezi", "admin"] },
];

export function visibleNavigationGroups(modules = []) {
  const access = new Map(modules.filter((module) => module?.key && module.key !== "ana-sayfa").map((module) => [module.key, module]));
  return KY_NAV_GROUPS.map((group) => ({
    ...group,
    modules: group.keys.map((key) => access.get(key)).filter(Boolean),
  })).filter((group) => group.modules.length);
}

export function navigationGroupFor(moduleKey) {
  return KY_NAV_GROUPS.find((group) => group.keys.includes(moduleKey))?.key || "";
}
