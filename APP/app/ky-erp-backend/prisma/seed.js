const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const rows = [{ slug: "mecit-hakan", name: "Mecit Hakan" }];

  for (const row of rows) {
    await prisma.mainCompany.upsert({
      where: { slug: row.slug },
      create: {
        slug: row.slug,
        name: row.name,
      },
      update: {
        name: row.name,
        isActive: true,
      },
    });
  }

  console.log(
    JSON.stringify({ ok: true, seededMainCompanies: rows.length }, null, 2),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
