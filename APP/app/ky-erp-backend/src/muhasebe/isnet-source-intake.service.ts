import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
  type: 'CREATED' | 'MODEL_ASSIGNED' | 'CUSTOMER_DISPATCH_LINKED' | 'QUANTITIES_UPDATED' | 'OUTGOING_DISPATCH_CREATED';
  createdAt: string;
  note: string | null;
  quantity: number | null;
};

type SourceIntakeRow = NormalizedIsnetSourceIntake & {
  id: string;
  createdAt: string;
  updatedAt: string;
  pdfPath: string | null;
  outgoingDispatchQuantity: number;
  invoicedQuantity: number;
  nonBillableQuantity: number;
  producedNetQuantity: number;
  operations?: SourceOperation[];
};

@Injectable()
export class IsnetSourceIntakeService {
  private readonly scope = 'isnet';
  private readonly fileName = 'source-intakes';

  constructor(private readonly prisma: PrismaService) {}

  private async readRows(): Promise<SourceIntakeRow[]> {
    const row = await (this.prisma as any).jsonStore.findUnique({
      where: {
        scope_mainCompanySlug_fileName: {
          scope: this.scope,
          mainCompanySlug: '',
          fileName: this.fileName,
        },
      },
    });
    return Array.isArray(row?.data) ? (row.data as SourceIntakeRow[]) : [];
  }

  private async writeRows(rows: SourceIntakeRow[]) {
    await (this.prisma as any).jsonStore.upsert({
      where: {
        scope_mainCompanySlug_fileName: {
          scope: this.scope,
          mainCompanySlug: '',
          fileName: this.fileName,
        },
      },
      update: { data: rows as any },
      create: {
        scope: this.scope,
        mainCompanySlug: '',
        fileName: this.fileName,
        data: rows as any,
      },
    });
  }

  private hknRoot() {
    return String(process.env.ISNET_HKN_ROOT || '').trim();
  }

  private savePdf(reference: string, file?: Express.Multer.File | null) {
    if (!file?.buffer?.length) return null;
    const root = this.hknRoot();
    if (!root) throw new Error('ISNET_HKN_ROOT tanımlı değil. Manuel PDF kaydedilemedi.');
    const dir = path.join(root, 'İŞNET', 'GEÇİCİ');
    fs.mkdirSync(dir, { recursive: true });
    const safeReference = reference.replace(/[^a-z0-9çğıöşü_-]+/gi, '-');
    const target = path.join(dir, `${safeReference}.pdf`);
    fs.writeFileSync(target, file.buffer);
    return target;
  }

  private operation(type: SourceOperation['type'], note?: string | null, quantity?: number | null): SourceOperation {
    return {
      id: randomUUID(),
      type,
      createdAt: new Date().toISOString(),
      note: String(note || '').trim() || null,
      quantity: Number.isFinite(Number(quantity)) ? Number(quantity) : null,
    };
  }

  private withComputed(row: SourceIntakeRow) {
    const capacity = calculateDispatchCapacity(row);
    const workflowStatus = row.companyRole === 'SUPPLIER'
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
    if (index < 0) throw new NotFoundException('İşNet kaynak kaydı bulunamadı.');
    return index;
  }

