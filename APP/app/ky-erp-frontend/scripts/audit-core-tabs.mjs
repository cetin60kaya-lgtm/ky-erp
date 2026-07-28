import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const backendRoot = path.resolve(root, "../ky-erp-backend");
const failures = [];
const checks = [];

function read(relativePath, base = root) {
  const fullPath = path.resolve(base, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(`Dosya bulunamadı: ${path.relative(root, fullPath)}`);
    return "";
  }
  return fs.readFileSync(fullPath, "utf8");
}

function requireCheck(condition, message) {
  if (condition) checks.push(message);
  else failures.push(message);
}

function visibleTabs(module) {
  return module.groups?.flatMap((group) => group.tabs.map(([key]) => key)) || [];
}

const registryPath = path.resolve(root, "src/app/moduleRegistry.js");
const { MODULES } = await import(`${pathToFileURL(registryPath).href}?audit=${Date.now()}`);
const expected = {
  muhasebe: [
    "yonetim-ozeti", "firma-kartlari", "firma-yetkilileri", "envanter-urunleri",
    "gider-kategorileri", "tedarikci-faturalar", "kesilen-faturalar",
    "irsaliye-fatura-kontrol", "cari-hareketler", "cek-odeme", "mail-ekstre",
    "kar-zarar", "kdv-kontrol", "muhasebe-raporlari", "mail-sablonlari",
  ],
  isnet: ["yonetim-merkezi", "belge-merkezi", "is-akisi", "arsiv-gonderim", "ayarlar"],
  ik: [
    "ozet", "personel-kartlari", "mesai-avans", "puantaj-izin",
    "bordro-odeme", "sgk-evrak-kontrol", "gunluk-personel",
    "gunluk-personel-kartlari", "ik-raporlari", "gunluk-odeme-fisleri",
  ],
};

for (const [moduleKey, expectedTabs] of Object.entries(expected)) {
  const module = MODULES.find((item) => item.key === moduleKey);
  requireCheck(Boolean(module), `${moduleKey}: modül kaydı var`);
  if (!module) continue;
  const actualTabs = visibleTabs(module);
  requireCheck(
    JSON.stringify(actualTabs) === JSON.stringify(expectedTabs),
    `${moduleKey}: görünür sekme sırası ve anahtarları doğru`,
  );
  requireCheck(new Set(actualTabs).size === actualTabs.length, `${moduleKey}: mükerrer görünür sekme yok`);
}

const appV3 = read("src/AppV3.jsx");
const main = read("src/main.jsx");
const muhasebePage = read("src/pages/modules/MuhasebePage.jsx");
const smartMatchPage = read("src/pages/modules/muhasebe/MuhasebeSmartMatchPage.jsx");
const ikPage = read("src/pages/modules/IkPage.jsx");
const monthlyPersonnel = read("src/pages/modules/ik/MonthlyPersonnelWorkspace.jsx");
const monthlyOperations = read("src/pages/modules/ik/MonthlyOperationsWorkspaceV2.jsx");
const dailyWorkspace = read("src/pages/modules/ik/DailyHrWorkspace.jsx");

for (const tab of expected.muhasebe) {
  if (tab === "envanter-urunleri") {
    requireCheck(
      appV3.includes('activeTab === "envanter-urunleri"') && smartMatchPage.includes("MuhasebeSmartMatchPage"),
      `Muhasebe/${tab}: AppV3 ve akıllı eşleştirme sayfasına bağlı`,
    );
  } else {
    requireCheck(
      muhasebePage.includes(`currentTab === "${tab}"`),
      `Muhasebe/${tab}: gerçek render dalına bağlı`,
    );
  }
}

const isnetComponents = {
  "yonetim-merkezi": "IsnetManagementCenterPage",
  "belge-merkezi": "IsnetDocumentCenterPage",
  "is-akisi": "IsnetAutomationWorkflowPage",
  "arsiv-gonderim": "IsnetArchiveDeliveryPage",
  ayarlar: "IsnetSettingsMasterPage",
};
for (const [tab, component] of Object.entries(isnetComponents)) {
  requireCheck(
    appV3.includes(`activeTab === "${tab}"`) && appV3.includes(`<${component}`),
    `İşNet/${tab}: ${component} bileşenine bağlı`,
  );
}
requireCheck(
  appV3.includes('activeTab === "irsaliyeden-faturaya"') && appV3.includes("IsnetPreparedInvoicePage"),
  "İşNet/fatura önizleme: gizli güvenli rota bağlı",
);

