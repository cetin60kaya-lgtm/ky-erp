import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";

type Input = Record<string, any>;

type ModelDepartmentMapping = {
  id: string;
  companyId?: string;
  companyName?: string;
  modelId?: string;
  modelName?: string;
  modelKey?: string;
  departmentCode: string;
  responsibleContactId?: string;
  active: boolean;
};

const DEFAULT_SETTINGS = {
  carrier: {
    carrierName: "",
    taxNo: "",
    driverName: "",
    driverId: "",
    vehiclePlate: "",
    trailerPlate: "",
    deliveryMethod: "ELDEN_TESLIM",
    deliveryAddress: "",
  },
  mailTemplate: {
    subjectPattern: "{{MODEL}} FATURA",
    body:
      "Merhaba,\n\n{{MODEL}} modeline ait {{DISPATCH_NO}} numaralı irsaliye ve {{INVOICE_NO}} numaralı fatura ektedir.\n\nİyi çalışmalar.",
    attachDispatchPdf: true,
    attachInvoicePdf: true,
    attachXml: false,
  },
  nonBillableRules: {
    TEST_NUMUNESI: {
      label: "TEST NUMUNESİ",
      invoiceBehavior: "ZERO_PRICE_EXEMPT",
      exemptionCode: "",
      exemptionReason: "",
      deliveryMethod: "ELDEN_TESLIM",
    },
    BASKI_SAKATI: {
      label: "BASKI SAKATI",
      invoiceBehavior: "DO_NOT_INVOICE",
      deliveryMethod: "ELDEN_TESLIM",
    },
    KUMAS_SAKATI: {
      label: "KUMAŞ SAKATI",
      invoiceBehavior: "DO_NOT_INVOICE",
      deliveryMethod: "ELDEN_TESLIM",
    },
  },
  modelDepartmentMappings: [] as ModelDepartmentMapping[],
};

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function objectValue(value: unknown): Input {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Input)
    : {};
}

function booleanValue(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "evet", "aktif"].includes(
    String(value).toLocaleLowerCase("tr-TR"),
  );
}

@Injectable()
export class IsnetBusinessSettingsService {
  private readonly scope = "ISNET";
  private readonly key = "BUSINESS_SETTINGS";

  constructor(private readonly prisma: PrismaService) {}

  private db(): any {
    return this.prisma as any;
  }

  private slug(input: Input = {}) {
    const value = clean(input.mainCompanySlug || input.mainCompanyId);
    if (!value) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return value;
  }

