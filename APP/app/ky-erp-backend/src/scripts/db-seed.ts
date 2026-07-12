import { ensureMainCompany, prisma, runScript } from "./import-utils";

runScript("db-seed", async () => {
  const mainCompanies = [{ slug: "mecit-hakan", name: "Mecit Hakan" }];
  for (const company of mainCompanies) {
    await prisma.mainCompany.upsert({
      where: { slug: company.slug },
      create: company,
      update: { name: company.name, isActive: true },
    });
  }
  await ensureMainCompany("mecit-hakan");
  return { mainCompanies: mainCompanies.length };
});
