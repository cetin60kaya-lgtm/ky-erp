import { Injectable } from "@nestjs/common";
import * as fs from "node:fs";
import * as path from "node:path";

export type AiEBelgeLine = {
  lineNo: number;
  productCode: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  subtotal: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  lotNo: string;
};

export type AiEBelgeExtraction = {
  documentType: "INVOICE" | "DESPATCH" | "OTHER";
  directionHint: "INCOMING" | "OUTGOING" | "UNKNOWN";
  documentNo: string;
  invoiceNo: string;
  dispatchNo: string;
  dispatchReferences: string[];
  issueDate: string;
  dueDate: string;
  scenario: string;
  issuerName: string;
  issuerTaxNo: string;
  receiverName: string;
  receiverTaxNo: string;
  currency: string;
  subtotal: number;
  vatTotal: number;
  grandTotal: number;
  lines: AiEBelgeLine[];
  confidence: number;
  warnings: string[];
};

const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const numberValue = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = clean(value).replace(/[^\d,.-]/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

@Injectable()
export class EBelgeAiExtractorService {
  private safeJson(value: unknown) {
    const source = clean(value)
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    try {
      return JSON.parse(source);
    } catch {
      const match = source.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }

  private outputText(body: any) {
    return clean(
      body?.output_text ||
        body?.output
          ?.flatMap((item: any) => item?.content || [])
          .map((item: any) => item?.text || item?.output_text || "")
          .join(" ") ||
        "",
    );
  }

  private normalize(raw: any): AiEBelgeExtraction {
    const documentTypeRaw = clean(raw?.documentType).toLocaleUpperCase("tr-TR");
    const documentType: AiEBelgeExtraction["documentType"] = /IRSALIYE|İRSALİYE|DESPATCH/.test(documentTypeRaw)
      ? "DESPATCH"
      : /FATURA|INVOICE/.test(documentTypeRaw)
        ? "INVOICE"
        : "OTHER";
    const directionRaw = clean(raw?.directionHint).toLocaleUpperCase("tr-TR");
    const directionHint: AiEBelgeExtraction["directionHint"] = directionRaw === "INCOMING"
      ? "INCOMING"
      : directionRaw === "OUTGOING"
        ? "OUTGOING"
        : "UNKNOWN";
    const lines = Array.isArray(raw?.lines) ? raw.lines : [];
    const normalizedLines: AiEBelgeLine[] = lines.map((line: any, index: number) => ({
      lineNo: Number(line?.lineNo || index + 1),
      productCode: clean(line?.productCode),
      description: clean(line?.description || line?.productName || line?.name),
      quantity: numberValue(line?.quantity),
      unit: clean(line?.unit || "ADET"),
      unitPrice: numberValue(line?.unitPrice),
      subtotal: numberValue(line?.subtotal),
      vatRate: numberValue(line?.vatRate),
      vatAmount: numberValue(line?.vatAmount),
      total: numberValue(line?.total),
      lotNo: clean(line?.lotNo),
    }));

    return {
      documentType,
      directionHint,
      documentNo: clean(raw?.documentNo),
      invoiceNo: clean(raw?.invoiceNo),
      dispatchNo: clean(raw?.dispatchNo),
      dispatchReferences: [...new Set((Array.isArray(raw?.dispatchReferences) ? raw.dispatchReferences : []).map(clean).filter(Boolean))],
      issueDate: clean(raw?.issueDate),
      dueDate: clean(raw?.dueDate),
      scenario: clean(raw?.scenario),
      issuerName: clean(raw?.issuerName),
      issuerTaxNo: clean(raw?.issuerTaxNo).replace(/\D/g, ""),
      receiverName: clean(raw?.receiverName),
      receiverTaxNo: clean(raw?.receiverTaxNo).replace(/\D/g, ""),
      currency: clean(raw?.currency || "TRY").toUpperCase(),
      subtotal: numberValue(raw?.subtotal),
      vatTotal: numberValue(raw?.vatTotal),
      grandTotal: numberValue(raw?.grandTotal),
      lines: normalizedLines,
      confidence: Math.max(0, Math.min(100, numberValue(raw?.confidence))),
      warnings: (Array.isArray(raw?.warnings) ? raw.warnings : []).map(clean).filter(Boolean),
    };
  }

  async extract(args: {
    filePath: string;
    mimeType?: string | null;
    originalFileName?: string | null;
  }) {
    const apiKey = clean(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      return {
        status: "DISABLED_NO_KEY" as const,
        data: null,
        warning: "AI belge okuma için OPENAI_API_KEY tanımlı değil.",
      };
    }

    const filePath = clean(args.filePath);
    if (!filePath || !fs.existsSync(filePath)) {
      return {
        status: "FILE_NOT_FOUND" as const,
        data: null,
        warning: "AI belge okuma için kaynak dosya bulunamadı.",
      };
    }

    const buffer = fs.readFileSync(filePath);
    const maxBytes = Math.max(1, Number(process.env.KYERP_EBELGE_AI_MAX_MB || 20)) * 1024 * 1024;
    if (buffer.length > maxBytes) {
      return {
        status: "FILE_TOO_LARGE" as const,
        data: null,
        warning: `AI belge okuma sınırı aşıldı (${Math.round(buffer.length / 1024 / 1024)} MB).`,
      };
    }

    const fileName = clean(args.originalFileName) || path.basename(filePath);
    const ext = path.extname(fileName).toLocaleLowerCase("tr-TR");
    const mime = clean(args.mimeType) || (ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg");
    const prompt = [
      "Bu dosya Türkiye e-Belge/e-Fatura/e-İrsaliye veya ticari belge görüntüsüdür.",
      "OCR metni kullanma; dosyanın kendisini görsel/dosya girdisi olarak analiz et.",
      "Belgede açıkça görünmeyen veriyi uydurma. Emin olmadığın alanı boş bırak ve warnings alanına ekle.",
      "Fatura içindeki tüm irsaliye referanslarını dispatchReferences listesine yaz.",
      "Her ürün kaleminde ürün kodu/açıklaması, miktar, birim, fiyat, KDV ve varsa LOT bilgisini ayrı çıkar.",
      "Tutarları sayı olarak, tarihleri YYYY-MM-DD olarak döndür.",
      "Yalnız geçerli JSON döndür. Şema:",
      JSON.stringify({
        documentType: "INVOICE|DESPATCH|OTHER",
        directionHint: "INCOMING|OUTGOING|UNKNOWN",
        documentNo: "",
        invoiceNo: "",
        dispatchNo: "",
        dispatchReferences: [""],
        issueDate: "YYYY-MM-DD",
        dueDate: "YYYY-MM-DD",
        scenario: "",
        issuerName: "",
        issuerTaxNo: "",
        receiverName: "",
        receiverTaxNo: "",
        currency: "TRY",
        subtotal: 0,
        vatTotal: 0,
        grandTotal: 0,
        lines: [{ lineNo: 1, productCode: "", description: "", quantity: 0, unit: "", unitPrice: 0, subtotal: 0, vatRate: 0, vatAmount: 0, total: 0, lotNo: "" }],
        confidence: 0,
        warnings: [""],
      }),
    ].join("\n");

    const fileContent = ext === ".pdf" || /pdf/i.test(mime)
      ? {
          type: "input_file",
          filename: fileName,
          file_data: `data:${mime};base64,${buffer.toString("base64")}`,
        }
      : {
          type: "input_image",
          image_url: `data:${mime};base64,${buffer.toString("base64")}`,
          detail: "high",
        };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: clean(process.env.KYERP_EBELGE_AI_MODEL || process.env.OPENAI_MODEL) || "gpt-5.6-sol",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              fileContent,
            ],
          },
        ],
        temperature: 0,
        max_output_tokens: Math.max(1200, Number(process.env.KYERP_EBELGE_AI_MAX_OUTPUT_TOKENS || 5000)),
      }),
    });

    if (!response.ok) {
      const body = clean(await response.text()).slice(0, 500);
      throw new Error(`AI belge analizi HTTP ${response.status}${body ? `: ${body}` : ""}`);
    }
    const body: any = await response.json();
    const parsed = this.safeJson(this.outputText(body));
    if (!parsed) throw new Error("AI belge analizi geçerli JSON döndürmedi.");
    return {
      status: "COMPLETED" as const,
      data: this.normalize(parsed),
      warning: "",
      model: clean(body?.model),
      responseId: clean(body?.id),
    };
  }
}
