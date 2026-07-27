import { Prisma } from "@prisma/client";

export function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSearchText(value: unknown) {
  return normalizeText(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function safeDecimal(value: unknown) {
  if (value instanceof Prisma.Decimal) return value;
  const numberValue = Number(value ?? 0);
  return new Prisma.Decimal(Number.isFinite(numberValue) ? numberValue : 0);
}

export function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value == null) return 0;
  return Number(value);
}
