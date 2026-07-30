import fs from "node:fs";

const servicePath = "APP/app/ky-erp-backend/src/muhasebe/accounting-api.service.ts";
const controllerPath = "APP/app/ky-erp-backend/src/muhasebe/muhasebe.controller.ts";

let service = fs.readFileSync(servicePath, "utf8");
let controller = fs.readFileSync(controllerPath, "utf8");

const helperAnchor = `function paymentStatusForAmount(amount: number, openAmount: number) {
  return amount >= openAmount ? "PAID" : "WAITING";
}
`;
const helperBlock = `${helperAnchor}
const CHECK_META_PREFIX = "KYERP_CHECK_META:";

function checkMeta(value: unknown) {
  const raw = text(value);
  if (!raw.startsWith(CHECK_META_PREFIX)) {
    return { note: raw, receiptPath: "", issueDate: "", accountNo: "", checkOwnership: "CUSTOMER_CHECK", checkDirection: "RECEIVED" };
  }
  try {
    const parsed = JSON.parse(raw.slice(CHECK_META_PREFIX.length));
    return {
      note: text(parsed?.note),
      receiptPath: text(parsed?.receiptPath),
      issueDate: text(parsed?.issueDate),
      accountNo: text(parsed?.accountNo),
      checkOwnership: text(parsed?.checkOwnership || "CUSTOMER_CHECK"),
      checkDirection: text(parsed?.checkDirection || "RECEIVED"),
    };
  } catch {
    return { note: raw, receiptPath: "", issueDate: "", accountNo: "", checkOwnership: "CUSTOMER_CHECK", checkDirection: "RECEIVED" };
  }
}

function checkMetaText(value: Record<string, any>) {
  return `${CHECK_META_PREFIX}${JSON.stringify({
    note: text(value?.note),
    receiptPath: text(value?.receiptPath),
    issueDate: text(value?.issueDate),
    accountNo: text(value?.accountNo),
    checkOwnership: text(value?.checkOwnership || "CUSTOMER_CHECK"),
    checkDirection: text(value?.checkDirection || "RECEIVED"),
  })}`;
}
`;
if (!service.includes("const CHECK_META_PREFIX")) {
  if (!service.includes(helperAnchor)) throw new Error("Accounting helper anchor bulunamadı");
  service = service.replace(helperAnchor, helperBlock);
}

const createCheckOld = `    return this.createPayment({ ...body, firmId, paymentType: "CHECK", status: body.status || "PLANNED" });`;
const createCheckNew = `    const meta = checkMetaText({
      note: body.note || body.description || body.aciklama,
      issueDate: body.issueDate || body.verilenTarih,
      accountNo: body.accountNo || body.hesapNo,
      checkOwnership: body.checkOwnership || body.cekSahibi,
      checkDirection: body.checkDirection || body.islemYonu,
      receiptPath: "",
    });
    return this.createPayment({
      ...body,
      firmId,
      paymentType: "CHECK",
      status: body.status || "PLANNED",
      description: meta,
    });`;
if (service.includes(createCheckOld)) service = service.replace(createCheckOld, createCheckNew);

const updateCheckAnchor = `  updatePaymentCenterCheck(id: string, body: AnyBody = {}) {
    return this.updatePayment(id, { ...body, paymentType: "CHECK" });
  }
`;
const updateCheckBlock = `${updateCheckAnchor}
  async updatePaymentCenterCheckAttachments(id: string, files: AnyBody = {}) {
    const current = await this.prisma.paymentRecord.findUnique({ where: { id } });
    if (!current || current.paymentType !== "CHECK") {
      throw new NotFoundException("Çek kaydı bulunamadı.");
    }
    const meta = checkMeta(current.note);
    const data = await this.prisma.paymentRecord.update({
      where: { id },
      data: {
        frontImagePath: text(files.frontPath) || current.frontImagePath,
        backImagePath: text(files.backPath) || current.backImagePath,
        note: checkMetaText({
          ...meta,
          receiptPath: text(files.receiptPath) || meta.receiptPath,
        }),
      },
    });
    return response({
      ...data,
      ...checkMeta(data.note),
    });
  }

  async paymentCenterCheckFilePath(id: string, side: string) {
    const row = await this.prisma.paymentRecord.findUnique({ where: { id } });
    if (!row || row.paymentType !== "CHECK") {
      throw new NotFoundException("Çek kaydı bulunamadı.");
    }
    const meta = checkMeta(row.note);
    if (side === "front") return text(row.frontImagePath);
    if (side === "back") return text(row.backImagePath);
    if (side === "receipt") return text(meta.receiptPath);
    throw new BadRequestException("Geçersiz çek dosya türü.");
  }
`;
if (!service.includes("updatePaymentCenterCheckAttachments")) {
  if (!service.includes(updateCheckAnchor)) throw new Error("Update check anchor bulunamadı");
  service = service.replace(updateCheckAnchor, updateCheckBlock);
}

