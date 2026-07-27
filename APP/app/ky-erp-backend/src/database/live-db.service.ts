import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ensureMainCompany, requireMainCompanySlug } from "./db-company-scope";
import { normalizeText } from "./db-normalize";
import { makePaginatedResponse, parsePageLimit } from "./db-pagination";

@Injectable()
export class LiveDbService {
  constructor(private readonly prisma: PrismaService) {}

  async list(modelName: string, query: Record<string, any> = {}, searchable: string[] = []) {
    const mainCompanySlug = requireMainCompanySlug(query.mainCompanySlug);
    await ensureMainCompany(this.prisma, mainCompanySlug);
    const { page, limit, skip } = parsePageLimit(query);
    const delegate = (this.prisma as any)[modelName];
    const q = normalizeText(query.q);
    const where: Record<string, any> = { mainCompanySlug };
    if (q && searchable.length) {
      where.OR = searchable.map((field) => ({
        [field]: { contains: q },
      }));
    }
    for (const [key, value] of Object.entries(query.filter || {})) {
      if (value !== undefined && value !== null && value !== "") where[key] = value;
    }
    const [total, rows] = await this.prisma.$transaction([
      delegate.count({ where }),
      delegate.findMany({
        where,
        orderBy: query.sort ? this.parseSort(query.sort) : [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);
    return makePaginatedResponse(rows, page, limit, total);
  }

  private parseSort(sort: any) {
    const text = normalizeText(sort);
    if (!text) return [{ createdAt: "desc" }];
    const [field, direction] = text.split(":");
    return [{ [field || "createdAt"]: direction === "asc" ? "asc" : "desc" }];
  }
}
