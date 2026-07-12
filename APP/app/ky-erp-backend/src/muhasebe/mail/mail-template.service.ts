import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

type Payload = Record<string, any>;

const DEFAULT_VARIABLES = [
  "firmaAdi",
  "modelAdi",
  "siparisNo",
  "faturaNo",
  "irsaliyeNo",
  "faturaTarihi",
  "faturaTutari",
  "adet",
  "kalanAdet",
  "ekstreDonemi",
  "bayramNotu",
  "eksikFaturaListesi",
  "odemeDurumu",
  "aciklama",
];

const DEFAULT_TEMPLATES = [
  {
    code: "FATURA_IRSALIYE_GONDERIM",
    type: "FATURA_GONDERIM",
    name: "Fatura + Irsaliye Gonderim",
    subject: "{{modelAdi}} FATURA",
    body: `Merhaba,

{{modelAdi}} modeline ait faturamiz ve irsaliyemiz ektedir.

Fatura No: {{faturaNo}}
Irsaliye No: {{irsaliyeNo}}
Siparis No: {{siparisNo}}
Tutar: {{faturaTutari}}

Iyi calismalar.`,
  },
  {
    code: "MODEL_SIPARIS_FATURA_GONDERIM",
    type: "FATURA_GONDERIM",
    name: "Model / Siparis Bazli Fatura Gonderim",
    subject: "{{modelAdi}} - {{siparisNo}} FATURA",
    body: `Merhaba,

{{modelAdi}} model / {{siparisNo}} siparis numarasina ait faturamiz ektedir.

Fatura No: {{faturaNo}}
Irsaliye No: {{irsaliyeNo}}
Adet: {{adet}}

Iyi calismalar.`,
  },
  {
    code: "EKSTREDE_GORUNMEME",
    type: "EKSTRE_TAKIP",
    name: "Ekstrede Gorunmeyen Faturalar",
    subject: "{{ekstreDonemi}} Ekstrede Gorunmeyen Faturalar",
    body: `Merhaba,

Asagidaki faturalarimizin tarafimiza iletilen {{ekstreDonemi}} ekstresinde gorunmedigi tespit edilmistir.

{{#faturalar}}
- {{faturaNo}} | {{modelAdi}} | {{faturaTarihi}} | {{faturaTutari}}
{{/faturalar}}

Konunun kontrol edilerek muhasebe kayitlariniza alinmasi konusunda yardimci olmanizi rica ederiz.

Iyi calismalar.`,
  },
  {
    code: "BAYRAM_ACILIYET_EKSTRE",
    type: "EKSTRE_TAKIP",
    name: "Bayram / Tatil Oncesi Acil Ekstre Hatirlatma",
    subject: "{{ekstreDonemi}} Ekstre Kontrolu - Acil",
    body: `Merhaba,

Bayram haftasi nedeniyle asagidaki faturalarimizin kontrolunun aciliyet tasidigini belirtmek isteriz.

{{#faturalar}}
- {{faturaNo}} | {{modelAdi}} | {{faturaTutari}}
{{/faturalar}}

{{bayramNotu}}

Konuyla ilgili yardimci olmanizi rica ederiz.

Iyi calismalar.`,
  },
  {
    code: "ODEME_GIRMEMIS_FATURALAR",
    type: "ODEME_TAKIP",
    name: "Odeme Girmemis Faturalar",
    subject: "{{ekstreDonemi}} Odeme Kontrolu",
    body: `Merhaba,

Asagidaki faturalarimiz icin odeme kaydi gorunmemektedir. Kontrol edilerek bilgi verilmesini rica ederiz.

{{#faturalar}}
- {{faturaNo}} | {{modelAdi}} | {{faturaTarihi}} | {{faturaTutari}} | {{odemeDurumu}}
{{/faturalar}}

Tesekkurler.`,
  },
  {
    code: "KALAN_ADET_BILDIRIM",
    type: "MODEL_TAKIP",
    name: "Model Kalan Adet Bildirimi",
    subject: "{{modelAdi}} Kalan Adet Bilgisi",
    body: `Merhaba,

{{modelAdi}} modeli icin kayitlarimizdaki kalan adet bilgisi asagidaki gibidir.

Siparis No: {{siparisNo}}
Toplam Adet: {{adet}}
Kalan Adet: {{kalanAdet}}

Kontrol ederek donus yapmanizi rica ederiz.

Iyi calismalar.`,
  },
  {
    code: "SERBEST_MAIL",
    type: "GENEL",
    name: "Serbest Muhasebe Maili",
    subject: "{{modelAdi}} {{faturaNo}}",
    body: `Merhaba,

{{aciklama}}

Iyi calismalar.`,
  },
];

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeId(prefix = "mail") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

