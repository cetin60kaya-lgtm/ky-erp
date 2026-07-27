import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import {
  calculateDispatchCapacity,
  IsnetSourceIntakeInput,
  normalizeIsnetSourceIntake,
  NormalizedIsnetSourceIntake,
} from './isnet-source-intake';

type SourceOperation = {
  id: string;
  type:
    | 'CREATED'
    | 'MODEL_ASSIGNED'
    | 'CUSTOMER_DISPATCH_LINKED'
    | 'QUANTITIES_UPDATED'
    | 'OUTGOING_DISPATCH_DRAFTED'
    | 'OUTGOING_DISPATCH_COMPLETED';
  createdAt: string;
  note: string | null;
  quantity: number | null;
};

type SourceIntakeRow = NormalizedIsnetSourceIntake & {
  id: string;
  mainCompanySlug: string;
  createdAt: string;
  updatedAt: string;
  pdfPath: string | null;
  outgoingDispatchQuantity: number;
  invoicedQuantity: number;
  nonBillableQuantity: number;
  producedNetQuantity: number;
  operations?: SourceOperation[];
  outgoingDispatchDrafts?: Array<{
    id: string;
    quantity: number;
    note: string;
    status: 'DRAFT' | 'COMPLETED' | 'CANCELLED';
    documentNo: string | null;
    ettn: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
};

@Injectable()
export class IsnetSourceIntakeService {
  private readonly scope = 'isnet';
  private readonly fileName = 'source-intakes';
  private readonly createLocks = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaService) {}

  private calculateCapacity(
    row: SourceIntakeRow,
    overrides: Partial<Pick<
      SourceIntakeRow,
      | 'producedNetQuantity'
      | 'outgoingDispatchQuantity'
      | 'invoicedQuantity'
      | 'nonBillableQuantity'
    >> = {},
  ) {
    return calculateDispatchCapacity({
      sourceQuantity: row.quantity,
      producedNetQuantity: overrides.producedNetQuantity ?? row.producedNetQuantity,
      outgoingDispatchQuantity:
        overrides.outgoingDispatchQuantity ?? row.outgoingDispatchQuantity,
      invoicedQuantity: overrides.invoicedQuantity ?? row.invoicedQuantity,
      nonBillableQuantity: overrides.nonBillableQuantity ?? row.nonBillableQuantity,
    });
  }

  private requireMainCompanySlug(value: unknown) {
    const slug = String(value || '').trim();
    if (!slug) {
      throw new BadRequestException('Ana firma seçilmeden İşNet kaynak kaydı işlenemez.');
    }
    return slug;
  }

  private operation(
    type: SourceOperation['type'],
    note?: string | null,
    quantity?: number | null,
  ): SourceOperation {
    return {
      id: randomUUID(),
      type,
      createdAt: new Date().toISOString(),
      note: String(note || '').trim() || null,
      quantity: Number.isFinite(Number(quantity)) ? Number(quantity) : null,
    };
  }

  private withComputed(row: SourceIntakeRow) {
    const capacity = this.calculateCapacity(row);
    const workflowStatus =
      row.companyRole === 'SUPPLIER'
        ? 'NON_BILLABLE_SUPPLIER'
        : !row.modelId
          ? 'MODEL_PENDING'
          : capacity.sourceClosingRemaining === 0
            ? 'COMPLETED'
            : capacity.outgoingDispatchQuantity === 0
              ? 'READY_FOR_PRODUCTION'
              : capacity.invoiceRemaining > 0 || capacity.outgoingRemaining > 0
                ? 'PARTIAL'
                : 'READY_FOR_INVOICE';
    return { ...row, workflowStatus, capacity };
  }

  private requireRow(rows: SourceIntakeRow[], id: string) {
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) {
      throw new NotFoundException('İşNet kaynak kaydı bulunamadı.');
    }
    return index;
  }

  private normalizeCompanyName(value: unknown) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9çğıöşü]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private companyRole(company: any): 'CUSTOMER' | 'SUPPLIER' | 'BOTH' {
    const raw =
      company?.raw && typeof company.raw === 'object' && !Array.isArray(company.raw)
        ? company.raw
        : {};
    const values = [
      raw.companyTransactionProfile,
      raw.calismaProfili,
      company?.companyType,
      company?.firmaTuru,
      company?.type,
    ].map((value) => String(value || '').trim().toLocaleUpperCase('tr-TR'));
    if (values.some((value) => ['BOTH', 'CUSTOMER_SUPPLIER', 'GENEL'].includes(value))) {
      return 'BOTH';
    }
    if (values.some((value) => ['CUSTOMER', 'MUSTERI', 'MÜŞTERİ'].includes(value))) {
      return 'CUSTOMER';
    }
    return 'SUPPLIER';
  }

  private async resolveCompany(
    mainCompanySlug: string,
    input: IsnetSourceIntakeInput,
  ) {
    const companyId = String(input.companyId || '').trim();
    const normalizedName = this.normalizeCompanyName(input.companyName);
    let company = companyId
      ? await this.prisma.company.findFirst({
          where: {
            id: companyId,
            mainCompanySlug,
            isActive: true,
            deletedAt: null,
          },
        })
      : null;
    if (!company && normalizedName) {
      company = await this.prisma.company.findFirst({
        where: {
          mainCompanySlug,
          normalizedName,
          isActive: true,
          deletedAt: null,
        },
      });
    }
    if (!company && normalizedName) {
      const alias = await this.prisma.companyAlias.findFirst({
        where: {
          mainCompanySlug,
          normalizedName,
          isActive: true,
          deletedAt: null,
          company: { isActive: true, deletedAt: null },
        },
        include: { company: true },
      });
      company = alias?.company || null;
    }
    if (!company) {
      throw new BadRequestException(
        'Firma kartı bulunamadı. İşNet kaynağını kaydetmeden önce gerçek firma kartını seçin.',
      );
    }
    return {
      companyId: company.id,
      companyName: company.name,
      companyRole: this.companyRole(company),
    };
  }

  private async withCreateLock<T>(key: string, action: () => Promise<T>): Promise<T> {
    while (this.createLocks.has(key)) {
      await this.createLocks.get(key);
    }
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.createLocks.set(key, gate);
    try {
      return await action();
    } finally {
      release();
      if (this.createLocks.get(key) === gate) this.createLocks.delete(key);
    }
  }

  private async readRows(mainCompanySlug: string): Promise<SourceIntakeRow[]> {
    const row = await (this.prisma as any).jsonStore.findUnique({
      where: {
        scope_mainCompanySlug_fileName: {
          scope: this.scope,
          mainCompanySlug,
          fileName: this.fileName,
        },
      },
    });
    return Array.isArray(row?.data)
      ? (row.data as SourceIntakeRow[]).map((item) => ({
          ...item,
          outgoingDispatchQuantity: Number(item.outgoingDispatchQuantity || 0),
          invoicedQuantity: Number(item.invoicedQuantity || 0),
          nonBillableQuantity: Number(item.nonBillableQuantity || 0),
          producedNetQuantity: Number(item.producedNetQuantity || 0),
          operations: Array.isArray(item.operations) ? item.operations : [],
          outgoingDispatchDrafts: Array.isArray(item.outgoingDispatchDrafts)
            ? item.outgoingDispatchDrafts
            : [],
        }))
      : [];
  }

  private async writeRows(mainCompanySlug: string, rows: SourceIntakeRow[]) {
    await (this.prisma as any).jsonStore.upsert({
      where: {
        scope_mainCompanySlug_fileName: {
          scope: this.scope,
          mainCompanySlug,
          fileName: this.fileName,
        },
      },
      update: { data: rows as any },
      create: {
        scope: this.scope,
        mainCompanySlug,
        fileName: this.fileName,
        data: rows as any,
      },
    });
  }

  private hknRoot() {
    return String(process.env.ISNET_HKN_ROOT || '').trim();
  }

  private savePdf(
    reference: string,
    pdfSha256: string | null,
    file?: Express.Multer.File | null,
  ) {
    if (!file?.buffer?.length) return null;
    if (!file.buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) {
      throw new BadRequestException('Yüklenen dosyanın içeriği geçerli bir PDF değil.');
    }
    const root = this.hknRoot();
    if (!root) throw new Error('ISNET_HKN_ROOT tanımlı değil. Manuel PDF kaydedilemedi.');
    const dir = path.join(root, 'İŞNET', 'GEÇİCİ');
    fs.mkdirSync(dir, { recursive: true });
    const safeReference =
      reference.replace(/[^a-z0-9çğıöşü_-]+/gi, '-').replace(/^-+|-+$/g, '') ||
      'ISNET-BELGE';
    const hashSuffix = String(pdfSha256 || '').slice(0, 10).toUpperCase();
    let suffix = '';
    let counter = 1;
    let target = path.join(dir, `${safeReference}.pdf`);
    while (fs.existsSync(target)) {
      suffix = hashSuffix ? `-${hashSuffix}` : `-${counter}`;
      if (counter > 1) suffix += `-${counter}`;
      target = path.join(dir, `${safeReference}${suffix}.pdf`);
      counter += 1;
    }
    fs.writeFileSync(target, file.buffer, { flag: 'wx' });
    return target;
  }

  async list(
    mainCompanySlugValue: string | undefined,
    filters: Record<string, string | undefined> = {},
  ) {
    const mainCompanySlug = this.requireMainCompanySlug(mainCompanySlugValue);
    const query = String(filters.search || '').trim().toLocaleLowerCase('tr-TR');
    const page = Math.max(1, Number.parseInt(String(filters.page || '1'), 10) || 1);
    const requestedPageSize = Number.parseInt(
      String(filters.pageSize || filters.limit || '50'),
      10,
    );
    const pageSize = [25, 50, 100].includes(requestedPageSize)
      ? requestedPageSize
      : 50;
    const rows = await this.readRows(mainCompanySlug);
    const filteredRows = rows
      .map((row) => this.withComputed(row))
      .filter((row) => !filters.sourceType || row.sourceType === filters.sourceType)
      .filter(
        (row) =>
          !filters.status ||
          row.workflowStatus === filters.status ||
          row.status === filters.status,
      )
      .filter((row) => !filters.companyId || row.companyId === filters.companyId)
      .filter((row) => !filters.modelId || row.modelId === filters.modelId)
      .filter((row) => !filters.startDate || row.issueDate >= filters.startDate)
      .filter((row) => !filters.endDate || row.issueDate <= filters.endDate)
      .filter((row) => !query || [row.companyName, row.modelName, row.orderNo, row.customerDispatchNo, row.internalReference]
        .join(' ')
        .toLocaleLowerCase('tr-TR')
      .includes(query))
      .sort(
        (a, b) =>
          b.issueDate.localeCompare(a.issueDate) ||
          b.createdAt.localeCompare(a.createdAt),
      );
    const total = filteredRows.length;
    const items = filteredRows.slice((page - 1) * pageSize, page * pageSize);
    return {
      items,
      rows: items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async detail(mainCompanySlugValue: string | undefined, id: string) {
    const mainCompanySlug = this.requireMainCompanySlug(mainCompanySlugValue);
    const row = (await this.readRows(mainCompanySlug)).find((item) => item.id === id);
    if (!row) throw new NotFoundException('İşNet kaynak kaydı bulunamadı.');
    return this.withComputed(row);
  }

  async create(
    mainCompanySlugValue: string | undefined,
    input: IsnetSourceIntakeInput,
    file?: Express.Multer.File | null,
  ) {
    const mainCompanySlug = this.requireMainCompanySlug(mainCompanySlugValue);
    return this.withCreateLock(mainCompanySlug, async () => {
      const company = await this.resolveCompany(mainCompanySlug, input);
      const normalized = normalizeIsnetSourceIntake({
        ...input,
        ...company,
        pdfBuffer: file?.buffer || input.pdfBuffer || null,
        pdfFileName: file?.originalname || input.pdfFileName || null,
      });
      const rows = await this.readRows(mainCompanySlug);
      const duplicate = rows.find(
        (row) =>
          row.dedupeKey === normalized.dedupeKey ||
          Boolean(
            normalized.pdfSha256 &&
              row.pdfSha256 &&
              row.pdfSha256 === normalized.pdfSha256,
          ),
      );
      if (duplicate) {
        throw new ConflictException(`Bu kayıt daha önce alınmış: ${duplicate.internalReference}`);
      }
      const now = new Date().toISOString();
      const pdfPath = this.savePdf(
        normalized.internalReference,
        normalized.pdfSha256,
        file,
      );
      const row: SourceIntakeRow = {
        ...normalized,
        id: randomUUID(),
        mainCompanySlug,
        createdAt: now,
        updatedAt: now,
        pdfPath,
        outgoingDispatchQuantity: 0,
        invoicedQuantity: 0,
        nonBillableQuantity: 0,
        producedNetQuantity: 0,
        operations: [this.operation('CREATED', normalized.note)],
        outgoingDispatchDrafts: [],
      };
      rows.push(row);
      await this.writeRows(mainCompanySlug, rows);
      return this.withComputed(row);
    });
  }

  async assignModel(
    mainCompanySlugValue: string | undefined,
    id: string,
    payload: { modelId?: string; modelName?: string },
  ) {
    const mainCompanySlug = this.requireMainCompanySlug(mainCompanySlugValue);
    const rows = await this.readRows(mainCompanySlug);
    const index = this.requireRow(rows, id);
    const modelId = String(payload.modelId || '').trim() || null;
    const modelName = String(payload.modelName || '')
      .trim()
      .toLocaleUpperCase('tr-TR');
    if (!modelName && rows[index].companyRole !== 'SUPPLIER') {
      throw new BadRequestException('Model adı zorunludur.');
    }
    rows[index] = {
      ...rows[index],
      modelId,
      modelName,
      status: rows[index].companyRole === 'SUPPLIER'
        ? 'NON_BILLABLE_SUPPLIER'
        : modelId
          ? 'READY_FOR_PRODUCTION'
          : 'MODEL_PENDING',
      updatedAt: new Date().toISOString(),
      operations: [
        ...(rows[index].operations || []),
        this.operation('MODEL_ASSIGNED', modelName),
      ],
    };
    await this.writeRows(mainCompanySlug, rows);
    return this.withComputed(rows[index]);
  }

  async linkCustomerDispatch(
    mainCompanySlugValue: string | undefined,
    id: string,
    payload: { customerDispatchNo: string; ettn?: string },
  ) {
    const mainCompanySlug = this.requireMainCompanySlug(mainCompanySlugValue);
    const rows = await this.readRows(mainCompanySlug);
    const index = this.requireRow(rows, id);
    const customerDispatchNo = String(payload.customerDispatchNo || '')
      .trim()
      .toLocaleUpperCase('tr-TR');
    if (!customerDispatchNo) {
      throw new BadRequestException('Müşteri irsaliye numarası zorunludur.');
    }
    const duplicate = rows.find(
      (row) =>
        row.id !== id && row.customerDispatchNo === customerDispatchNo,
    );
    if (duplicate) {
      throw new ConflictException(
        `Bu irsaliye başka kayda bağlı: ${duplicate.internalReference}`,
      );
    }
    rows[index] = {
      ...rows[index],
      customerDispatchNo,
      ettn: String(payload.ettn || '').trim().toLocaleUpperCase('tr-TR') || null,
      customerDispatchMissing: false,
      updatedAt: new Date().toISOString(),
      operations: [
        ...(rows[index].operations || []),
        this.operation('CUSTOMER_DISPATCH_LINKED', customerDispatchNo),
      ],
    };
    await this.writeRows(mainCompanySlug, rows);
    return this.withComputed(rows[index]);
  }

  async updateQuantities(
    mainCompanySlugValue: string | undefined,
    id: string,
    payload: {
      producedNetQuantity?: number;
      outgoingDispatchQuantity?: number;
      invoicedQuantity?: number;
      nonBillableQuantity?: number;
      note?: string;
    },
  ) {
    const mainCompanySlug = this.requireMainCompanySlug(mainCompanySlugValue);
    const rows = await this.readRows(mainCompanySlug);
    const index = this.requireRow(rows, id);
    const current = rows[index];
    const next = {
      ...current,
      producedNetQuantity:
        payload.producedNetQuantity === undefined
          ? current.producedNetQuantity
          : Number(payload.producedNetQuantity),
      outgoingDispatchQuantity:
        payload.outgoingDispatchQuantity === undefined
          ? current.outgoingDispatchQuantity
          : Number(payload.outgoingDispatchQuantity),
      invoicedQuantity:
        payload.invoicedQuantity === undefined
          ? current.invoicedQuantity
          : Number(payload.invoicedQuantity),
      nonBillableQuantity:
        payload.nonBillableQuantity === undefined
          ? current.nonBillableQuantity
          : Number(payload.nonBillableQuantity),
    };
    for (const value of [
      next.producedNetQuantity,
      next.outgoingDispatchQuantity,
      next.invoicedQuantity,
      next.nonBillableQuantity,
    ]) {
      if (!Number.isFinite(value) || value < 0) {
        throw new BadRequestException(
          'Adetler sıfır veya daha büyük olmalıdır.',
        );
      }
    }
    this.calculateCapacity(next);
    const activeDraftQuantity = (current.outgoingDispatchDrafts || [])
      .filter((draft) => draft.status === 'DRAFT')
      .reduce((sum, draft) => sum + Number(draft.quantity || 0), 0);
    if (activeDraftQuantity > 0) {
      this.calculateCapacity(next, {
        outgoingDispatchQuantity:
          next.outgoingDispatchQuantity + activeDraftQuantity,
      });
    }
    rows[index] = {
      ...next,
      updatedAt: new Date().toISOString(),
      operations: [
        ...(current.operations || []),
        this.operation('QUANTITIES_UPDATED', payload.note),
      ],
    };
    await this.writeRows(mainCompanySlug, rows);
    return this.withComputed(rows[index]);
  }

  async prepareOutgoingDispatch(
    mainCompanySlugValue: string | undefined,
    id: string,
    payload: { quantity: number; note?: string },
  ) {
    const mainCompanySlug = this.requireMainCompanySlug(mainCompanySlugValue);
    const rows = await this.readRows(mainCompanySlug);
    const index = this.requireRow(rows, id);
    const current = rows[index];
    if (current.companyRole === 'SUPPLIER') {
      throw new BadRequestException('Tedarikçi kaydı için giden irsaliye hazırlanamaz.');
    }
    if (!current.modelId) {
      throw new BadRequestException('Model eşleşmeden giden irsaliye hazırlanamaz.');
    }
    const quantity = Number(payload.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new BadRequestException('Giden irsaliye adedi sıfırdan büyük olmalıdır.');
    }
    const activeDraftQuantity = (current.outgoingDispatchDrafts || [])
      .filter((draft) => draft.status === 'DRAFT')
      .reduce((sum, draft) => sum + Number(draft.quantity || 0), 0);
    const nextTotal =
      current.outgoingDispatchQuantity + activeDraftQuantity + quantity;
    const capacity = this.calculateCapacity(current, {
      outgoingDispatchQuantity: nextTotal,
    });
    const now = new Date().toISOString();
    const draftId = randomUUID();
    const draftRecord = {
      id: draftId,
      quantity,
      note: String(payload.note || current.note || '').trim(),
      status: 'DRAFT' as const,
      documentNo: null,
      ettn: null,
      createdAt: now,
      completedAt: null,
    };
    rows[index] = {
      ...current,
      outgoingDispatchDrafts: [
        ...(current.outgoingDispatchDrafts || []),
        draftRecord,
      ],
      updatedAt: now,
      operations: [
        ...(current.operations || []),
        this.operation('OUTGOING_DISPATCH_DRAFTED', draftRecord.note, quantity),
      ],
    };
    await this.writeRows(mainCompanySlug, rows);
    return {
      intake: this.withComputed(rows[index]),
      capacity,
      draft: {
        id: draftId,
        sourceIntakeId: id,
        recipientName: current.companyName,
        modelId: current.modelId,
        modelName: current.modelName,
        orderNo: current.orderNo,
        sourceReference: current.customerDispatchNo || current.internalReference,
        quantity,
        note: draftRecord.note,
      },
    };
  }

  async completeOutgoingDispatch(
    mainCompanySlugValue: string | undefined,
    id: string,
    draftId: string,
    payload: {
      confirmed?: boolean;
      documentNo?: string;
      ettn?: string;
    },
  ) {
    const mainCompanySlug = this.requireMainCompanySlug(mainCompanySlugValue);
    if (payload.confirmed !== true) {
      throw new BadRequestException(
        'Portal belgesi doğrulanmadan giden irsaliye tamamlanamaz.',
      );
    }
    const documentNo = String(payload.documentNo || '')
      .trim()
      .toLocaleUpperCase('tr-TR');
    if (!documentNo) {
      throw new BadRequestException('Doğrulanmış giden irsaliye numarası zorunludur.');
    }
    const rows = await this.readRows(mainCompanySlug);
    const index = this.requireRow(rows, id);
    const current = rows[index];
    const drafts = [...(current.outgoingDispatchDrafts || [])];
    const draftIndex = drafts.findIndex((draft) => draft.id === draftId);
    if (draftIndex < 0) {
      throw new NotFoundException('Giden irsaliye taslağı bulunamadı.');
    }
    if (drafts[draftIndex].status === 'COMPLETED') {
      return {
        intake: this.withComputed(current),
        capacity: this.calculateCapacity(current),
      };
    }
    if (drafts[draftIndex].status !== 'DRAFT') {
      throw new BadRequestException('İptal edilmiş taslak tamamlanamaz.');
    }
    const nextTotal =
      current.outgoingDispatchQuantity + Number(drafts[draftIndex].quantity || 0);
    const capacity = this.calculateCapacity(current, {
      outgoingDispatchQuantity: nextTotal,
    });
    drafts[draftIndex] = {
      ...drafts[draftIndex],
      status: 'COMPLETED',
      documentNo,
      ettn:
        String(payload.ettn || '').trim().toLocaleUpperCase('tr-TR') || null,
      completedAt: new Date().toISOString(),
    };
    rows[index] = {
      ...current,
      outgoingDispatchQuantity: nextTotal,
      outgoingDispatchDrafts: drafts,
      updatedAt: new Date().toISOString(),
      operations: [
        ...(current.operations || []),
        this.operation(
          'OUTGOING_DISPATCH_COMPLETED',
          documentNo,
          drafts[draftIndex].quantity,
        ),
      ],
    };
    await this.writeRows(mainCompanySlug, rows);
    return { intake: this.withComputed(rows[index]), capacity };
  }
}
