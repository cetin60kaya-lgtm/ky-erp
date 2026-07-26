import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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

type SourceIntakeRow = NormalizedIsnetSourceIntake & {
  id: string;
  createdAt: string;
  updatedAt: string;
  pdfPath: string | null;
  outgoingDispatchQuantity: number;
  invoicedQuantity: number;
  nonBillableQuantity: number;
  producedNetQuantity: number;
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

  async list(filters: Record<string, string | undefined> = {}) {
    const query = String(filters.search || '').trim().toLocaleLowerCase('tr-TR');
    const rows = await this.readRows();
    return rows
      .filter((row) => !filters.sourceType || row.sourceType === filters.sourceType)
      .filter((row) => !filters.status || row.status === filters.status)
      .filter((row) => !filters.companyId || row.companyId === filters.companyId)
      .filter((row) => !filters.modelId || row.modelId === filters.modelId)
      .filter((row) => !filters.startDate || row.issueDate >= filters.startDate)
      .filter((row) => !filters.endDate || row.issueDate <= filters.endDate)
      .filter((row) => !query || [row.companyName, row.modelName, row.orderNo, row.customerDispatchNo, row.internalReference]
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .includes(query))
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.createdAt.localeCompare(a.createdAt))
      .map((row) => ({ ...row, capacity: calculateDispatchCapacity(row) }));
  }

  async detail(id: string) {
    const row = (await this.readRows()).find((item) => item.id === id);
    if (!row) throw new NotFoundException('İşNet kaynak kaydı bulunamadı.');
    return { ...row, capacity: calculateDispatchCapacity(row) };
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
    };
    rows.push(row);
    await this.writeRows(rows);
    return { ...row, capacity: calculateDispatchCapacity(row) };
  }

  async assignModel(id: string, payload: { modelId?: string; modelName?: string }) {
    const rows = await this.readRows();
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) throw new NotFoundException('İşNet kaynak kaydı bulunamadı.');
    rows[index] = {
      ...rows[index],
      modelId: String(payload.modelId || '').trim() || null,
      modelName: String(payload.modelName || '').trim().toLocaleUpperCase('tr-TR'),
      status: rows[index].companyRole === 'SUPPLIER'
        ? 'NON_BILLABLE_SUPPLIER'
        : payload.modelId
          ? 'READY_FOR_PRODUCTION'
          : 'MODEL_PENDING',
      updatedAt: new Date().toISOString(),
    };
    await this.writeRows(rows);
    return rows[index];
  }

  async linkCustomerDispatch(id: string, payload: { customerDispatchNo: string; ettn?: string }) {
    const rows = await this.readRows();
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) throw new NotFoundException('İşNet kaynak kaydı bulunamadı.');
    rows[index] = {
      ...rows[index],
      customerDispatchNo: String(payload.customerDispatchNo || '').trim().toLocaleUpperCase('tr-TR'),
      ettn: String(payload.ettn || '').trim().toLocaleUpperCase('tr-TR') || null,
      customerDispatchMissing: false,
      updatedAt: new Date().toISOString(),
    };
    await this.writeRows(rows);
    return rows[index];
  }

  async prepareOutgoingDispatch(id: string, payload: { quantity: number; note?: string }) {
    const rows = await this.readRows();
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) throw new NotFoundException('İşNet kaynak kaydı bulunamadı.');
    const current = rows[index];
    const quantity = Number(payload.quantity || 0);
    const nextTotal = current.outgoingDispatchQuantity + quantity;
    const capacity = calculateDispatchCapacity({ ...current, outgoingDispatchQuantity: nextTotal });
    rows[index] = { ...current, outgoingDispatchQuantity: nextTotal, updatedAt: new Date().toISOString() };
    await this.writeRows(rows);
    return {
      intake: rows[index],
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
