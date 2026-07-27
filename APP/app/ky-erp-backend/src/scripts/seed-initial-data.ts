import { ModuleKey, PrismaClient, Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { DEFAULT_STORAGE_RULES } from "../storage/default-storage-rules";

const prisma = new PrismaClient();

const MAIN_COMPANY_ID = "main-mecit-hakan";
const MAIN_COMPANY_SLUG = "mecit-hakan";
const MAIN_COMPANY_NAME = "Mecit Hakan";
const INITIAL_ADMIN_USERNAME = String(
  process.env.INITIAL_ADMIN_USERNAME || "admin",
)
  .trim()
  .toLowerCase();
const INITIAL_ADMIN_PASSWORD = String(
  process.env.INITIAL_ADMIN_PASSWORD || "",
).trim();
const INITIAL_ADMIN_FULLNAME = String(
  process.env.INITIAL_ADMIN_FULLNAME || "Sistem Admin",
).trim();

const ALL_MODULE_KEYS = Object.values(ModuleKey);

async function seedInitialData() {
  const existingBySlug = await prisma.mainCompany.findUnique({
    where: { slug: MAIN_COMPANY_SLUG },
    select: { id: true },
  });

  const mainCompany = await prisma.mainCompany.upsert({
    where: { slug: MAIN_COMPANY_SLUG },
    create: {
      id: MAIN_COMPANY_ID,
      slug: MAIN_COMPANY_SLUG,
      name: MAIN_COMPANY_NAME,
      isActive: true,
    },
    update: {
      name: MAIN_COMPANY_NAME,
      isActive: true,
    },
  });

  const seededRules = [] as string[];
  for (const rule of DEFAULT_STORAGE_RULES) {
    const created = await prisma.fileStorageRule.upsert({
      where: {
        mainCompanyId_module_documentType: {
          mainCompanyId: mainCompany.id,
          module: rule.module,
          documentType: rule.documentType,
        },
      },
      create: {
        mainCompanyId: mainCompany.id,
        module: rule.module,
        documentType: rule.documentType,
        displayName: rule.displayName,
        targetPathTemplate: rule.targetPathTemplate,
        allowedExtensions: rule.allowedExtensions,
        maxFileSizeMb: rule.maxFileSizeMb ?? null,
        imageResizeEnabled: rule.imageResizeEnabled ?? false,
        imageMaxWidth: rule.imageMaxWidth ?? null,
        imageMaxHeight: rule.imageMaxHeight ?? null,
        thumbEnabled: rule.thumbEnabled ?? false,
        thumbWidth: rule.thumbWidth ?? null,
        thumbHeight: rule.thumbHeight ?? null,
        watchEnabled: rule.watchEnabled ?? false,
        watchSourcePath: rule.watchSourcePath ?? null,
        isActive: rule.isActive ?? true,
      },
      update: {
        displayName: rule.displayName,
        targetPathTemplate: rule.targetPathTemplate,
        allowedExtensions: rule.allowedExtensions,
        maxFileSizeMb: rule.maxFileSizeMb ?? null,
        imageResizeEnabled: rule.imageResizeEnabled ?? false,
        imageMaxWidth: rule.imageMaxWidth ?? null,
        imageMaxHeight: rule.imageMaxHeight ?? null,
        thumbEnabled: rule.thumbEnabled ?? false,
        thumbWidth: rule.thumbWidth ?? null,
        thumbHeight: rule.thumbHeight ?? null,
        watchEnabled: rule.watchEnabled ?? false,
        watchSourcePath: rule.watchSourcePath ?? null,
        isActive: rule.isActive ?? true,
      },
    });
    seededRules.push(`${created.module}:${created.documentType}`);
  }

  let adminResult: any = {
    skipped: true,
    reason: "INITIAL_ADMIN_PASSWORD tanımlı değil.",
  };

  if (INITIAL_ADMIN_PASSWORD) {
    const existingAdmin = await prisma.user.findUnique({
      where: { username: INITIAL_ADMIN_USERNAME },
      include: { permissions: true },
    });

    if (existingAdmin) {
      const existingPermissions = new Set(
        existingAdmin.permissions.map((item) => item.moduleKey),
      );

      const missingPermissionRows = ALL_MODULE_KEYS.filter(
        (moduleKey) => !existingPermissions.has(moduleKey),
      ).map((moduleKey) => ({
        userId: existingAdmin.id,
        moduleKey,
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canApprove: true,
      }));

      if (missingPermissionRows.length) {
        await prisma.userModulePermission.createMany({
          data: missingPermissionRows,        });
      }

      adminResult = {
        skipped: true,
        reason: "Admin kullanıcı zaten mevcut, şifre değiştirilmedi.",
        username: existingAdmin.username,
      };
    } else {
      const passwordHash = await bcrypt.hash(INITIAL_ADMIN_PASSWORD, 10);
      const adminUser = await prisma.user.create({
        data: {
          username: INITIAL_ADMIN_USERNAME,
          passwordHash,
          fullName: INITIAL_ADMIN_FULLNAME || "Sistem Admin",
          role: Role.ADMIN,
          isActive: true,
          mustChangePassword: false,
        },
      });

      await prisma.userModulePermission.createMany({
        data: ALL_MODULE_KEYS.map((moduleKey) => ({
          userId: adminUser.id,
          moduleKey,
          canView: true,
          canCreate: true,
          canUpdate: true,
          canDelete: true,
          canApprove: true,
        })),      });

      adminResult = {
        skipped: false,
        username: adminUser.username,
        role: adminUser.role,
        permissionsGranted: ALL_MODULE_KEYS.length,
      };
    }
  } else {
    console.warn(
      "[seed-initial-data] INITIAL_ADMIN_PASSWORD tanımlı olmadığı için admin oluşturma atlandı.",
    );
  }

  return {
    mainCompany: {
      requestedId: MAIN_COMPANY_ID,
      actualId: mainCompany.id,
      slug: mainCompany.slug,
      name: mainCompany.name,
      existedBefore: Boolean(existingBySlug),
      requestedIdMatched: mainCompany.id === MAIN_COMPANY_ID,
    },
    rulesSeeded: seededRules,
    totalRules: seededRules.length,
    admin: adminResult,
  };
}

seedInitialData()
  .then((result) => {
    console.log(
      "seed-initial-data tamamlandi",
      JSON.stringify(result, null, 2),
    );
  })
  .catch((error) => {
    console.error("seed-initial-data hatasi", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
