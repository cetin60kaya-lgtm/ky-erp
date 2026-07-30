import fs from "node:fs";

const appPath = "APP/app/ky-erp-frontend/src/App.jsx";
const pagePath = "APP/app/ky-erp-frontend/src/pages/desen/DesenPage.jsx";
let app = fs.readFileSync(appPath, "utf8").replace(/\r\n/g, "\n");
let page = fs.readFileSync(pagePath, "utf8").replace(/\r\n/g, "\n");

const tabAnchor = `      { key: "desen-raporlari", label: "Desen Raporları", icon: "raporlar" },`;
const tabNew = `${tabAnchor}
      { key: "desen-klasor-ayarlari", label: "Klasör Ayarları", icon: "ayarlar" },`;
if (!app.includes('key: "desen-klasor-ayarlari"')) {
  if (!app.includes(tabAnchor)) throw new Error("Desen rapor tab anchor bulunamadı");
  app = app.replace(tabAnchor, tabNew);
}

page = page.replace(
  `  const page =
    activeTab === "desen-modeller" ? (`,
  `  const page =
    activeTab === "desen-klasor-ayarlari" ? null : activeTab === "desen-modeller" ? (`,
);

page = page.replace(
  `  const title =
    activeTab === "desen-modeller"`,
  `  const title =
    activeTab === "desen-klasor-ayarlari"
      ? "Desen Görsel Klasör Ayarları"
      : activeTab === "desen-modeller"`,
);

page = page.replace(
  `  const showFolderSettings = !activeTab || activeTab === "gelen-desenler";`,
  `  const showFolderSettings =
    !activeTab ||
    activeTab === "gelen-desenler" ||
    activeTab === "desen-klasor-ayarlari";`,
);

const descriptionOld = `{activeTab === "desen-modeller"
                ? "Tüm modelleri, baskı bölgelerini ve hazırlık durumlarını tek merkezden yönetin."`;
const descriptionNew = `{activeTab === "desen-klasor-ayarlari"
                ? "Model oluşturulacak görsellerin gelen klasörünü, model arşivini ve hata klasörlerini test ederek kaydedin."
                : activeTab === "desen-modeller"
                  ? "Tüm modelleri, baskı bölgelerini ve hazırlık durumlarını tek merkezden yönetin."`;
if (!page.includes("Model oluşturulacak görsellerin gelen klasörünü")) {
  if (!page.includes(descriptionOld)) throw new Error("Desen açıklama anchor bulunamadı");
  page = page.replace(descriptionOld, descriptionNew);
}

fs.writeFileSync(appPath, app, "utf8");
fs.writeFileSync(pagePath, page, "utf8");
console.log("Desen klasör ayarları ayrı sekmeye çıkarıldı.");
