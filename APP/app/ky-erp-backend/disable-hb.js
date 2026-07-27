const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const hb = await prisma.mainCompany.findFirst({
    where: { OR: [{ slug: 'hakan-baski' }, { name: 'Hakan Baskı' }] }
  });
  if (hb) {
    await prisma.mainCompany.update({
      where: { id: hb.id },
      data: { isActive: false }
    });
    console.log('Hakan Baskı pasife alındı.');
  } else {
    console.log('Hakan Baskı bulunamadı.');
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
