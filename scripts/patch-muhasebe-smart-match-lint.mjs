import fs from "node:fs";

const file = "APP/app/ky-erp-frontend/src/pages/modules/muhasebe/MuhasebeSmartMatchPage.jsx";
const source = fs.readFileSync(file, "utf8");
const block = `  const ensureCompanies = useCallback(async () => {
    if (companies.length) return companies;
    const result = rowsOf(await fetchCompanies(activeMainCompany));
    setCompanies(result);
    return result;
  }, [activeMainCompany, companies]);

`;

if (!source.includes(block)) {
  console.log("Kullanılmayan ensureCompanies bloğu zaten kaldırılmış.");
  process.exit(0);
}

fs.writeFileSync(file, source.replace(block, ""), "utf8");
console.log("Kullanılmayan ensureCompanies bloğu kaldırıldı.");
