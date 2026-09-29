import { MODULES, getVisibleModuleTabs } from "./moduleRegistry";

export const LEFT_CLICK_BUILTINS = [
  { id: "shell:module-home", label: "Modül Ana Ekranı", description: "Açık modülün ilk ekranına gider", icon: "home" },
  { id: "shell:quick", label: "Hızlı İşlem", description: "KY ERP hızlı işlem paletini açar", icon: "hizli" },
  { id: "shell:search", label: "Genel Arama", description: "Üstteki genel arama alanını açar", icon: "ara" },
  { id: "shell:back", label: "Geri", description: "Bir önceki uygulama ekranına döner", icon: "arrow-down" },
  { id: "shell:copy-link", label: "Bağlantıyı Kopyala", description: "Açık ekranın bağlantısını panoya kopyalar", icon: "baglanti" },
  { id: "shell:print", label: "Yazdır / PDF", description: "Tarayıcı yazdırma ve PDF penceresini açar", icon: "belge" },
  { id: "shell:refresh", label: "Yenile", description: "Açık ekranı yeniler", icon: "yenile" },
  { id: "shell:fullscreen", label: "Tam Ekran", description: "Tam ekran görünümünü açar veya kapatır", icon: "terminal" },
  { id: "shell:new-tab", label: "Yeni Sekmede Aç", description: "Açık ekranı yeni tarayıcı sekmesinde açar", icon: "dosya" },
];

export function routeActionId(moduleKey, tabKey) {
  return `route:${moduleKey}:${tabKey}`;
}

export function parseRouteActionId(id) {
  const match = String(id || "").match(/^route:([^:]+):(.+)$/);
  return match ? { moduleKey: match[1], tabKey: match[2] } : null;
}

export function buildRouteActions(modules = MODULES) {
  return (modules || []).flatMap((module) =>
    getVisibleModuleTabs(module).map((tab) => ({
      id: routeActionId(module.key, tab[0]),
      label: tab[1],
      description: module.label,
      icon: tab[2] || module.icon || "dashboard",
      moduleKey: module.key,
      tabKey: tab[0],
      moduleLabel: module.label,
      type: "route",
    })),
  );
}

export function buildLeftClickActionCatalog(modules = MODULES) {
  return [
    ...LEFT_CLICK_BUILTINS.map((item) => ({ ...item, type: "shell" })),
    ...buildRouteActions(modules),
  ];
}
