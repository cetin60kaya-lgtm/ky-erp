import { ensureMainCompany } from "./db-company-scope";

export async function createActivityLog(
  prisma: any,
  payload: {
    mainCompanySlug: string;
    entityType: string;
    entityId?: string | null;
    actionType: string;
    description?: string | null;
    oldValue?: any;
    newValue?: any;
    actor?: string | null;
  },
) {
  await ensureMainCompany(prisma, payload.mainCompanySlug);
  return prisma.activityLog.create({
    data: {
      mainCompanySlug: payload.mainCompanySlug,
      entityType: payload.entityType,
      entityId: payload.entityId || null,
      actionType: payload.actionType,
      description: payload.description || null,
      oldValue: payload.oldValue ?? undefined,
      newValue: payload.newValue ?? undefined,
      actor: payload.actor || "system",
    },
  });
}

export async function createJob(prisma: any, mainCompanySlug: string, type: string, payload?: any) {
  await ensureMainCompany(prisma, mainCompanySlug);
  return prisma.job.create({
    data: { mainCompanySlug, type, status: "PENDING", payload: payload ?? undefined },
  });
}

export async function updateJob(prisma: any, id: string, data: any) {
  return prisma.job.update({ where: { id }, data });
}
