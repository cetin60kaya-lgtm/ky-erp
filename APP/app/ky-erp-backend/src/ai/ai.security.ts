import { createHash, timingSafeEqual } from "crypto";
import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { AI_CONFIG } from "./ai.config";

export function cleanUserText(value: unknown): string {
  const text = String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) throw new BadRequestException("Mesaj boş olamaz.");
  if (text.length > AI_CONFIG.maxMessageLength) {
    throw new BadRequestException(`Mesaj en fazla ${AI_CONFIG.maxMessageLength} karakter olabilir.`);
  }
  return text;
}

export function maskSensitiveData(value: unknown): string {
  return String(value ?? "")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[API_ANAHTARI_MASKELENDI]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~-]{12,}\b/gi, "$1[TOKEN_MASKELENDI]")
    .replace(/\bTR\d{24}\b/gi, "TR**********************")
    .replace(/\b\d{11}\b/g, "***********")
    .replace(/\b(password|parola|şifre|api[_ -]?key|token)\s*[:=]\s*\S+/gi, "$1=[GIZLI]");
}

export function looksLikePromptInjection(value: string): boolean {
  return [
    /önceki\s+(talimat|komut|kurallar)[ıi]\s+(unut|yok say)/i,
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /system\s+prompt(unu|u)?\s+(göster|yaz|print)/i,
    /api\s*(key|anahtar)[ıi]?n?[ıi]?\s+(göster|ver|yaz)/i,
    /doğrudan\s+sql/i,
    /drop\s+table|delete\s+from|truncate\s+table/i,
  ].some((pattern) => pattern.test(value));
}

export const hashConfirmationToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export function tokensMatch(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashConfirmationToken(token), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function assertConfirmationUsable(status: string, expiresAt: Date, token: string, expectedHash: string) {
  if (status !== "PENDING") throw new ConflictException("Bu onay bağlantısı daha önce kullanılmış veya iptal edilmiş.");
  if (expiresAt.getTime() <= Date.now()) throw new ConflictException("Onay bağlantısının süresi dolmuş.");
  if (!tokensMatch(token, expectedHash)) throw new ForbiddenException("Onay anahtarı geçersiz.");
}

export function safeJsonObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new BadRequestException("Geçerli bir nesne bekleniyor.");
  }
  return value as Record<string, any>;
}

export function translateOpenAiError(error: any): string {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.error?.code || "").toLowerCase();
  const name = String(error?.name || "").toLowerCase();
  if (name.includes("abort") || code.includes("timeout"))
    return "Yapay zekâ servisi zamanında yanıt vermedi. Lütfen tekrar deneyin.";
  if (status === 401) return "OpenAI API anahtarı doğrulanamadı. Sistem yöneticisi anahtarı kontrol etmelidir.";
  if (status === 429 || code.includes("rate_limit"))
    return "Yapay zekâ kullanım sınırına ulaşıldı. Kısa süre sonra tekrar deneyin.";
  if (code.includes("insufficient_quota"))
    return "OpenAI kullanım kotası veya bakiyesi yetersiz. Hesap ayarlarını kontrol edin.";
  if (status >= 500) return "Yapay zekâ servisi geçici olarak kullanılamıyor. Lütfen tekrar deneyin.";
  return "Yapay zekâ isteği tamamlanamadı. Girilen bilgileri kontrol edip tekrar deneyin.";
}