  private normalize(value: unknown) {
    return clean(value)
      .toLocaleUpperCase("tr-TR")
      .replace(/İ/g, "I")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private mergeSettings(value: unknown) {
    const saved = objectValue(value);
    return {
      carrier: {
        ...DEFAULT_SETTINGS.carrier,
        ...objectValue(saved.carrier),
      },
      mailTemplate: {
        ...DEFAULT_SETTINGS.mailTemplate,
        ...objectValue(saved.mailTemplate),
      },
      nonBillableRules: {
        TEST_NUMUNESI: {
          ...DEFAULT_SETTINGS.nonBillableRules.TEST_NUMUNESI,
          ...objectValue(objectValue(saved.nonBillableRules).TEST_NUMUNESI),
        },
        BASKI_SAKATI: {
          ...DEFAULT_SETTINGS.nonBillableRules.BASKI_SAKATI,
          ...objectValue(objectValue(saved.nonBillableRules).BASKI_SAKATI),
        },
        KUMAS_SAKATI: {
          ...DEFAULT_SETTINGS.nonBillableRules.KUMAS_SAKATI,
          ...objectValue(objectValue(saved.nonBillableRules).KUMAS_SAKATI),
        },
      },
      modelDepartmentMappings: Array.isArray(saved.modelDepartmentMappings)
        ? saved.modelDepartmentMappings
        : [],
      updatedAt: clean(saved.updatedAt),
      updatedBy: clean(saved.updatedBy),
    };
  }

  private async read(slug: string) {
    const row = await this.db().setting.findUnique({
      where: {
        scope_mainCompanySlug_key: {
          scope: this.scope,
          mainCompanySlug: slug,
          key: this.key,
        },
      },
    });
    return this.mergeSettings(row?.value);
  }

  private async write(slug: string, value: Input) {
    const next = this.mergeSettings({
      ...value,
      updatedAt: new Date().toISOString(),
      updatedBy: clean(value.updatedBy) || "USER",
    });
    await this.db().setting.upsert({
      where: {
        scope_mainCompanySlug_key: {
          scope: this.scope,
          mainCompanySlug: slug,
          key: this.key,
        },
      },
      create: {
        scope: this.scope,
        mainCompanySlug: slug,
        key: this.key,
        value: next,
      },
      update: { value: next, deletedAt: null },
    });
    return next;
  }

  async get(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const [settings, departments, contacts] = await Promise.all([
      this.read(mainCompanySlug),
      this.db().muhasebeContactDepartment.findMany({
        where: { mainCompanySlug, isActive: true },
        orderBy: [{ firmName: "asc" }, { departmentCode: "asc" }],
      }),
      this.db().muhasebeContactPerson.findMany({
        where: { mainCompanySlug, isActive: true },
        orderBy: [
          { firmName: "asc" },
          { departmentCode: "asc" },
          { fullName: "asc" },
        ],
      }),
    ]);
    return { ok: true, settings, departments, contacts };
  }

  async save(body: Input = {}) {
    const mainCompanySlug = this.slug(body);
    const current = await this.read(mainCompanySlug);
    return this.write(mainCompanySlug, {
      ...current,
      carrier: body.carrier
        ? { ...current.carrier, ...objectValue(body.carrier) }
        : current.carrier,
      mailTemplate: body.mailTemplate
        ? { ...current.mailTemplate, ...objectValue(body.mailTemplate) }
        : current.mailTemplate,
      nonBillableRules: body.nonBillableRules
        ? {
            ...current.nonBillableRules,
            ...objectValue(body.nonBillableRules),
          }
        : current.nonBillableRules,
      modelDepartmentMappings: Array.isArray(body.modelDepartmentMappings)
        ? body.modelDepartmentMappings
        : current.modelDepartmentMappings,
      updatedBy: clean(body.updatedBy) || "USER",
    });
  }

  async createDepartment(body: Input = {}) {
    const mainCompanySlug = this.slug(body);
    const departmentCode = clean(body.departmentCode || body.departmentNo);
    if (!departmentCode) {
      throw new BadRequestException("Departman kodu zorunludur.");
    }
    const existing = await this.db().muhasebeContactDepartment.findFirst({
      where: {
        mainCompanySlug,
        firmId: clean(body.firmId || body.companyId) || null,
        departmentCode,
        isActive: true,
      },
    });
    if (existing) {
      return this.db().muhasebeContactDepartment.update({
        where: { id: existing.id },
        data: {
          firmName: clean(body.firmName || body.companyName) || existing.firmName,
          departmentName:
            clean(body.departmentName || body.department) ||
            existing.departmentName,
          usageNote: clean(body.usageNote || body.note) || existing.usageNote,
        },
      });
    }
    return this.db().muhasebeContactDepartment.create({
      data: {
        mainCompanyId: clean(body.mainCompanyId) || null,
        mainCompanySlug,
        firmId: clean(body.firmId || body.companyId) || null,
        firmName: clean(body.firmName || body.companyName) || null,
        departmentCode,
        departmentName: clean(body.departmentName || body.department) || null,
        usageNote: clean(body.usageNote || body.note) || null,
        isActive: true,
      },
    });
  }

  async updateDepartment(id: string, body: Input = {}) {
    const mainCompanySlug = this.slug(body);
    const existing = await this.db().muhasebeContactDepartment.findFirst({
      where: { id: clean(id), mainCompanySlug },
    });
    if (!existing) throw new NotFoundException("Departman kaydı bulunamadı.");
    return this.db().muhasebeContactDepartment.update({
      where: { id: existing.id },
      data: {
        firmId: body.firmId === undefined ? undefined : clean(body.firmId) || null,
        firmName:
          body.firmName === undefined ? undefined : clean(body.firmName) || null,
        departmentCode:
          body.departmentCode === undefined
            ? undefined
            : clean(body.departmentCode),
        departmentName:
          body.departmentName === undefined
            ? undefined
            : clean(body.departmentName) || null,
        usageNote:
          body.usageNote === undefined
            ? undefined
            : clean(body.usageNote) || null,
        isActive:
          body.isActive === undefined
            ? undefined
            : booleanValue(body.isActive, true),
      },
    });
  }

  async createContact(body: Input = {}) {
    const mainCompanySlug = this.slug(body);
    const fullName = clean(body.fullName || body.name);
    const email = clean(body.email);
    if (!fullName || !email) {
      throw new BadRequestException("Ad soyad ve e-posta zorunludur.");
    }
    const existing = await this.db().muhasebeContactPerson.findFirst({
      where: { mainCompanySlug, email },
    });
    const data = {
      mainCompanyId: clean(body.mainCompanyId) || null,
      mainCompanySlug,
      firmId: clean(body.firmId || body.companyId) || null,
      firmName: clean(body.firmName || body.companyName) || null,
      departmentCode: clean(body.departmentCode || body.departmentNo) || null,
      departmentName: clean(body.departmentName || body.department) || null,
      fullName,
      email,
      phone: clean(body.phone) || null,
      title: clean(body.title) || null,
      canReceiveInvoiceMail: booleanValue(body.canReceiveInvoiceMail, true),
      canReceiveDispatchMail: booleanValue(body.canReceiveDispatchMail, true),
      canReceiveStatementReminder: booleanValue(
        body.canReceiveStatementReminder,
        false,
      ),
      canReceiveModelNotification: booleanValue(
        body.canReceiveModelNotification,
        false,
      ),
      note: clean(body.note) || null,
      isActive: true,
    };
    return existing
      ? this.db().muhasebeContactPerson.update({
          where: { id: existing.id },
          data,
        })
      : this.db().muhasebeContactPerson.create({ data });
  }

  async updateContact(id: string, body: Input = {}) {
    const mainCompanySlug = this.slug(body);
    const existing = await this.db().muhasebeContactPerson.findFirst({
      where: { id: clean(id), mainCompanySlug },
    });
    if (!existing) throw new NotFoundException("Kişi kaydı bulunamadı.");
    const fields = [
      "firmId",
      "firmName",
      "departmentCode",
      "departmentName",
      "fullName",
      "email",
      "phone",
      "title",
      "note",
    ];
    const data: Input = {};
    for (const field of fields) {
      if (body[field] !== undefined) data[field] = clean(body[field]) || null;
    }
    for (const field of [
      "canReceiveInvoiceMail",
      "canReceiveDispatchMail",
      "canReceiveStatementReminder",
      "canReceiveModelNotification",
      "isActive",
    ]) {
      if (body[field] !== undefined) data[field] = booleanValue(body[field]);
    }
    return this.db().muhasebeContactPerson.update({
      where: { id: existing.id },
      data,
    });
  }

  async addModelMapping(body: Input = {}) {
    const mainCompanySlug = this.slug(body);
    const departmentCode = clean(body.departmentCode);
    const modelId = clean(body.modelId);
    const modelName = clean(body.modelName || body.modelKey);
    if (!departmentCode || (!modelId && !modelName)) {
      throw new BadRequestException(
        "Model/model anahtarı ve departman kodu zorunludur.",
      );
    }
    const current = await this.read(mainCompanySlug);
    const id = clean(body.id) || randomUUID();
    const nextMapping: ModelDepartmentMapping = {
      id,
      companyId: clean(body.companyId) || undefined,
      companyName: clean(body.companyName) || undefined,
      modelId: modelId || undefined,
      modelName: modelName || undefined,
      modelKey: this.normalize(modelName || modelId),
      departmentCode,
      responsibleContactId: clean(body.responsibleContactId) || undefined,
      active: body.active === undefined ? true : booleanValue(body.active, true),
    };
    const mappings = current.modelDepartmentMappings
      .filter((row: ModelDepartmentMapping) => row.id !== id)
      .concat(nextMapping);
    const settings = await this.write(mainCompanySlug, {
      ...current,
      modelDepartmentMappings: mappings,
      updatedBy: clean(body.updatedBy) || "USER",
    });
    return { ok: true, mapping: nextMapping, settings };
  }

  async removeModelMapping(id: string, input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const current = await this.read(mainCompanySlug);
    const mappings = current.modelDepartmentMappings.filter(
      (row: ModelDepartmentMapping) => row.id !== clean(id),
    );
    if (mappings.length === current.modelDepartmentMappings.length) {
      throw new NotFoundException("Model departman eşleşmesi bulunamadı.");
    }
    const settings = await this.write(mainCompanySlug, {
      ...current,
      modelDepartmentMappings: mappings,
      updatedBy: clean(input.updatedBy) || "USER",
    });
    return { ok: true, id, settings };
  }

  async resolveContext(input: Input = {}) {
    const mainCompanySlug = this.slug(input);
    const settings = await this.read(mainCompanySlug);
    const companyId = clean(input.companyId || input.firmId);
    const companyName = clean(input.companyName || input.firmName);
    const modelId = clean(input.modelId);
    const modelName = clean(input.modelName || input.modelKey);
    const normalizedModel = this.normalize(modelName);

    const mappings = settings.modelDepartmentMappings.filter(
      (row: ModelDepartmentMapping) => row.active !== false,
    );
    const mapping =
      mappings.find(
        (row: ModelDepartmentMapping) =>
          modelId && row.modelId === modelId &&
          (!row.companyId || !companyId || row.companyId === companyId),
      ) ||
      mappings.find(
        (row: ModelDepartmentMapping) =>
          normalizedModel &&
          this.normalize(row.modelName || row.modelKey) === normalizedModel &&
          (!row.companyId || !companyId || row.companyId === companyId),
      ) ||
      null;

    const departments = await this.db().muhasebeContactDepartment.findMany({
      where: {
        mainCompanySlug,
        isActive: true,
        ...(companyId
          ? { firmId: companyId }
          : companyName
            ? { firmName: companyName }
            : {}),
      },
      orderBy: { departmentCode: "asc" },
    });
    const department = mapping
      ? departments.find(
          (row: any) => row.departmentCode === mapping.departmentCode,
        ) || null
      : departments.length === 1
        ? departments[0]
        : null;

    const contacts = await this.db().muhasebeContactPerson.findMany({
      where: {
        mainCompanySlug,
        isActive: true,
        ...(companyId
          ? { firmId: companyId }
          : companyName
            ? { firmName: companyName }
            : {}),
        ...(department?.departmentCode
          ? { departmentCode: department.departmentCode }
          : {}),
      },
      orderBy: { fullName: "asc" },
    });
    const responsible =
      contacts.find(
        (row: any) => row.id === mapping?.responsibleContactId,
      ) ||
      contacts.find((row: any) =>
        /SORUMLU|TESLIM EDEN|YETKILI/.test(
          this.normalize(`${row.title || ""} ${row.note || ""}`),
        ),
      ) ||
      contacts[0] ||
      null;

    const dispatchRecipients = contacts.filter(
      (row: any) => row.canReceiveDispatchMail === true,
    );
    const invoiceRecipients = contacts.filter(
      (row: any) => row.canReceiveInvoiceMail === true,
    );
    const allRecipientMap = new Map<string, any>();
    for (const row of [...dispatchRecipients, ...invoiceRecipients]) {
      allRecipientMap.set(String(row.email).toLocaleLowerCase("tr-TR"), row);
    }

    return {
      ok: true,
      company: { id: companyId, name: companyName },
      model: { id: modelId, name: modelName },
      mapping,
      department,
      responsible,
      dispatchRecipients,
      invoiceRecipients,
      combinedRecipients: [...allRecipientMap.values()],
      carrier: settings.carrier,
      mailTemplate: settings.mailTemplate,
      nonBillableRules: settings.nonBillableRules,
      ready: Boolean(department && responsible),
      missing: [
        !department ? "DEPARTMENT" : "",
        !responsible ? "RESPONSIBLE" : "",
        !settings.carrier.vehiclePlate ? "VEHICLE_PLATE" : "",
      ].filter(Boolean),
    };
  }
}
