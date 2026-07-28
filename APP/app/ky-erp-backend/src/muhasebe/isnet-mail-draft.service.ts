import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PrismaService } from "../prisma/prisma.service";

type Query = Record<string, any>;

const clean = (value: unknown) => String(value ?? "").replace(/[\r\n]+/g, " ").trim();
const arrayValue = (value: unknown): any[] => Array.isArray(value) ? value : [];

@Injectable()
export class IsnetMailDraftService {
  constructor(private readonly prisma: PrismaService) {}

  private slug(body: Query) {
    const slug = clean(body.mainCompanySlug || body.companyId);
    if (!slug) throw new BadRequestException("Ana firma seçimi zorunludur.");
    return slug;
  }

  private draftRoot() {
    const configured = clean(process.env.ISNET_MAIL_DRAFT_ROOT);
    if (configured) return configured;
    const localRoot = clean(process.env.LOCALAPPDATA) || path.join(os.homedir(), "AppData", "Local");
    return path.join(localRoot, "KYERP", "isnet-mail-drafts");
  }

  private safeFileName(value: unknown) {
    return clean(value)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/[. ]+$/g, "")
      .slice(0, 110) || "ISNET-MAIL";
  }

  private attachmentPath(item: any) {
    if (typeof item === "string") return clean(item);
    return clean(item?.filePath || item?.path || item?.absolutePath || item?.localPath);
  }

  private attachmentName(item: any, filePath: string) {
    if (typeof item === "string") return path.basename(filePath);
    return clean(item?.fileName || item?.name) || path.basename(filePath);
  }

  private mimeType(fileName: string) {
    const extension = path.extname(fileName).toLocaleLowerCase("tr-TR");
    if (extension === ".pdf") return "application/pdf";
    if (extension === ".xml") return "application/xml";
    return "application/octet-stream";
  }

  private foldBase64(buffer: Buffer) {
    return buffer.toString("base64").match(/.{1,76}/g)?.join("\r\n") || "";
  }

  async createDraft(id: string, body: Query = {}) {
    const slug = this.slug(body);
    const row = await this.prisma.mailPackage.findFirst({
      where: { id: clean(id), mainCompanySlug: slug, deletedAt: null },
    });
    if (!row) throw new NotFoundException("Mail paketi bulunamadı.");

    const toList = arrayValue(row.toList).map(clean).filter(Boolean);
    const ccList = arrayValue(row.ccList).map(clean).filter(Boolean);
    if (!toList.length) {
      throw new BadRequestException("Mail taslağı için en az bir alıcı zorunludur.");
    }

    const attachments = arrayValue(row.attachmentsJson)
      .map((item) => {
        const filePath = this.attachmentPath(item);
        return {
          source: item,
          filePath,
          fileName: this.attachmentName(item, filePath),
        };
      })
      .filter((item) => item.filePath && fs.existsSync(item.filePath));

    const pdfAttachments = attachments.filter((item) => /\.pdf$/i.test(item.fileName));
    if (pdfAttachments.length < 2) {
      throw new BadRequestException(
        "Mail taslağı oluşturulamadı: fatura ve irsaliye olmak üzere iki PDF eki hazır olmalıdır.",
      );
    }

    const subject = clean(row.subject) || `${clean(row.invoiceNo) || "Fatura"} belge paketi`;
    const bodyText = String(row.body || "Belgeler ektedir.").replace(/\r?\n/g, "\r\n");
    const boundary = `----KYERP-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const lines = [
      `To: ${toList.join(", ")}`,
      ...(ccList.length ? [`Cc: ${ccList.join(", ")}`] : []),
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary=\"${boundary}\"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      bodyText,
      "",
    ];

    for (const attachment of attachments) {
      const buffer = fs.readFileSync(attachment.filePath);
      const encodedName = encodeURIComponent(attachment.fileName);
      lines.push(
        `--${boundary}`,
        `Content-Type: ${this.mimeType(attachment.fileName)}; name*=UTF-8''${encodedName}`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename*=UTF-8''${encodedName}`,
        "",
        this.foldBase64(buffer),
        "",
      );
    }
    lines.push(`--${boundary}--`, "");

    const root = this.draftRoot();
    fs.mkdirSync(root, { recursive: true });
    const fileName = `${this.safeFileName(`${row.invoiceNo || row.dispatchNo || row.id} - ${subject}`)}.eml`;
    const filePath = path.join(root, fileName);
    fs.writeFileSync(filePath, lines.join("\r\n"), "utf8");

    const raw = row.raw && typeof row.raw === "object" && !Array.isArray(row.raw)
      ? row.raw as Record<string, any>
      : {};
    const updated = await this.prisma.mailPackage.update({
      where: { id: row.id },
      data: {
        status: "DRAFT_CREATED",
        raw: {
          ...raw,
          emlPath: filePath,
          emlCreatedAt: new Date().toISOString(),
          emlAttachmentCount: attachments.length,
        },
      },
    });

    return {
      ok: true,
      id: updated.id,
      status: updated.status,
      filePath,
      fileName,
      recipientCount: toList.length + ccList.length,
      attachmentCount: attachments.length,
      message: "Outlook ile açılabilir mail taslağı oluşturuldu.",
    };
  }
}
