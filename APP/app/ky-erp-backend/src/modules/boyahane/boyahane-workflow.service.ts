import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

type Query = Record<string, any>;

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const numberValue = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const jsonObject = (value: unknown): Query =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Query) : {};
const dateKey = (value: unknown) => {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

@Injectable()
export class BoyahaneWorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: any) {
    return (tx || this.prisma) as any;
  }

  private requireSlug(payload: Query) {
    const slug = clean(payload.mainCompanySlug || payload.mainCompanyId);
    if (!slug) throw new BadRequestException("mainCompanySlug zorunludur.");
    return slug;
  }

  private actor(user: Query = {}) {
    return clean(user.username || user.fullName || user.id || "sistem");
  }

  private async log(
    db: any,
    slug: string,
    entityType: string,
    entityId: string,
    action: string,
    description: string,
    user: Query = {},
    oldValue?: unknown,
    newValue?: unknown,
  ) {
    return db.activityLog.create({
      data: {
        mainCompanySlug: slug,
        module: "BOYAHANE",
        entityType,
        entityId,
        action,
        actionType: action,
        description,
        actor: this.actor(user),
        oldValue: oldValue === undefined ? undefined : (oldValue as any),
        newValue: newValue === undefined ? undefined : (newValue as any),
      },
    });
  }

  private normalizeJobStatus(value: unknown) {
    const status = clean(value).toUpperCase();
    if (["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED", "WAITING"].includes(status)) return status;
    return status === "REVISION_PENDING" ? "PAUSED" : "WAITING";
  }

  private normalizeColorStatus(value: unknown) {
    const status = clean(value).toUpperCase();
    return ["WAITING", "DRAFT", "PREPARING", "COMPLETED", "CANCELLED"].includes(status)
      ? status
      : "WAITING";
  }

  private async ensureJobColors(job: any) {
    const db = this.db();
    const current = await db.dyehouseColor.findMany({
      where: { mainCompanySlug: job.mainCompanySlug, dyehouseModelId: job.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    const workflow = jsonObject(jsonObject(job.raw).designWorkflow);
    const operationId = clean(workflow.printAreaId);
    if (!operationId) return current;

    const [groups, channels] = await Promise.all([
      db.designColorGroup.findMany({ where: { operationId }, orderBy: { createdAt: "asc" } }).catch(() => []),
      db.designOperationChannel.findMany({
        where: { operationId, included: true },
        orderBy: { sequence: "asc" },
      }).catch(() => []),
    ]);
    const sources = groups.length
      ? groups.map((row: any) => ({
          key: `group:${row.id}`,
          name: row.displayName,
          code: row.colorCode,
          registeredColorId: row.registeredColorId,
          moldCount: row.moldCount,
          raw: row,
        }))
      : channels.map((row: any) => ({
          key: `channel:${row.id}`,
          name: row.normalizedName || row.rawName,
          code: row.colorCode,
          registeredColorId: row.registeredColorId,
          moldCount: 1,
          raw: row,
        }));
    if (!sources.length) return current;

    const registeredIds = [...new Set(sources.map((row: any) => clean(row.registeredColorId)).filter(Boolean))];
    const [registeredRows, recipes] = await Promise.all([
      registeredIds.length
        ? db.registeredColor.findMany({ where: { id: { in: registeredIds }, deletedAt: null } })
        : [],
      registeredIds.length
        ? db.dyeRecipe.findMany({
            where: { mainCompanySlug: job.mainCompanySlug, registeredColorId: { in: registeredIds }, deletedAt: null },
            orderBy: { createdAt: "desc" },
          })
        : [],
    ]);
    const registeredById = new Map(registeredRows.map((row: any) => [row.id, row]));
    const existingKeys = new Set(current.map((row: any) => row.sourceChannelKey));
    for (const source of sources) {
      if (existingKeys.has(source.key)) continue;
      const registered = registeredById.get(source.registeredColorId) as any;
      const recipe = recipes.find((row: any) => row.registeredColorId === source.registeredColorId && row.status === "ACTIVE")
        || recipes.find((row: any) => row.registeredColorId === source.registeredColorId);
      await db.dyehouseColor.create({
        data: {
          mainCompanySlug: job.mainCompanySlug,
          dyehouseModelId: job.id,
          registeredColorId: registered?.id || null,
          sourceChannelKey: source.key,
          colorName: clean(registered?.colorName || source.name || source.code || "Tanımsız Renk"),
          pantone: clean(registered?.pantone || source.code) || null,
          paintType: clean(recipe?.dyeType || registered?.dyeType || "SUBAZLI"),
          recipeId: recipe?.id || null,
          printRegion: clean(job.printRegion || workflow.printAreaCode || workflow.printAreaName) || null,
          plannedKg: 0,
          status: "WAITING",
          raw: { source: source.raw, moldCount: source.moldCount },
        },
      });
    }
    return db.dyehouseColor.findMany({
      where: { mainCompanySlug: job.mainCompanySlug, dyehouseModelId: job.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
  }

  private async mapJob(job: any, companyName = "") {
    const raw = jsonObject(job.raw);
    const workflow = jsonObject(raw.designWorkflow);
    const colors = await this.ensureJobColors(job);
    const prepared = colors.filter((row: any) => row.status === "COMPLETED").length;
    const modelName = clean(workflow.modelName || job.modelName).replace(/\s*\/\s*[^/]+$/, "") || job.modelName;
    return {
      ...job,
      status: this.normalizeJobStatus(job.status),
      modelCardId: job.modelCardId || workflow.modelId || null,
      designId: job.designId || workflow.modelId || null,
      companyId: job.companyId || workflow.companyId || null,
      companyName: companyName || clean(raw.companyName || workflow.companyName),
      orderId: job.orderId || raw.orderId || null,
      orderNo: job.orderNo || raw.orderNo || "",
      printRegion: job.printRegion || workflow.printAreaName || workflow.printAreaCode || "",
      plannedQuantity: numberValue(job.plannedQuantity || raw.plannedQuantity),
      channelCount: numberValue(job.channelCount || workflow.totalChannelCount),
      uniqueColorCount: numberValue(job.uniqueColorCount || workflow.uniqueColorCount || colors.length),
      moldCount: numberValue(job.moldCount || workflow.totalMoldCount),
      modelName,
      imageUrl: clean(raw.imageUrl || workflow.modelImage),
      channelImageUrl: clean(workflow.channelImage),
      preparedColorCount: prepared,
      pendingColorCount: colors.filter((row: any) => !["COMPLETED", "CANCELLED"].includes(row.status)).length,
      plannedPaintKg: colors.reduce((sum: number, row: any) => sum + numberValue(row.plannedKg), 0),
      colors: colors.map((row: any) => ({ ...row, status: this.normalizeColorStatus(row.status) })),
    };
  }

  private async withProductionImages(rows: any[], slug: string) {
    const jobIds = [...new Set(rows.map((row: any) => clean(row.jobId)).filter(Boolean))];
    const jobs = jobIds.length
      ? await this.db().dyehouseModel.findMany({ where: { mainCompanySlug: slug, id: { in: jobIds } } })
      : [];
    const jobById = new Map(jobs.map((job: any) => [String(job.id), job]));
    return rows.map((row: any) => {
      const job: any = jobById.get(clean(row.jobId));
      const workflow = jsonObject(jsonObject(job?.raw).designWorkflow);
      return {
        ...row,
        imageUrl: clean(jsonObject(job?.raw).imageUrl || workflow.modelImage),
        designId: clean(job?.designId || workflow.modelId) || null,
      };
    });
  }

  async listJobs(query: Query) {
    const slug = this.requireSlug(query);
    const rows = await this.db().dyehouseModel.findMany({
      where: {
        mainCompanySlug: slug,
        ...(clean(query.status) ? { status: clean(query.status) } : {}),
      },
      orderBy: [{ createdAt: "desc" }],
    });
    const companyIds = [...new Set(rows.map((row: any) => clean(row.companyId || jsonObject(jsonObject(row.raw).designWorkflow).companyId)).filter(Boolean))];
    const companies = companyIds.length
      ? await this.db().company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })
      : [];
    const companyById = new Map<string, string>(companies.map((row: any) => [String(row.id), String(row.name || "")]));
    const jobs = await Promise.all(rows.map((row: any) => {
      const companyId = clean(row.companyId || jsonObject(jsonObject(row.raw).designWorkflow).companyId);
      return this.mapJob(row, companyById.get(companyId) || "");
    }));
    return jobs.filter((row) => !clean(query.status) || row.status === clean(query.status).toUpperCase());
  }

  async getJob(id: string, query: Query) {
    const slug = this.requireSlug(query);
    const job = await this.db().dyehouseModel.findFirst({ where: { id, mainCompanySlug: slug } });
    if (!job) throw new NotFoundException("Boyahane işi bulunamadı.");
    const companyId = job.companyId || jsonObject(jsonObject(job.raw).designWorkflow).companyId;
    const company = companyId ? await this.db().company.findUnique({ where: { id: companyId } }) : null;
    return this.mapJob(job, company?.name || "");
  }

  async updateJob(id: string, body: Query, user: Query = {}) {
    const slug = this.requireSlug(body);
    const current = await this.db().dyehouseModel.findFirst({ where: { id, mainCompanySlug: slug } });
    if (!current) throw new NotFoundException("Boyahane işi bulunamadı.");
    const data: Query = {};
    if (body.priority !== undefined) data.priority = clean(body.priority).toUpperCase() || "NORMAL";
    if (body.status !== undefined) data.status = this.normalizeJobStatus(body.status);
    if (body.plannedQuantity !== undefined) data.plannedQuantity = numberValue(body.plannedQuantity);
    const updated = await this.db().dyehouseModel.update({ where: { id }, data });
    await this.log(this.db(), slug, "DYEHOUSE_JOB", id, "JOB_UPDATED", "Boyahane işi güncellendi.", user, current, updated);
    return this.getJob(id, body);
  }

  async startJob(id: string, body: Query, user: Query = {}) {
    const slug = this.requireSlug(body);
    return this.prisma.$transaction(async (tx) => {
      const db = this.db(tx);
      const job = await db.dyehouseModel.findFirst({ where: { id, mainCompanySlug: slug } });
      if (!job) throw new NotFoundException("Boyahane işi bulunamadı.");
      const active = await db.dyehouseModel.findFirst({ where: { mainCompanySlug: slug, status: "ACTIVE", NOT: { id } } });
      if (active && body.force !== true) {
        throw new BadRequestException(`Önce ${active.modelName} aktif işini beklemeye alın veya geçişi onaylayın.`);
      }
      if (active) await db.dyehouseModel.update({ where: { id: active.id }, data: { status: "PAUSED" } });
      const updated = await db.dyehouseModel.update({ where: { id }, data: { status: "ACTIVE", startedAt: job.startedAt || new Date() } });
      await this.log(db, slug, "DYEHOUSE_JOB", id, "JOB_STARTED", "Boyahane işi başlatıldı.", user, job.status, "ACTIVE");
      return updated;
    });
  }

  async completeJob(id: string, body: Query, user: Query = {}) {
    const slug = this.requireSlug(body);
    const colors = await this.db().dyehouseColor.findMany({ where: { mainCompanySlug: slug, dyehouseModelId: id, deletedAt: null } });
    if (!colors.length || colors.some((row: any) => !["COMPLETED", "CANCELLED"].includes(row.status))) {
      throw new BadRequestException("Tüm model renkleri tamamlanmadan iş kapatılamaz.");
    }
    const updated = await this.db().dyehouseModel.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await this.log(this.db(), slug, "DYEHOUSE_JOB", id, "MODEL_COMPLETED", "Modelin Boyahane işi tamamlandı.", user);
    return updated;
  }

  async addJobColor(jobId: string, body: Query, user: Query = {}) {
    const slug = this.requireSlug(body);
    const job = await this.db().dyehouseModel.findFirst({ where: { id: jobId, mainCompanySlug: slug } });
    if (!job) throw new NotFoundException("Boyahane işi bulunamadı.");
    const registered = body.registeredColorId
      ? await this.db().registeredColor.findFirst({ where: { id: clean(body.registeredColorId), mainCompanySlug: slug, deletedAt: null } })
      : null;
    const recipe = body.recipeId
      ? await this.db().dyeRecipe.findFirst({ where: { id: clean(body.recipeId), mainCompanySlug: slug, deletedAt: null } })
      : null;
    const colorName = clean(registered?.colorName || body.colorName);
    if (!colorName) throw new BadRequestException("Renk adı zorunludur.");
    const row = await this.db().dyehouseColor.create({
      data: {
        mainCompanySlug: slug,
        dyehouseModelId: jobId,
        registeredColorId: registered?.id || null,
        sourceChannelKey: `manual:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
        colorName,
        pantone: clean(registered?.pantone || body.pantone) || null,
        paintType: clean(recipe?.dyeType || registered?.dyeType || body.paintType || "SUBAZLI"),
        recipeId: recipe?.id || null,
        printRegion: clean(body.printRegion || job.printRegion) || null,
        plannedKg: numberValue(body.plannedKg),
        status: "WAITING",
        raw: { addedManually: true },
      },
    });
    await this.log(this.db(), slug, "DYEHOUSE_COLOR", row.id, "COLOR_ADDED", `${colorName} işe eklendi.`, user);
    return row;
  }

  async updateJobColor(id: string, body: Query, user: Query = {}) {
    const slug = this.requireSlug(body);
    const current = await this.db().dyehouseColor.findFirst({ where: { id, mainCompanySlug: slug, deletedAt: null } });
    if (!current) throw new NotFoundException("İş rengi bulunamadı.");
    const updated = await this.db().dyehouseColor.update({
      where: { id },
      data: {
        ...(body.status !== undefined ? { status: this.normalizeColorStatus(body.status) } : {}),
        ...(body.plannedKg !== undefined ? { plannedKg: numberValue(body.plannedKg) } : {}),
        ...(body.recipeId !== undefined ? { recipeId: clean(body.recipeId) || null } : {}),
        ...(body.registeredColorId !== undefined ? { registeredColorId: clean(body.registeredColorId) || null } : {}),
        ...(body.paintType !== undefined ? { paintType: clean(body.paintType) } : {}),
      },
    });
    await this.log(this.db(), slug, "DYEHOUSE_COLOR", id, "COLOR_UPDATED", "İş rengi güncellendi.", user, current, updated);
    return updated;
  }

  async deleteJobColor(id: string, query: Query, user: Query = {}) {
    const slug = this.requireSlug(query);
    const production = await this.db().dyeProduction.findFirst({ where: { mainCompanySlug: slug, jobColorId: id } });
    if (production) throw new BadRequestException("Bu renk için üretim kaydı bulunmaktadır. Silinemez.");
    const row = await this.db().dyehouseColor.update({ where: { id }, data: { deletedAt: new Date(), status: "CANCELLED" } });
    await this.log(this.db(), slug, "DYEHOUSE_COLOR", id, "COLOR_DELETED", "Üretim yapılmamış renk işten çıkarıldı.", user);
    return row;
  }

  async listColors(query: Query) {
    const slug = this.requireSlug(query);
    const q = clean(query.q).toLocaleLowerCase("tr-TR");
    const colors = await this.db().registeredColor.findMany({
      where: { mainCompanySlug: slug, deletedAt: null, ...(clean(query.status) ? { status: clean(query.status) } : {}) },
      orderBy: [{ updatedAt: "desc" }],
    });
    const ids = colors.map((row: any) => row.id);
    const [recipes, productions] = await Promise.all([
      ids.length ? this.db().dyeRecipe.findMany({ where: { mainCompanySlug: slug, registeredColorId: { in: ids }, deletedAt: null }, orderBy: { createdAt: "desc" } }) : [],
      ids.length ? this.db().dyeProduction.findMany({ where: { mainCompanySlug: slug, colorId: { in: ids } }, orderBy: { createdAt: "desc" } }) : [],
    ]);
    return colors
      .filter((row: any) => !q || [row.pantone, row.colorName, row.customerColorCode, row.dyeType].some((value) => clean(value).toLocaleLowerCase("tr-TR").includes(q)))
      .map((row: any) => {
        const colorRecipes = recipes.filter((recipe: any) => recipe.registeredColorId === row.id);
        const usage = productions.filter((production: any) => production.colorId === row.id);
        return {
          ...row,
          recipes: colorRecipes,
          paintTypes: [...new Set(colorRecipes.map((recipe: any) => recipe.dyeType).filter(Boolean))],
          versionCount: colorRecipes.length,
          activeVersion: colorRecipes.find((recipe: any) => recipe.status === "ACTIVE")?.version || "-",
          usageCount: usage.length,
          totalPreparedKg: usage.reduce((sum: number, item: any) => sum + numberValue(item.productionTotalKg), 0),
          lastUsedAt: usage[0]?.createdAt || null,
        };
      });
  }

  async getColor(id: string, query: Query) {
    const slug = this.requireSlug(query);
    const color = await this.db().registeredColor.findFirst({ where: { id, mainCompanySlug: slug, deletedAt: null } });
    if (!color) throw new NotFoundException("Kayıtlı renk bulunamadı.");
    const [recipes, productions, revisions] = await Promise.all([
      this.listRecipes(id, query),
      this.db().dyeProduction.findMany({ where: { mainCompanySlug: slug, colorId: id }, orderBy: { createdAt: "desc" } }),
      this.db().activityLog.findMany({ where: { mainCompanySlug: slug, module: "BOYAHANE", entityType: "DYE_RECIPE", actionType: { in: ["RECIPE_VERSION_CREATED", "RECIPE_UPDATED"] } }, orderBy: { createdAt: "desc" } }),
    ]);
    return { ...color, recipes, productions: await this.withProductionImages(productions, slug), revisions };
  }

  async createColor(body: Query, user: Query = {}) {
    const slug = this.requireSlug(body);
    const pantone = clean(body.pantone);
    const colorName = clean(body.colorName || body.name);
    if (!pantone || !colorName) throw new BadRequestException("Pantone ve renk adı zorunludur.");
    const existing = await this.db().registeredColor.findFirst({ where: { mainCompanySlug: slug, pantone, deletedAt: null } });
    if (existing) return existing;
    const row = await this.db().registeredColor.create({
      data: {
        mainCompanyId: clean(body.mainCompanyId) || null,
        mainCompanySlug: slug,
        pantone,
        colorName,
        customerColorCode: clean(body.customerColorCode) || null,
        colorHex: clean(body.colorHex || body.hex || "#CBD5E1"),
        dyeType: clean(body.paintType || body.dyeType || "SUBAZLI"),
        version: "V1",
        status: "ACTIVE",
      },
    });
    await this.log(this.db(), slug, "REGISTERED_COLOR", row.id, "COLOR_CREATED", `${pantone} renk kartı oluşturuldu.`, user);
    return row;
  }

  private recipeLines(db: any, recipeId: string) {
    return db.dyeRecipeLine.findMany({ where: { recipeId, deletedAt: null }, orderBy: { createdAt: "asc" } });
  }

  async listRecipes(colorId: string, query: Query) {
    const slug = this.requireSlug(query);
    const rows = await this.db().dyeRecipe.findMany({
      where: { mainCompanySlug: slug, registeredColorId: colorId, deletedAt: null },
      orderBy: [{ dyeType: "asc" }, { createdAt: "desc" }],
    });
    return Promise.all(rows.map(async (row: any) => ({ ...row, lines: await this.recipeLines(this.db(), row.id) })));
  }

  private normalizeRecipeLines(lines: any[]) {
    return (Array.isArray(lines) ? lines : [])
      .map((row) => ({
        productId: clean(row.productId || row.inventoryId),
        productName: clean(row.productName),
        referenceGram: numberValue(row.referenceGram ?? row.trialTotalGr ?? row.totalGr),
        lotId: clean(row.lotId),
      }))
      .filter((row) => row.productId || row.productName)
      .sort((a, b) => `${a.productId}|${a.productName}`.localeCompare(`${b.productId}|${b.productName}`, "tr"));
  }

  async compareRecipe(colorId: string, body: Query) {
    const slug = this.requireSlug(body);
    const paintType = clean(body.paintType || body.dyeType).toUpperCase();
    const incoming = this.normalizeRecipeLines(body.lines);
    const recipes = await this.db().dyeRecipe.findMany({ where: { mainCompanySlug: slug, registeredColorId: colorId, dyeType: paintType, deletedAt: null }, orderBy: { createdAt: "desc" } });
    for (const recipe of recipes) {
      const existing = this.normalizeRecipeLines(await this.recipeLines(this.db(), recipe.id));
      if (JSON.stringify(existing.map(({ lotId: _lot, ...row }) => row)) === JSON.stringify(incoming.map(({ lotId: _lot, ...row }) => row))) {
        return { exactMatch: true, recipe: { ...recipe, lines: existing }, differences: [] };
      }
    }
    const base = recipes[0] || null;
    const oldLines = base ? this.normalizeRecipeLines(await this.recipeLines(this.db(), base.id)) : [];
    const keys = new Set([...oldLines, ...incoming].map((row) => row.productId || row.productName));
    const differences = [...keys].map((key) => {
      const oldRow = oldLines.find((row) => (row.productId || row.productName) === key);
      const newRow = incoming.find((row) => (row.productId || row.productName) === key);
      const oldGram = numberValue(oldRow?.referenceGram);
      const newGram = numberValue(newRow?.referenceGram);
      return { productId: newRow?.productId || oldRow?.productId, productName: newRow?.productName || oldRow?.productName, oldGram, newGram, difference: newGram - oldGram };
    });
    return { exactMatch: false, recipe: base ? { ...base, lines: oldLines } : null, differences };
  }

  async createRecipeVersion(colorId: string, body: Query, user: Query = {}) {
    const slug = this.requireSlug(body);
    const color = await this.db().registeredColor.findFirst({ where: { id: colorId, mainCompanySlug: slug, deletedAt: null } });
    if (!color) throw new NotFoundException("Kayıtlı renk bulunamadı.");
    const paintType = clean(body.paintType || body.dyeType || color.dyeType || "SUBAZLI").toUpperCase();
    const lines = this.normalizeRecipeLines(body.lines);
    if (!lines.length || lines.some((row) => !row.productId || row.referenceGram <= 0)) {
      throw new BadRequestException("Reçete ürünleri ve sıfırdan büyük referans gramajları zorunludur.");
    }
    return this.prisma.$transaction(async (tx) => {
      const db = this.db(tx);
      const existing = await db.dyeRecipe.findMany({ where: { mainCompanySlug: slug, registeredColorId: colorId, dyeType: paintType, deletedAt: null } });
      const nextNo = Math.max(0, ...existing.map((row: any) => Number(clean(row.version).replace(/\D/g, "")) || 0)) + 1;
      if (body.makeActive !== false) {
        await db.dyeRecipe.updateMany({ where: { mainCompanySlug: slug, registeredColorId: colorId, dyeType: paintType, status: "ACTIVE", deletedAt: null }, data: { status: "OLD" } });
      }
      const recipe = await db.dyeRecipe.create({
        data: {
          mainCompanyId: clean(body.mainCompanyId) || color.mainCompanyId,
          mainCompanySlug: slug,
          registeredColorId: colorId,
          modelOrderId: clean(body.modelOrderId || body.jobId) || null,
          modelColorId: clean(body.jobColorId) || null,
          colorName: color.colorName,
          customerColorCode: color.customerColorCode,
          pantone: color.pantone,
          dyeType: paintType,
          version: `V${nextNo}`,
          status: body.makeActive === false ? "TRIAL" : "ACTIVE",
        },
      });
      await db.dyeRecipeLine.createMany({
        data: lines.map((line, index) => ({
          mainCompanyId: clean(body.mainCompanyId) || color.mainCompanyId,
          mainCompanySlug: slug,
          recipeId: recipe.id,
          inventoryId: line.productId,
          productName: line.productName,
          trialTotalGr: line.referenceGram,
          totalGr: line.referenceGram,
          percent: lines.reduce((sum, item) => sum + item.referenceGram, 0) ? line.referenceGram / lines.reduce((sum, item) => sum + item.referenceGram, 0) * 100 : 0,
          lotId: line.lotId || null,
          dyeType: paintType,
          status: "ACTIVE",
        })),
      });
      await this.log(db, slug, "DYE_RECIPE", recipe.id, "RECIPE_VERSION_CREATED", `${color.pantone || color.colorName} için ${recipe.version} oluşturuldu.`, user, undefined, { colorId, paintType, version: recipe.version, lines });
      return { ...recipe, lines };
    });
  }

  async updateRecipe(id: string, body: Query, user: Query = {}) {
    const slug = this.requireSlug(body);
    if (clean(user.role).toUpperCase() !== "ADMIN") throw new ForbiddenException("Mevcut reçete versiyonunu yalnız yönetici güncelleyebilir.");
    const current = await this.db().dyeRecipe.findFirst({ where: { id, mainCompanySlug: slug, deletedAt: null } });
    if (!current) throw new NotFoundException("Reçete bulunamadı.");
    const oldLines = await this.recipeLines(this.db(), id);
    const lines = this.normalizeRecipeLines(body.lines);
    await this.prisma.$transaction(async (tx) => {
      const db = this.db(tx);
      await db.dyeRecipeLine.updateMany({ where: { recipeId: id, deletedAt: null }, data: { deletedAt: new Date() } });
      const total = lines.reduce((sum, row) => sum + row.referenceGram, 0);
      await db.dyeRecipeLine.createMany({ data: lines.map((line) => ({ mainCompanyId: current.mainCompanyId, mainCompanySlug: slug, recipeId: id, inventoryId: line.productId, productName: line.productName, trialTotalGr: line.referenceGram, totalGr: line.referenceGram, percent: total ? line.referenceGram / total * 100 : 0, lotId: line.lotId || null, dyeType: current.dyeType, status: "ACTIVE" })) });
      await this.log(db, slug, "DYE_RECIPE", id, "RECIPE_UPDATED", "Geçmiş üretim snapshotları korunarak reçete güncellendi.", user, oldLines, lines);
    });
    return { ...current, lines };
  }

  async listProducts(query: Query) {
    const slug = this.requireSlug(query);
    const rows = await this.db().approvedChemicalInventory.findMany({ where: { mainCompanySlug: slug, deletedAt: null, canUseInRecipe: true }, orderBy: { productName: "asc" } });
    return rows;
  }

  async listLots(query: Query) {
    const slug = this.requireSlug(query);
    return this.db().chemicalLot.findMany({
      where: { mainCompanySlug: slug, deletedAt: null, ...(clean(query.productId) ? { inventoryId: clean(query.productId) } : {}) },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
  }

  async createLot(body: Query, user: Query = {}) {
    const slug = this.requireSlug(body);
    const inventoryId = clean(body.inventoryId || body.productId);
    const product = await this.db().approvedChemicalInventory.findFirst({ where: { id: inventoryId, mainCompanySlug: slug, deletedAt: null } });
    if (!product) throw new BadRequestException("Geçerli bir Boyahane ürünü seçin.");
    const lotNo = clean(body.lotNo);
    const entryKg = numberValue(body.entryKg || body.inputKg);
    if (!lotNo || entryKg <= 0) throw new BadRequestException("Lot numarası ve sıfırdan büyük giriş KG zorunludur.");
    return this.prisma.$transaction(async (tx) => {
      const db = this.db(tx);
      if (body.isDefault === true) await db.chemicalLot.updateMany({ where: { mainCompanySlug: slug, inventoryId, deletedAt: null }, data: { isDefault: false } });
      const lot = await db.chemicalLot.create({ data: { mainCompanyId: clean(body.mainCompanyId) || product.mainCompanyId, mainCompanySlug: slug, inventoryId, productName: product.productName, dyeType: product.dyeType, lotNo, supplierName: clean(body.supplierName || body.companyName) || null, invoiceNo: clean(body.invoiceNo) || null, entryKg, usedKg: 0, remainingKg: entryKg, isDefault: body.isDefault === true, status: "ACTIVE" } });
      await this.log(db, slug, "CHEMICAL_LOT", lot.id, "LOT_CREATED", `${product.productName} / ${lotNo} lotu oluşturuldu.`, user);
      return lot;
    });
  }

  async updateLotAction(id: string, body: Query, user: Query = {}) {
    const slug = this.requireSlug(body);
    const lot = await this.db().chemicalLot.findFirst({ where: { id, mainCompanySlug: slug, deletedAt: null } });
    if (!lot) throw new NotFoundException("Lot bulunamadı.");
    const action = clean(body.action).toUpperCase();
    return this.prisma.$transaction(async (tx) => {
      const db = this.db(tx);
      if (action === "SET_DEFAULT") {
        await db.chemicalLot.updateMany({ where: { mainCompanySlug: slug, inventoryId: lot.inventoryId, deletedAt: null }, data: { isDefault: false } });
      }
      const data = action === "SET_DEFAULT" ? { isDefault: true, status: "ACTIVE" }
        : action === "FINISH" ? { isDefault: false, status: "FINISHED" }
          : action === "DEACTIVATE" ? { isDefault: false, status: "PASSIVE" }
            : { status: clean(body.status || lot.status), isDefault: body.isDefault ?? lot.isDefault };
      const updated = await db.chemicalLot.update({ where: { id }, data });
      await this.log(db, slug, "CHEMICAL_LOT", id, `LOT_${action || "UPDATED"}`, "Lot durumu güncellendi.", user, lot, updated);
      return updated;
    });
  }

  async createProduction(body: Query, user: Query = {}) {
    const slug = this.requireSlug(body);
    const requestId = clean(body.requestId || body.idempotencyKey);
    if (!requestId) throw new BadRequestException("requestId zorunludur.");
    const incomingLines = this.normalizeRecipeLines(body.lines);
    if (!incomingLines.length || incomingLines.some((row) => !row.productId || !row.lotId || row.referenceGram <= 0)) {
      throw new BadRequestException("Tüm ürün, gramaj ve lot alanları zorunludur.");
    }
    const multiplier = numberValue(body.multiplier);
    if (multiplier <= 0) throw new BadRequestException("Çarpan sıfırdan büyük olmalıdır.");
    return this.prisma.$transaction(async (tx) => {
      const db = this.db(tx);
      const duplicate = await db.dyeProduction.findUnique({ where: { mainCompanySlug_requestId: { mainCompanySlug: slug, requestId } } });
      if (duplicate) return { production: duplicate, duplicate: true };
      const [job, jobColor] = await Promise.all([
        db.dyehouseModel.findFirst({ where: { id: clean(body.jobId), mainCompanySlug: slug } }),
        db.dyehouseColor.findFirst({ where: { id: clean(body.jobColorId), mainCompanySlug: slug, deletedAt: null } }),
      ]);
      if (!job || !jobColor || jobColor.dyehouseModelId !== job.id) throw new BadRequestException("Geçerli iş ve model rengi seçin.");
      if (jobColor.status === "COMPLETED") throw new BadRequestException("Bu renk için üretim daha önce tamamlanmış.");
      const lots = await db.chemicalLot.findMany({ where: { id: { in: incomingLines.map((row) => row.lotId) }, mainCompanySlug: slug, deletedAt: null } });
      const products = await db.approvedChemicalInventory.findMany({ where: { id: { in: incomingLines.map((row) => row.productId) }, mainCompanySlug: slug, deletedAt: null } });
      const referenceTotal = incomingLines.reduce((sum, row) => sum + row.referenceGram, 0);
      const productionLines = incomingLines.map((line) => {
        const product = products.find((row: any) => row.id === line.productId);
        const lot = lots.find((row: any) => row.id === line.lotId);
        if (!product) throw new BadRequestException(`${line.productName || "Ürün"} Boyahane ürün kartında bulunamadı.`);
        if (!lot || lot.inventoryId !== product.id || lot.status !== "ACTIVE") throw new BadRequestException(`${product.productName} için aktif lot zorunludur.`);
        const productionGram = line.referenceGram * multiplier;
        const productionKg = productionGram / 1000;
        const remainingKg = numberValue(lot.remainingKg);
        if (remainingKg + 0.000001 < productionKg) throw new BadRequestException(`${product.productName} / ${lot.lotNo} lotunda ${(productionKg - remainingKg).toFixed(3)} KG stok eksik.`);
        return { ...line, productName: product.productName, lot, productionGram, productionKg, percentage: referenceTotal ? line.referenceGram / referenceTotal * 100 : 0 };
      });
      const productionTotalGram = productionLines.reduce((sum, row) => sum + row.productionGram, 0);
      const workflow = jsonObject(jsonObject(job.raw).designWorkflow);
      const recipe = body.recipeId ? await db.dyeRecipe.findFirst({ where: { id: clean(body.recipeId), mainCompanySlug: slug, deletedAt: null } }) : null;
      const snapshot = { pantone: clean(body.pantone || jobColor.pantone), colorName: clean(body.colorName || jobColor.colorName), paintType: clean(body.paintType || jobColor.paintType), version: clean(body.version || recipe?.version || "V1"), referenceTotalGram: referenceTotal, multiplier, productionTotalGram, productionTotalKg: productionTotalGram / 1000, lines: productionLines.map((line) => ({ productId: line.productId, productName: line.productName, referenceGram: line.referenceGram, percentage: line.percentage, productionGram: line.productionGram, productionKg: line.productionKg, lotId: line.lot.id, lotNo: line.lot.lotNo })) };
      const production = await db.dyeProduction.create({ data: { mainCompanySlug: slug, requestId, jobId: job.id, jobColorId: jobColor.id, colorId: clean(body.colorId || jobColor.registeredColorId) || null, recipeId: recipe?.id || clean(body.recipeId) || null, pantoneSnapshot: snapshot.pantone || null, colorNameSnapshot: snapshot.colorName, paintTypeSnapshot: snapshot.paintType || "SUBAZLI", versionSnapshot: snapshot.version, referenceTotalGram: referenceTotal, multiplier, productionTotalGram, productionTotalKg: productionTotalGram / 1000, jobType: clean(body.jobType || "PRODUCTION"), modelSnapshot: clean(workflow.modelName || job.modelName), companySnapshot: clean(body.companyName || jsonObject(job.raw).companyName) || null, orderSnapshot: clean(body.orderNo || job.orderNo || jsonObject(job.raw).orderNo) || null, printRegionSnapshot: clean(jobColor.printRegion || job.printRegion || workflow.printAreaName) || null, recipeSnapshot: snapshot, createdBy: this.actor(user) } });
      for (const line of productionLines) {
        const item = await db.dyeProductionItem.create({ data: { productionId: production.id, productId: line.productId, productNameSnapshot: line.productName, referenceGram: line.referenceGram, percentage: line.percentage, productionGram: line.productionGram, productionKg: line.productionKg, lotId: line.lot.id, lotNoSnapshot: line.lot.lotNo } });
        await db.chemicalLot.update({ where: { id: line.lot.id }, data: { usedKg: { increment: line.productionKg }, remainingKg: { decrement: line.productionKg } } });
        await db.modelDyeExpense.create({ data: { mainCompanyId: clean(body.mainCompanyId) || null, mainCompanySlug: slug, modelOrderId: job.orderId || job.modelCardId || workflow.modelId || null, inventoryId: line.productId, productName: line.productName, lotId: line.lot.id, lotNo: line.lot.lotNo, amountKg: line.productionKg, expenseDate: new Date(), note: `${production.id} üretiminden otomatik boya gideri`, sourceProductionId: production.id, productionItemId: item.id, estimatedCost: 0, snapshot: { productionId: production.id, model: production.modelSnapshot, company: production.companySnapshot, order: production.orderSnapshot, pantone: production.pantoneSnapshot, paintType: production.paintTypeSnapshot, version: production.versionSnapshot, totalKg: numberValue(production.productionTotalKg), productId: line.productId, productName: line.productName, referenceGram: line.referenceGram, productionGram: line.productionGram, productionKg: line.productionKg, lotId: line.lot.id, lotNo: line.lot.lotNo } } });
      }
      await db.dyehouseColor.update({ where: { id: jobColor.id }, data: { status: "COMPLETED", completedAt: new Date(), registeredColorId: production.colorId, recipeId: production.recipeId } });
      await this.log(db, slug, "DYE_PRODUCTION", production.id, "PRODUCTION_SAVED", `${snapshot.colorName} için ${(productionTotalGram / 1000).toFixed(3)} KG boya hazırlandı; stok ve gider kayıtları işlendi.`, user, undefined, snapshot);
      const nextColor = await db.dyehouseColor.findFirst({ where: { mainCompanySlug: slug, dyehouseModelId: job.id, deletedAt: null, status: { in: ["WAITING", "DRAFT", "PREPARING"] } }, orderBy: { createdAt: "asc" } });
      return { production, duplicate: false, nextColorId: nextColor?.id || null };
    });
  }

  async listProductions(query: Query) {
    const slug = this.requireSlug(query);
    const rows = await this.db().dyeProduction.findMany({ where: { mainCompanySlug: slug, ...(clean(query.colorId) ? { colorId: clean(query.colorId) } : {}), ...(clean(query.jobId) ? { jobId: clean(query.jobId) } : {}) }, orderBy: { createdAt: "desc" }, take: Math.min(500, Math.max(1, numberValue(query.limit) || 200)) });
    const ids = rows.map((row: any) => row.id);
    const items = ids.length ? await this.db().dyeProductionItem.findMany({ where: { productionId: { in: ids } }, orderBy: { createdAt: "asc" } }) : [];
    return this.withProductionImages(rows.map((row: any) => ({ ...row, items: items.filter((item: any) => item.productionId === row.id) })), slug);
  }

  async getProduction(id: string, query: Query) {
    const slug = this.requireSlug(query);
    const row = await this.db().dyeProduction.findFirst({ where: { id, mainCompanySlug: slug } });
    if (!row) throw new NotFoundException("Üretim kaydı bulunamadı.");
    return { ...row, items: await this.db().dyeProductionItem.findMany({ where: { productionId: id } }) };
  }

  async listLogs(query: Query) {
    const slug = this.requireSlug(query);
    return this.db().activityLog.findMany({ where: { mainCompanySlug: slug, module: "BOYAHANE", ...(clean(query.entityId) ? { entityId: clean(query.entityId) } : {}) }, orderBy: { createdAt: "desc" }, take: 500 });
  }

  async reports(query: Query) {
    const slug = this.requireSlug(query);
    const [jobs, productions, lots, expenses] = await Promise.all([
      this.listJobs(query),
      this.db().dyeProduction.findMany({ where: { mainCompanySlug: slug }, orderBy: { createdAt: "desc" } }),
      this.db().chemicalLot.findMany({ where: { mainCompanySlug: slug, deletedAt: null } }),
      this.db().modelDyeExpense.findMany({ where: { mainCompanySlug: slug, deletedAt: null, sourceProductionId: { not: null } }, orderBy: { createdAt: "desc" } }),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    return {
      summary: {
        activeJobs: jobs.filter((row) => row.status === "ACTIVE").length,
        waitingJobs: jobs.filter((row) => ["WAITING", "PAUSED"].includes(row.status)).length,
        completedToday: jobs.filter((row) => row.status === "COMPLETED" && dateKey(row.completedAt) === today).length,
        pendingColors: jobs.reduce((sum, row) => sum + row.pendingColorCount, 0),
        preparedKgToday: productions.filter((row: any) => dateKey(row.createdAt) === today).reduce((sum: number, row: any) => sum + numberValue(row.productionTotalKg), 0),
        activeLots: lots.filter((row: any) => row.status === "ACTIVE").length,
        remainingStockKg: lots.reduce((sum: number, row: any) => sum + numberValue(row.remainingKg), 0),
        totalExpenseKg: expenses.reduce((sum: number, row: any) => sum + numberValue(row.amountKg), 0),
      },
      jobs,
      productions,
      expenses: expenses.map((expense: any) => {
        const production: any = productions.find((row: any) => row.id === expense.sourceProductionId);
        const job: any = jobs.find((row: any) => row.id === production?.jobId);
        return { ...expense, imageUrl: job?.imageUrl || "", modelName: production?.modelSnapshot || jsonObject(expense.snapshot).model || "" };
      }),
    };
  }
}