@Injectable()
export class MailTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  private slug(input: Payload = {}) {
    return clean(input.mainCompanySlug || input.mainCompanyId || "mecit-hakan");
  }

  private cleanCode(value: unknown) {
    const text = clean(value || "SABLON")
      .toLocaleUpperCase("tr-TR")
      .replace(/İ/g, "I")
      .replace(/Ş/g, "S")
      .replace(/Ğ/g, "G")
      .replace(/Ü/g, "U")
      .replace(/Ö/g, "O")
      .replace(/Ç/g, "C")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    return text || `SABLON_${Date.now()}`;
  }

  private async readJsonStore(
    mainCompanySlug: string,
    fileName: string,
    fallback: any,
  ) {
    const row = await this.prisma.jsonStore.findUnique({
      where: {
        scope_mainCompanySlug_fileName: {
          scope: "muhasebe",
          mainCompanySlug,
          fileName,
        },
      },
    });

    return row?.data ?? fallback;
  }

  private async writeJsonStore(
    mainCompanySlug: string,
    fileName: string,
    data: any,
  ) {
    return this.prisma.jsonStore.upsert({
      where: {
        scope_mainCompanySlug_fileName: {
          scope: "muhasebe",
          mainCompanySlug,
          fileName,
        },
      },
      create: {
        scope: "muhasebe",
        mainCompanySlug,
        fileName,
        data,
      },
      update: {
        data,
      },
    });
  }

  private async templates(slug: string) {
    const rows = await this.readJsonStore(slug, "mail-templates", []);
    return Array.isArray(rows) ? rows : [];
  }

  private async writeTemplates(slug: string, rows: any[]) {
    await this.writeJsonStore(slug, "mail-templates", rows);
    return rows;
  }

  private async drafts(slug: string) {
    const rows = await this.readJsonStore(slug, "mail-template-drafts", []);
    return Array.isArray(rows) ? rows : [];
  }

  private async writeDrafts(slug: string, rows: any[]) {
    await this.writeJsonStore(slug, "mail-template-drafts", rows);
    return rows;
  }

  async listTemplates(query: Payload = {}) {
    const slug = this.slug(query);
    const rows = await this.templates(slug);
    return {
      ok: true,
      data: rows.filter((item) => item.active !== false),
    };
  }

  async seedTemplates(body: Payload = {}) {
    const slug = this.slug(body);
    const rows = await this.templates(slug);
    const next = [...rows];
    const result: any[] = [];

    for (const template of DEFAULT_TEMPLATES) {
      const exists = next.find((item) => item.code === template.code);
      if (exists) {
        result.push({ code: template.code, action: "exists" });
        continue;
      }

      next.push({
        id: makeId("tpl"),
        ...template,
        variables: DEFAULT_VARIABLES,
        active: true,
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      result.push({ code: template.code, action: "created" });
    }

    await this.writeTemplates(slug, next);
    return {
      ok: true,
      message: "Varsayilan mail sablonlari hazirlandi.",
      data: result,
    };
  }

  async createTemplate(body: Payload = {}) {
    const slug = this.slug(body);
    const rows = await this.templates(slug);

    if (!clean(body.name)) throw new BadRequestException("Sablon adi zorunlu.");
    if (!clean(body.subject))
      throw new BadRequestException("Mail konusu zorunlu.");
    if (!clean(body.body))
      throw new BadRequestException("Mail govdesi zorunlu.");

    const code = this.cleanCode(body.code || body.name);
    if (rows.some((item) => item.code === code && item.active !== false)) {
      throw new BadRequestException("Bu sablon kodu zaten var.");
    }

    const item = {
      id: makeId("tpl"),
      code,
      type: clean(body.type || "GENEL"),
      name: clean(body.name),
      subject: String(body.subject || ""),
      body: String(body.body || ""),
      variables: Array.isArray(body.variables)
        ? body.variables
        : DEFAULT_VARIABLES,
      active: true,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.writeTemplates(slug, [...rows, item]);
    return { ok: true, data: item };
  }

  async updateTemplate(idValue: string, body: Payload = {}) {
    const slug = this.slug(body);
    const rows = await this.templates(slug);
    const index = rows.findIndex((item) => item.id === idValue);

    if (index < 0) throw new NotFoundException("Mail sablonu bulunamadi.");

    rows[index] = {
      ...rows[index],
      code:
        body.code !== undefined ? this.cleanCode(body.code) : rows[index].code,
      type: body.type !== undefined ? clean(body.type) : rows[index].type,
      name: body.name !== undefined ? clean(body.name) : rows[index].name,
      subject:
        body.subject !== undefined ? String(body.subject) : rows[index].subject,
      body: body.body !== undefined ? String(body.body) : rows[index].body,
      variables:
        body.variables !== undefined ? body.variables : rows[index].variables,
      active:
        body.active !== undefined ? Boolean(body.active) : rows[index].active,
      updatedAt: new Date().toISOString(),
    };

    await this.writeTemplates(slug, rows);
    return { ok: true, data: rows[index] };
  }

  async deleteTemplate(idValue: string, body: Payload = {}) {
    return this.updateTemplate(idValue, { ...body, active: false });
  }

  async renderTemplate(body: Payload = {}) {
    const slug = this.slug(body);
    const rows = await this.templates(slug);
    const template =
      rows.find((item) => item.id === body.templateId) ||
      rows.find((item) => item.code === body.templateCode);

    if (!template || template.active === false) {
      throw new NotFoundException("Aktif mail sablonu bulunamadi.");
    }

    const data = {
      ...(body.data || {}),
    };

    if (Array.isArray(body.faturalar)) {
      data.faturalar = body.faturalar;
      data.eksikFaturaListesi = this.makeInvoiceList(body.faturalar);
    }

    return {
      ok: true,
      data: {
        templateId: template.id,
        templateCode: template.code,
        templateName: template.name,
        subject: this.renderString(template.subject, data),
        body: this.renderString(template.body, data),
        variables: template.variables || DEFAULT_VARIABLES,
        rawData: data,
      },
    };
  }

  async createDraft(body: Payload = {}) {
    const slug = this.slug(body);
    const rendered = await this.renderTemplate(body);
    const rows = await this.drafts(slug);
    const draft = {
      id: makeId("draft"),
      templateId: rendered.data.templateId,
      templateCode: rendered.data.templateCode,
      templateName: rendered.data.templateName,
      firmId: clean(body.firmId),
      firmName: clean(body.firmName || body.data?.firmaAdi),
      modelId: clean(body.modelId),
      modelName: clean(body.modelName || body.data?.modelAdi),
      toList: this.asArray(body.toList),
      ccList: this.asArray(body.ccList),
      bccList: this.asArray(body.bccList),
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      subject: rendered.data.subject,
      body: rendered.data.body,
      status: "DRAFT_READY",
      sourceType: clean(body.sourceType || "MAIL_TEMPLATE"),
      sourceRefId: clean(body.sourceRefId),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sentAt: "",
    };

    await this.writeDrafts(slug, [draft, ...rows].slice(0, 500));
    return {
      ok: true,
      message: "Mail taslagi olusturuldu.",
      data: draft,
    };
  }

  async listDrafts(query: Payload = {}) {
    const slug = this.slug(query);
    return { ok: true, data: await this.drafts(slug) };
  }

  async markDraftSent(idValue: string, body: Payload = {}) {
    const slug = this.slug(body);
    const rows = await this.drafts(slug);
    const index = rows.findIndex((item) => item.id === idValue);

    if (index < 0) throw new NotFoundException("Mail taslagi bulunamadi.");

    rows[index] = {
      ...rows[index],
      status: "SENT",
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.writeDrafts(slug, rows);
    return {
      ok: true,
      message: "Mail gonderildi olarak isaretlendi.",
      data: rows[index],
    };
  }

  private renderString(template: string, data: Payload) {
    let output = String(template || "");

    output = output.replace(
      /{{#\s*([a-zA-Z0-9_.]+)\s*}}([\s\S]*?){{\/\s*\1\s*}}/g,
      (_match, key, inner) => {
        const value = this.getValue(data, key);
        if (!Array.isArray(value)) return "";

        return value
          .map((row) =>
            this.renderString(inner, {
              ...data,
              ...((row as Payload) || {}),
            }).trimEnd(),
          )
          .join("\n");
      },
    );

    output = output.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (_match, key) => {
      const value = this.getValue(data, key);
      if (value === null || value === undefined) return "";
      if (Array.isArray(value)) return value.join(", ");
      if (typeof value === "object") return JSON.stringify(value);
      return String(value);
    });

    return output;
  }

  private getValue(data: Payload, path: string) {
    return String(path)
      .split(".")
      .reduce((acc: any, key) => {
        if (acc === null || acc === undefined) return undefined;
        return acc[key];
      }, data);
  }

  private makeInvoiceList(rows: Payload[]) {
    return rows
      .map((row) => {
        const faturaNo = row.faturaNo || row.documentNo || row.belgeNo || "";
        const modelAdi = row.modelAdi || row.modelName || row.model || "";
        const tarih = row.faturaTarihi || row.tarih || row.date || "";
        const tutar = row.faturaTutari || row.tutar || row.amount || "";
        return `- ${faturaNo} | ${modelAdi} | ${tarih} | ${tutar}`;
      })
      .join("\n");
  }

  private asArray(value: any) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean).map(String);
    return String(value)
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