  async list(filters: Record<string, string | undefined> = {}) {
    const query = String(filters.search || '').trim().toLocaleLowerCase('tr-TR');
    const rows = await this.readRows();
    return rows
      .map((row) => this.withComputed(row))
      .filter((row) => !filters.sourceType || row.sourceType === filters.sourceType)
      .filter((row) => !filters.status || row.workflowStatus === filters.status || row.status === filters.status)
      .filter((row) => !filters.companyId || row.companyId === filters.companyId)
      .filter((row) => !filters.modelId || row.modelId === filters.modelId)
      .filter((row) => !filters.startDate || row.issueDate >= filters.startDate)
      .filter((row) => !filters.endDate || row.issueDate <= filters.endDate)
      .filter((row) => !query || [row.companyName, row.modelName, row.orderNo, row.customerDispatchNo, row.internalReference]
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .includes(query))
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.createdAt.localeCompare(a.createdAt));
  }

  async detail(id: string) {
    const row = (await this.readRows()).find((item) => item.id === id);
    if (!row) throw new NotFoundException('İşNet kaynak kaydı bulunamadı.');
    return this.withComputed(row);
  }

  async create(input: IsnetSourceIntakeInput, file?: Express.Multer.File | null) {
    const normalized = normalizeIsnetSourceIntake({
      ...input,
      pdfBuffer: file?.buffer || input.pdfBuffer || null,
      pdfFileName: file?.originalname || input.pdfFileName || null,
    });
    const rows = await this.readRows();
    const duplicate = rows.find((row) => row.dedupeKey === normalized.dedupeKey);
    if (duplicate) {
      throw new ConflictException(`Bu kayıt daha önce alınmış: ${duplicate.internalReference}`);
    }
    const now = new Date().toISOString();
    const pdfPath = this.savePdf(normalized.internalReference, file);
    const row: SourceIntakeRow = {
      ...normalized,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      pdfPath,
      outgoingDispatchQuantity: 0,
      invoicedQuantity: 0,
      nonBillableQuantity: 0,
      producedNetQuantity: 0,
      operations: [this.operation('CREATED', normalized.note)],
    };
    rows.push(row);
    await this.writeRows(rows);
    return this.withComputed(row);
  }

  async assignModel(id: string, payload: { modelId?: string; modelName?: string }) {
    const rows = await this.readRows();
    const index = this.requireRow(rows, id);
    const modelName = String(payload.modelName || '').trim().toLocaleUpperCase('tr-TR');
    if (!modelName && rows[index].companyRole !== 'SUPPLIER') {
      throw new BadRequestException('Model adı zorunludur.');
    }
    rows[index] = {
      ...rows[index],
      modelId: String(payload.modelId || '').trim() || null,
      modelName,
      status: rows[index].companyRole === 'SUPPLIER'
        ? 'NON_BILLABLE_SUPPLIER'
        : payload.modelId
          ? 'READY_FOR_PRODUCTION'
          : 'MODEL_PENDING',
      updatedAt: new Date().toISOString(),
      operations: [...(rows[index].operations || []), this.operation('MODEL_ASSIGNED', modelName)],
    };
    await this.writeRows(rows);
    return this.withComputed(rows[index]);
  }

  async linkCustomerDispatch(id: string, payload: { customerDispatchNo: string; ettn?: string }) {
    const rows = await this.readRows();
    const index = this.requireRow(rows, id);
    const customerDispatchNo = String(payload.customerDispatchNo || '').trim().toLocaleUpperCase('tr-TR');
    if (!customerDispatchNo) throw new BadRequestException('Müşteri irsaliye numarası zorunludur.');
    const duplicate = rows.find((row) => row.id !== id && row.customerDispatchNo === customerDispatchNo);
    if (duplicate) throw new ConflictException(`Bu irsaliye başka kayda bağlı: ${duplicate.internalReference}`);
    rows[index] = {
      ...rows[index],
      customerDispatchNo,
      ettn: String(payload.ettn || '').trim().toLocaleUpperCase('tr-TR') || null,
      customerDispatchMissing: false,
      updatedAt: new Date().toISOString(),
      operations: [...(rows[index].operations || []), this.operation('CUSTOMER_DISPATCH_LINKED', customerDispatchNo)],
    };
    await this.writeRows(rows);
    return this.withComputed(rows[index]);
  }

  async updateQuantities(id: string, payload: {
    producedNetQuantity?: number;
    outgoingDispatchQuantity?: number;
    invoicedQuantity?: number;
    nonBillableQuantity?: number;
    note?: string;
  }) {
    const rows = await this.readRows();
    const index = this.requireRow(rows, id);
    const current = rows[index];
    const next = {
      ...current,
      producedNetQuantity: payload.producedNetQuantity === undefined ? current.producedNetQuantity : Number(payload.producedNetQuantity),
      outgoingDispatchQuantity: payload.outgoingDispatchQuantity === undefined ? current.outgoingDispatchQuantity : Number(payload.outgoingDispatchQuantity),
      invoicedQuantity: payload.invoicedQuantity === undefined ? current.invoicedQuantity : Number(payload.invoicedQuantity),
      nonBillableQuantity: payload.nonBillableQuantity === undefined ? current.nonBillableQuantity : Number(payload.nonBillableQuantity),
    };
    for (const value of [next.producedNetQuantity, next.outgoingDispatchQuantity, next.invoicedQuantity, next.nonBillableQuantity]) {
      if (!Number.isFinite(value) || value < 0) throw new BadRequestException('Adetler sıfır veya daha büyük olmalıdır.');
    }
    calculateDispatchCapacity(next);
    rows[index] = {
      ...next,
      updatedAt: new Date().toISOString(),
      operations: [...(current.operations || []), this.operation('QUANTITIES_UPDATED', payload.note)],
    };
    await this.writeRows(rows);
    return this.withComputed(rows[index]);
  }

  async createOutgoingDispatch(id: string, payload: { quantity: number; note?: string; confirmed?: boolean }) {
    if (payload.confirmed !== true) {
      throw new BadRequestException('Giden irsaliye adedi kullanıcı tarafından onaylanmalıdır.');
    }
    const rows = await this.readRows();
    const index = this.requireRow(rows, id);
    const current = rows[index];
    if (current.companyRole === 'SUPPLIER') throw new BadRequestException('Tedarikçi belgesi için giden irsaliye oluşturulamaz.');
    if (!current.modelId && !current.modelName) throw new BadRequestException('Önce model bağlanmalıdır.');
    const quantity = Number(payload.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('İrsaliye adedi sıfırdan büyük olmalıdır.');
    const nextTotal = current.outgoingDispatchQuantity + quantity;
    const capacity = calculateDispatchCapacity({ ...current, outgoingDispatchQuantity: nextTotal });
    rows[index] = {
      ...current,
      outgoingDispatchQuantity: nextTotal,
      updatedAt: new Date().toISOString(),
      operations: [...(current.operations || []), this.operation('OUTGOING_DISPATCH_CREATED', payload.note, quantity)],
    };
    await this.writeRows(rows);
    return {
      intake: this.withComputed(rows[index]),
      capacity,
      draft: {
        sourceIntakeId: id,
        recipientName: current.companyName,
        modelId: current.modelId,
        modelName: current.modelName,
        orderNo: current.orderNo,
        sourceReference: current.customerDispatchNo || current.internalReference,
        quantity,
        note: String(payload.note || current.note || '').trim(),
      },
    };
  }
}
