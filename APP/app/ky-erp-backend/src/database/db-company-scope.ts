import { BadRequestException } from "@nestjs/common";
import { normalizeText } from "./db-normalize";

export function requireMainCompanySlug(value: unknown) {
  const slug = normalizeText(value);
  if (!slug) throw new BadRequestException("mainCompanySlug zorunludur.");
  return slug;
}

export async function ensureMainCompany(prisma: any, mainCompanySlug: string) {
  const slug = requireMainCompanySlug(mainCompanySlug);
  return prisma.mainCompany.upsert({
    where: { slug },
    create: { slug, name: slug },
    update: {},
  });
}
