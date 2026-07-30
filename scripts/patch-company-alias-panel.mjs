import fs from "node:fs";

const file = "APP/app/ky-erp-frontend/src/pages/modules/MuhasebePage.jsx";
let source = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");

const importAnchor = `import CekOdemeMerkeziPage from "../muhasebe/CekOdemeMerkeziPage";\n`;
const importLine = `import CompanyAliasPanel from "../muhasebe/CompanyAliasPanel";\n`;
if (!source.includes(importLine)) {
  if (!source.includes(importAnchor)) throw new Error("Muhasebe import anchor bulunamadı");
  source = source.replace(importAnchor, `${importAnchor}${importLine}`);
}

const oldBlock = `      {currentTab === "firma-kartlari" ? (\n        <CompanyCards\n          activeMainCompany={activeMainCompany}\n          refreshKey={refreshKey}\n          reloadAll={reloadAll}\n        />\n      ) : null}`;
const newBlock = `      {currentTab === "firma-kartlari" ? (\n        <>\n          <CompanyCards\n            activeMainCompany={activeMainCompany}\n            refreshKey={refreshKey}\n            reloadAll={reloadAll}\n          />\n          <CompanyAliasPanel\n            activeMainCompany={activeMainCompany}\n            refreshKey={refreshKey}\n          />\n        </>\n      ) : null}`;
if (!source.includes("<CompanyAliasPanel")) {
  if (!source.includes(oldBlock)) throw new Error("Firma kartları render bloğu bulunamadı");
  source = source.replace(oldBlock, newBlock);
}

fs.writeFileSync(file, source, "utf8");
console.log("Firma alias paneli Muhasebe sayfasına bağlandı.");
