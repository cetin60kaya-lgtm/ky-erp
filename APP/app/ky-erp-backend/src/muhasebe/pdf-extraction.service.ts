import { Injectable, BadRequestException } from "@nestjs/common";
import * as fs from "fs";
const pdfParse = require("pdf-parse");

interface PdfExtractionResult {
  text: string;
  pageCount: number;
  extractedPages: number;
  quality: "high" | "medium" | "low";
  extractorUsed: "pdf-parse" | "pdfjs-dist";
  extractorFallbackUsed: boolean;
  errors?: string[];
}

@Injectable()
export class PdfExtractionService {
  private readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly MAX_PAGES = 500;

  async extractTextFromPdf(filePath: string): Promise<PdfExtractionResult> {
    this.validateFilePath(filePath);

    try {
      const buffer = await fs.promises.readFile(filePath);
      this.validateFileSize(buffer.length);
      const extractionErrors: string[] = [];
      const primaryResult = await this.tryExtractWithPdfParse(
        buffer,
        extractionErrors,
      );
      const primaryQuality = this.assessTextQuality(primaryResult.text);
      const primaryLooksWeak = this.isWeakExtraction(
        primaryResult.text,
        primaryQuality,
      );

      if (!primaryLooksWeak) {
        return {
          ...primaryResult,
          quality: primaryQuality,
          extractorUsed: "pdf-parse",
          extractorFallbackUsed: false,
          errors: extractionErrors.length ? extractionErrors : undefined,
        };
      }

      const fallbackResult = await this.extractWithPdfJs(buffer);
      const fallbackQuality = this.assessTextQuality(fallbackResult.text);
      const fallbackLooksWeak = this.isWeakExtraction(
        fallbackResult.text,
        fallbackQuality,
      );

      if (!fallbackLooksWeak) {
        return {
          ...fallbackResult,
          quality: fallbackQuality,
          extractorUsed: "pdfjs-dist",
          extractorFallbackUsed: true,
          errors: extractionErrors.length ? extractionErrors : undefined,
        };
      }

      // If both are weak, keep the longer text payload to avoid data loss.
      const preferred =
        fallbackResult.text.length > primaryResult.text.length
          ? {
              ...fallbackResult,
              quality: fallbackQuality,
              extractorUsed: "pdfjs-dist" as const,
              extractorFallbackUsed: true,
            }
          : {
              ...primaryResult,
              quality: primaryQuality,
              extractorUsed: "pdf-parse" as const,
              extractorFallbackUsed: false,
            };

      return {
        ...preferred,
        errors: extractionErrors.length
          ? extractionErrors
          : [
              "PDF metin çıkarımı zayıf kalite üretti; OCR fallback değerlendirilmeli.",
            ],
      };
    } catch (error) {
      throw new BadRequestException(
        `PDF işleme hatası: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
      );
    }
  }

  private async tryExtractWithPdfParse(
    buffer: Buffer,
    extractionErrors: string[],
  ): Promise<
    Omit<
      PdfExtractionResult,
      "quality" | "extractorUsed" | "extractorFallbackUsed"
    >
  > {
    try {
      const parsed = await pdfParse(buffer);
      const text = String(parsed?.text || "")
        .replace(/\r/g, "")
        .trim();
      return {
        text,
        pageCount: Number(parsed?.numpages || 0),
        extractedPages: Number(parsed?.numpages || 0),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      extractionErrors.push(`pdf-parse başarısız: ${msg}`);
      return {
        text: "",
        pageCount: 0,
        extractedPages: 0,
      };
    }
  }

  private async extractWithPdfJs(
    buffer: Buffer,
  ): Promise<
    Omit<
      PdfExtractionResult,
      "quality" | "extractorUsed" | "extractorFallbackUsed"
    >
  > {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      isEvalSupported: false,
      useWorkerFetch: false,
    } as any);
    const pdf = await loadingTask.promise;

    try {
      this.validatePageCount(pdf.numPages);
      return await this.extractAllPages(pdf);
    } finally {
      await pdf.destroy?.();
    }
  }

  private isWeakExtraction(text: string, quality: "high" | "medium" | "low") {
    const normalized = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return true;
    if (quality === "low") return true;
    const lineCount = String(text || "")
      .split(/\r?\n/)
      .filter(Boolean).length;
    if (lineCount <= 1 && normalized.length < 140) return true;
    const alphaNum = (normalized.match(/[A-Za-zÇĞİÖŞÜçğıöşü0-9]/g) || [])
      .length;
    const ratio = alphaNum / Math.max(normalized.length, 1);
    return ratio < 0.2;
  }

  private validateFilePath(filePath: string) {
    if (!filePath || typeof filePath !== "string") {
      throw new Error("Geçersiz dosya yolu");
    }
    if (!fs.existsSync(filePath)) {
      throw new Error("Dosya bulunamadı");
    }
  }

  private validateFileSize(size: number) {
    if (size > this.MAX_FILE_SIZE) {
      throw new Error(
        `Dosya çok büyük. Maksimum ${this.MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }
    if (size < 100) {
      throw new Error("Dosya çok küçük veya boş");
    }
  }

  private validatePageCount(pageCount: number) {
    if (pageCount > this.MAX_PAGES) {
      throw new Error(
        `PDF çok fazla sayfa içeriyor (${pageCount}/${this.MAX_PAGES})`,
      );
    }
  }

  private async extractAllPages(
    pdf: any,
  ): Promise<
    Omit<
      PdfExtractionResult,
      "quality" | "extractorUsed" | "extractorFallbackUsed"
    >
  > {
    const textParts: string[] = [];
    const errors: string[] = [];
    let successCount = 0;

    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const pageText = await this.extractPageText(pdf, i);
        if (pageText.trim()) {
          textParts.push(pageText);
          successCount++;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Sayfa ${i}: ${msg}`);
      }
    }

    if (successCount === 0) {
      throw new Error("Hiçbir sayfadan metin çıkarılamadı");
    }

    return {
      text: textParts.join("\n"),
      pageCount: pdf.numPages,
      extractedPages: successCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  private async extractPageText(pdf: any, pageNum: number): Promise<string> {
    try {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent({
        disableNormalization: false,
        includeMarkedContent: false,
      });

      return this.buildLinesFromTextItems(content.items);
    } catch (error) {
      throw error;
    }
  }

  private buildLinesFromTextItems(items: any[]): string {
    const positionedItems = items
      .map((item: any) => {
        const text = String(item?.str ?? "").trim();
        const transform = Array.isArray(item?.transform) ? item.transform : [];
        const x = Number(transform[4]);
        const y = Number(transform[5]);

        return {
          text,
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
          hasPosition: Number.isFinite(x) && Number.isFinite(y),
        };
      })
      .filter((item) => item.text);

    if (positionedItems.length === 0) {
      return "";
    }

    if (!positionedItems.some((item) => item.hasPosition)) {
      return positionedItems.map((item) => item.text).join(" ");
    }

    const yTolerance = 2.5;
    const lines: Array<{
      y: number;
      parts: Array<{ x: number; text: string }>;
    }> = [];

    for (const item of positionedItems.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const line = lines.find(
        (candidate) => Math.abs(candidate.y - item.y) <= yTolerance,
      );

      if (line) {
        line.parts.push({ x: item.x, text: item.text });
        line.y = (line.y + item.y) / 2;
      } else {
        lines.push({ y: item.y, parts: [{ x: item.x, text: item.text }] });
      }
    }

    return lines
      .sort((a, b) => b.y - a.y)
      .map((line) =>
        line.parts
          .sort((a, b) => a.x - b.x)
          .map((part) => part.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean)
      .join("\n");
  }

  private assessTextQuality(text: string): "high" | "medium" | "low" {
    const lines = text.split(/\r?\n/).filter(Boolean);
    const totalChars = text.length;
    const letters = (text.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length;
    const digits = (text.match(/[0-9]/g) || []).length;
    const useful = letters + digits;

    const usefulRatio = useful / Math.max(totalChars, 1);
    const lineScore = Math.min(1, lines.length / 50);
    const score = usefulRatio * 0.7 + lineScore * 0.3;

    if (score > 0.7) return "high";
    if (score > 0.4) return "medium";
    return "low";
  }
}