const ikCombined = [ikPage, monthlyPersonnel, monthlyOperations, dailyWorkspace, main].join("\n");
for (const tab of expected.ik) {
  requireCheck(ikCombined.includes(tab), `İK/${tab}: bir çalışma alanında karşılığı var`);
}
for (const route of ["/ik/mesai-avans", "/ik/puantaj-izin", "/ik/bordro-odeme"]) {
  requireCheck(monthlyOperations.includes(route), `${route}: yeni aylık işlem merkezine bağlı`);
}
requireCheck(
  main.includes("MonthlyOperationsWorkspaceV2") && !main.includes("<MonthlyOperationsWorkspace />"),
  "İK aylık: eski işlem alanı yerine V2 kullanılıyor",
);
requireCheck(
  monthlyOperations.includes("hesaplaBordro") && monthlyOperations.includes("olusturBordro"),
  "İK bordro: hesaplama ve taslak kaydetme API'lerine bağlı",
);
requireCheck(
  monthlyOperations.includes("overtimeHourlyBase") && monthlyOperations.includes("225") && monthlyOperations.includes("300"),
  "İK mesai: 225/300 saat tabanı destekleniyor",
);
requireCheck(
  monthlyOperations.includes("1.5") && monthlyOperations.includes("? 2 : 1.5"),
  "İK mesai: hafta içi ×1,5 ve hafta sonu/resmî tatil ×2 kuralı var",
);

const ikApi = read("src/services/ikApi.js");
const ikController = read("src/ik/ik.controller.ts", backendRoot);
const ikEndpointPairs = [
  ["/ik/monthly-employees", "monthly-employees"],
  ["/ik/monthly-adjustments", "monthly-adjustments"],
  ["/ik/leaves", '"leaves"'],
  ["/ik/official-holidays", "official-holidays"],
  ["/ik/bordro/hesapla", "bordro/hesapla"],
  ["/ik/bordro/olustur", "bordro/olustur"],
  ["/ik/documents", '"documents"'],
];
for (const [frontendToken, backendToken] of ikEndpointPairs) {
  requireCheck(
    ikApi.includes(frontendToken) && ikController.includes(backendToken),
    `İK API: ${frontendToken} frontend ve controller karşılığı var`,
  );
}

const smartApi = read("src/services/muhasebeSmartMatchApi.js");
const smartController = read("src/muhasebe/muhasebe-smart-match.controller.ts", backendRoot);
for (const endpoint of [
  "summary", "company-aliases", "product-aliases", "pending-product-lines",
  "supplier-routing/sync", "lot-stock",
]) {
  requireCheck(
    smartApi.includes(endpoint) && smartController.includes(endpoint),
    `Muhasebe akıllı eşleştirme API: ${endpoint} çift taraflı bağlı`,
  );
}

const autoFlowApi = read("src/services/isnetAutoFlowApi.js");
const autoFlowController = read("src/muhasebe/isnet-auto-flow.controller.ts", backendRoot);
const autoFlowPairs = [
  ["/isnet/auto-flows", '@Controller("isnet/auto-flows")'],
  ["incoming/${encodeURIComponent(sourceId)}/prepare", "incoming/:sourceId/prepare"],
  ["${encodeURIComponent(flowId)}/model", ":id/model"],
  ["${encodeURIComponent(flowId)}/outgoing-draft", ":id/outgoing-draft"],
  ["${encodeURIComponent(flowId)}/outgoing-document-no", ":id/outgoing-document-no"],
  ["${encodeURIComponent(flowId)}/refresh", ":id/refresh"],
  ["${encodeURIComponent(flowId)}/invoice-state", ":id/invoice-state"],
];
for (const [frontendToken, backendToken] of autoFlowPairs) {
  requireCheck(
    autoFlowApi.includes(frontendToken) && autoFlowController.includes(backendToken),
    `İşNet otomatik akış API: ${backendToken} bağlı`,
  );
}

const muhasebeModule = read("src/muhasebe/muhasebe.module.ts", backendRoot);
for (const token of [
  "MuhasebeSmartMatchController", "MuhasebeSmartMatchService",
  "IsnetAutoFlowController", "IsnetDispatchFlowCoordinatorService",
  "IsnetBusinessSettingsController", "IsnetDocumentCenterController",
  "IsnetFullSyncController", "IsnetInvoicePreparationController",
  "IsnetSourceWorkflowController",
]) {
  requireCheck(muhasebeModule.includes(token), `Backend modül kaydı: ${token}`);
}

console.log(`Başarılı denetim: ${checks.length}`);
for (const item of checks) console.log(`OK  ${item}`);
if (failures.length) {
  console.error(`Başarısız denetim: ${failures.length}`);
  for (const item of failures) console.error(`HATA ${item}`);
  process.exit(1);
}
console.log("Muhasebe, İşNet ve İK sekme bağlantı denetimi tamamlandı.");
