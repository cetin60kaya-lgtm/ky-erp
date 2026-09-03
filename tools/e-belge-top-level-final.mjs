import fs from "node:fs";

function rewrite(path, replacements) {
  let source = fs.readFileSync(path, "utf8");
  for (const [before, after] of replacements) {
    if (!source.includes(before)) {
      throw new Error(`${path}: beklenen blok bulunamadı: ${String(before).slice(0, 120)}`);
    }
    source = source.replace(before, after);
  }
  fs.writeFileSync(path, source);
}

rewrite("APP/app/ky-erp-frontend/src/app/moduleRegistry.js", [
  [
`function withEBelgeNavigation(module) {
  if (module.key === "isnet") {
    return { ...module, label: "e-Belge Entegrasyonları" };
  }
  if (module.key !== "muhasebe") return module;
  const tab = ["e-belge-merkezi", "e-Belge Merkezi", "dosya"];
  const groups = (module.groups || []).map((group) => {
    if (group.label !== "Fatura ve Belge") return group;
    if ((group.tabs || []).some(([key]) => key === tab[0])) return group;
    return { ...group, tabs: [tab, ...(group.tabs || [])] };
  });
  return { ...module, groups };
}`,
`function withEBelgeNavigation(module) {
  if (module.key !== "isnet") return module;
  const legacyTabs = [
    ...(module.groups || []).flatMap((group) => group.tabs || []),
    ...(module.hiddenTabs || []),
  ].filter(([key], index, rows) => rows.findIndex(([otherKey]) => otherKey === key) === index);
  return {
    ...module,
    label: "e-Belge Merkezi",
    icon: "dosya",
    groups: [
      {
        label: "e-Belge Merkezi",
        tabs: [["e-belge-merkezi", "e-Belge Merkezi", "dosya"]],
      },
    ],
    hiddenTabs: legacyTabs,
  };
}`
  ],
  [
`  muhasebe: {
    ...(BASE_ROUTE_ALIASES.muhasebe || {}),
    "e-belge": "e-belge-merkezi",
    "belge-merkezi": "e-belge-merkezi",
    "e-fatura": "e-belge-merkezi",
    "e-irsaliye": "e-belge-merkezi",
  },`,
`  muhasebe: {
    ...(BASE_ROUTE_ALIASES.muhasebe || {}),
  },
  isnet: {
    ...(BASE_ROUTE_ALIASES.isnet || {}),
    "e-belge": "e-belge-merkezi",
    "belge-merkezi": "e-belge-merkezi",
    "e-fatura": "e-belge-merkezi",
    "e-irsaliye": "e-belge-merkezi",
  },`
  ],
]);

rewrite("APP/app/ky-erp-frontend/src/pages/modules/MuhasebePage.jsx", [
  ['import EBelgeCenterPage from "./muhasebe/EBelgeCenterPage";\n', ""],
  ['  { key: "e-belge-merkezi", title: "e-Belge Merkezi", description: "Fatura, irsaliye, manuel belge yükleme, eşleştirme, kontrol, File Hub arşivi ve e-belge entegrasyonlarını tek merkezden yönetin." },\n', ""],
  ['  else if (current.key === "e-belge-merkezi") content = <EBelgeCenterPage activeMainCompany={activeMainCompany} openModule={openModule} />;\n', ""],
]);

rewrite("APP/app/ky-erp-frontend/src/pages/modules/muhasebe/EBelgeCenterPage.jsx", [
  ['<span className="eb-kicker">Muhasebe · e-Belge Merkezi</span>', '<span className="eb-kicker">e-Belge Merkezi</span>'],
]);

rewrite("APP/app/ky-erp-frontend/src/App.jsx", [
  [
`const IsnetPage = lazyWithRetry(
  () => import("./pages/modules/IsnetPage"),
  "isnet",
);`,
`const IsnetPage = lazyWithRetry(
  () => import("./pages/modules/IsnetPage"),
  "isnet",
);
const EBelgeCenterPage = lazyWithRetry(
  () => import("./pages/modules/muhasebe/EBelgeCenterPage"),
  "e-belge-center",
);`
  ],
  ['  isnet: () => import("./pages/modules/IsnetPage"),', '  isnet: () => Promise.all([import("./pages/modules/IsnetPage"), import("./pages/modules/muhasebe/EBelgeCenterPage")]),'],
  [
`    if (activeModule === "isnet") {
      return <IsnetPage activeTab={activeTab} {...sharedProps} />;
    }`,
`    if (activeModule === "isnet") {
      if (activeTab === "e-belge-merkezi") return <EBelgeCenterPage {...sharedProps} />;
      return <IsnetPage activeTab={activeTab} {...sharedProps} />;
    }`
  ],
]);

rewrite("APP/app/ky-erp-frontend/src/AppV3.jsx", [
  ['const IsnetPage = lazyWithRetry(() => import("./pages/modules/IsnetPage"), "isnet-v3");', 'const IsnetPage = lazyWithRetry(() => import("./pages/modules/IsnetPage"), "isnet-v3");\nconst EBelgeCenterPage = lazyWithRetry(() => import("./pages/modules/muhasebe/EBelgeCenterPage"), "e-belge-center-v1");'],
  [
`  isnet: () => Promise.all([
    import("./pages/modules/IsnetPage"),`,
`  isnet: () => Promise.all([
    import("./pages/modules/muhasebe/EBelgeCenterPage"),
    import("./pages/modules/IsnetPage"),`
  ],
  [
`    if (activeModule?.key === "isnet" && activeTab === "yonetim-merkezi") return <IsnetManagementCenterPage {...sharedProps} />;`,
`    if (activeModule?.key === "isnet" && activeTab === "e-belge-merkezi") return <EBelgeCenterPage {...sharedProps} />;
    if (activeModule?.key === "isnet" && activeTab === "yonetim-merkezi") return <IsnetManagementCenterPage {...sharedProps} />;`
  ],
]);

const registry = fs.readFileSync("APP/app/ky-erp-frontend/src/app/moduleRegistry.js", "utf8");
const accounting = fs.readFileSync("APP/app/ky-erp-frontend/src/pages/modules/MuhasebePage.jsx", "utf8");
const appV3 = fs.readFileSync("APP/app/ky-erp-frontend/src/AppV3.jsx", "utf8");
const center = fs.readFileSync("APP/app/ky-erp-frontend/src/pages/modules/muhasebe/EBelgeCenterPage.jsx", "utf8");
if (!registry.includes('label: "e-Belge Merkezi"') || !registry.includes('["e-belge-merkezi", "e-Belge Merkezi", "dosya"]')) throw new Error("e-Belge üst modül menüsü kurulmadı");
if (registry.includes('label: "e-Belge Entegrasyonları"')) throw new Error("Eski ayrı e-Belge Entegrasyonları modülü kaldı");
if (accounting.includes('key: "e-belge-merkezi"') || accounting.includes("<EBelgeCenterPage")) throw new Error("e-Belge Merkezi Muhasebe içinde kaldı");
if (!appV3.includes('activeModule?.key === "isnet" && activeTab === "e-belge-merkezi"')) throw new Error("V3 üst modül route'u bağlanmadı");
if (center.includes("Muhasebe · e-Belge Merkezi")) throw new Error("e-Belge üst başlığında Muhasebe etiketi kaldı");
console.log("e-Belge Merkezi üst modül yapısı kullanıcı kararına göre düzeltildi.");