const firmChecksOld = `        return {
          id: row.id,
          firmId: row.firmId,
          cekNo: row.checkNo || "",
          banka: row.bankName || "",
          sube: "",
          vade: iso(row.dueDate),
          tutar: total,
          odenen: paid,
          kalanTutar: remaining,
          cekTuru: "Tedarikçiye Verilen",
          durum: remaining <= 0 ? "PAID" : row.status,
          aciklama: row.note || "",
          open: remaining > 0 && openPaymentStatus(row.status),
        };`;
const firmChecksNew = `        const meta = checkMeta(row.note);
        return {
          id: row.id,
          firmId: row.firmId,
          cekNo: row.checkNo || "",
          checkNo: row.checkNo || "",
          banka: row.bankName || "",
          bankName: row.bankName || "",
          sube: "",
          vade: iso(row.dueDate),
          dueDate: iso(row.dueDate),
          issueDate: meta.issueDate,
          accountNo: meta.accountNo,
          checkOwnership: meta.checkOwnership,
          checkDirection: meta.checkDirection,
          tutar: total,
          amount: total,
          odenen: paid,
          kalanTutar: remaining,
          cekTuru: meta.checkOwnership === "OWN_CHECK" ? "Kendi Çekimiz" : "Müşteri Çeki",
          durum: remaining <= 0 ? "PAID" : row.status,
          status: remaining <= 0 ? "PAID" : row.status,
          aciklama: meta.note,
          note: meta.note,
          frontImagePath: row.frontImagePath || "",
          backImagePath: row.backImagePath || "",
          receiptPath: meta.receiptPath,
          open: remaining > 0 && openPaymentStatus(row.status),
        };`;
if (service.includes(firmChecksOld)) service = service.replace(firmChecksOld, firmChecksNew);

const cardsAnchor = `  async paymentCenterFirmCards(firmId: string) {`;
const overviewMethod = `  async paymentCenterChecksOverview(query: AnyBody = {}) {
    const slug = this.slug(query);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const startOfFollowingMonth = new Date(now.getFullYear(), now.getMonth() + 2, 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear() + 1, 0, 1);
    const rows = await this.prisma.paymentRecord.findMany({
      where: {
        mainCompanyId: slug,
        paymentType: "CHECK",
        relatedDocumentId: null,
        deletedAt: null,
      },
      include: { firm: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 2000,
    });
    const normalized = rows.map((row) => {
      const meta = checkMeta(row.note);
      const due = row.dueDate || row.createdAt;
      const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 12);
      const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
      const daysRemaining = Math.ceil((dueDay.getTime() - todayDay.getTime()) / 86400000);
      const amount = number(row.amount);
      const open = openPaymentStatus(row.status);
      return {
        id: row.id,
        firmId: row.firmId,
        firmaAdi: row.firm?.name || "",
        workType: row.workType,
        checkNo: row.checkNo || "",
        bankName: row.bankName || "",
        dueDate: iso(due),
        issueDate: meta.issueDate || iso(row.createdAt),
        accountNo: meta.accountNo,
        checkOwnership: meta.checkOwnership,
        checkDirection: meta.checkDirection,
        amount,
        status: row.status,
        note: meta.note,
        frontImagePath: row.frontImagePath || "",
        backImagePath: row.backImagePath || "",
        receiptPath: meta.receiptPath,
        open,
        daysRemaining,
        monthKey: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`,
        createdAt: row.createdAt,
      };
    });
    const monthMap = new Map<string, { monthKey: string; label: string; total: number; count: number }>();
    for (const row of normalized.filter((item) => item.open)) {
      const due = new Date(`${row.dueDate}T12:00:00`);
      const current = monthMap.get(row.monthKey) || {
        monthKey: row.monthKey,
        label: due.toLocaleDateString("tr-TR", { month: "long", year: "numeric" }),
        total: 0,
        count: 0,
      };
      current.total += row.amount;
      current.count += 1;
      monthMap.set(row.monthKey, current);
    }
    const openRows = normalized.filter((row) => row.open);
    const inRange = (value: string, start: Date, end: Date) => {
      const parsed = new Date(`${value}T12:00:00`);
      return parsed >= start && parsed < end;
    };
    const sum = (items: any[]) => items.reduce((total, row) => total + number(row.amount), 0);
    const thisMonth = openRows.filter((row) => inRange(row.dueDate, startOfMonth, startOfNextMonth));
    const nextMonth = openRows.filter((row) => inRange(row.dueDate, startOfNextMonth, startOfFollowingMonth));
    const overdue = openRows.filter((row) => row.daysRemaining < 0);
    const yearRows = normalized.filter((row) => inRange(row.dueDate, startOfYear, endOfYear));
    return response({
      summary: {
        thisMonthTotal: sum(thisMonth),
        thisMonthCount: thisMonth.length,
        nextMonthTotal: sum(nextMonth),
        nextMonthCount: nextMonth.length,
        overdueTotal: sum(overdue),
        overdueCount: overdue.length,
        openTotal: sum(openRows),
        openCount: openRows.length,
        yearTotal: sum(yearRows),
        yearCount: yearRows.length,
      },
      months: [...monthMap.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey)).slice(0, 18),
      rows: normalized,
    });
  }

