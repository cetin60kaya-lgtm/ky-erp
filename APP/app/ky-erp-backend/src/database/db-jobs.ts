import { ensureMainCompany } from "./db-company-scope";

export async function createJob(prisma: any, mainCompanySlug: string, type: string, payload?: any) {
  await ensureMainCompany(prisma, mainCompanySlug);
  return prisma.job.create({
    data: {
      mainCompanySlug,
      type,
      status: "PENDING",
      payload: payload ?? undefined,
    },
  });
}

export async function updateJob(prisma: any, id: string, data: any) {
  return prisma.job.update({ where: { id }, data });
}