${cardsAnchor}`;
if (!service.includes("paymentCenterChecksOverview")) {
  if (!service.includes(cardsAnchor)) throw new Error("Cards anchor bulunamadı");
  service = service.replace(cardsAnchor, overviewMethod);
}

const controllerCheckAnchor = `  @Post("odeme/cek")
  createOdemeCek(@Body() body: any) {
    return this.accountingApi.createPaymentCenterCheck({
      ...body,
      mainCompanySlug: this.requireMainCompanySlug(this.resolveDbSlug(body.mainCompanySlug, body.mainCompanyId)),
    });
  }
`;
const controllerCheckBlock = `  @Get("odeme/cekler")
  getOdemeCekOzeti(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.accountingApi.paymentCenterChecksOverview({
      mainCompanySlug: this.requireMainCompanySlug(
        this.resolveDbSlug(mainCompanySlug, mainCompanyId),
      ),
      mainCompanyId,
    });
  }

${controllerCheckAnchor}
  @Post("odeme/cek/:id/dosyalar")
  @UseInterceptors(
    AnyFilesInterceptor({
      storage: diskStorage({
        destination: (_req, _file, cb) =>
          cb(
            null,
            ensureDir(path.join(getStorageRoot(), "muhasebe", "cekler", "_temp")),
          ),
        filename: (_req, file, cb) =>
          cb(
            null,
            `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitizeFilePart(file.originalname)}`,
          ),
      }),
      limits: { files: 3, fileSize: 20 * 1024 * 1024 },
    }),
  )
  async uploadOdemeCekDosyalari(
    @Param("id") id: string,
    @UploadedFiles() files: any[],
  ) {
    const record = await this.prisma.paymentRecord.findUnique({ where: { id } });
    if (!record || record.paymentType !== "CHECK") {
      throw new NotFoundException("Çek kaydı bulunamadı.");
    }
    const due = record.dueDate || record.createdAt;
    const targetDir = ensureDir(
      path.join(
        getStorageRoot(),
        "muhasebe",
        "cekler",
        String(due.getFullYear()),
        String(due.getMonth() + 1).padStart(2, "0"),
        id,
      ),
    );
    const allowed = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);
    const saved: Record<string, string> = {};
    for (const file of files || []) {
      const side = String(file.fieldname || "").toLowerCase();
      if (!new Set(["front", "back", "receipt"]).has(side)) continue;
      const ext = path.extname(file.originalname || file.filename || "").toLowerCase();
      if (!allowed.has(ext)) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        throw new BadRequestException("Çek ekleri JPG, PNG, WEBP veya PDF olmalıdır.");
      }
      const targetPath = path.join(targetDir, `${side}-${Date.now()}${ext}`);
      fs.renameSync(file.path, targetPath);
      saved[`${side}Path`] = targetPath;
    }
    return this.accountingApi.updatePaymentCenterCheckAttachments(id, saved);
  }

  @Get("odeme/cek/:id/dosya/:side")
  async getOdemeCekDosyasi(
    @Param("id") id: string,
    @Param("side") side: string,
    @Res() res: Response,
  ) {
    const filePath = await this.accountingApi.paymentCenterCheckFilePath(id, side);
    if (!filePath || !fs.existsSync(filePath)) {
      throw new NotFoundException("Çek dosyası bulunamadı.");
    }
    const storageRoot = path.resolve(getStorageRoot());
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(storageRoot)) {
      throw new BadRequestException("Geçersiz çek dosya yolu.");
    }
    return res.sendFile(resolved);
  }
`;
if (!controller.includes("getOdemeCekOzeti")) {
  if (!controller.includes(controllerCheckAnchor)) throw new Error("Controller check anchor bulunamadı");
  controller = controller.replace(controllerCheckAnchor, controllerCheckBlock);
}

fs.writeFileSync(servicePath, service, "utf8");
fs.writeFileSync(controllerPath, controller, "utf8");
console.log("Muhasebe çek backend v3 yaması uygulandı.");
