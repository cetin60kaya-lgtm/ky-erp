import { Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { SqlStoreService } from "../kyerp-core/sql-store.service";
import { BadRequestException, ConflictException } from "@nestjs/common";

type MainCompany = {
  id: string;
  name: string;
  slug: string;
  note: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type CompanyAliasRow = {
  id: number;
  rawName: string;
  normalizedRawName: string;
  matchedCompanyId: number | string;
  matchedCompanyName: string;
  sourceType: string;
  hitCount: number;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt: string;
  note: string;
};

type ProductAliasRow = {
  id: number;
  rawName: string;
  normalizedRawName: string;
  matchedProductId: number | string;
  matchedProductName: string;
  matchedProductCode: string;
  sourceType: string;
  hitCount: number;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt: string;
  note: string;
};

@Injectable()
export class AdminService {
  constructor(private readonly db: SqlStoreService) {}

  private readonly MAIN_COMPANY_FILES = [
    "companies",
    "company-aliases",
    "product-aliases",
    "cari-movements",
    "payments",
    "payment-types.json",
    "checks",
    "credit-cards",
    "documents",
    "email-contacts",
    "products",
  ] as const;

  private readonly firmaEsleme = [
    {
      id: "a1",
      anaFirma: "Mecit Hakan",
      bagliFirma: "URAS KİMYA",
      kayitTipi: "Resmi",
      kdvDurumu: "KDV Dahil",
    },
    {
      id: "a2",
      anaFirma: "Mecit Hakan",
      bagliFirma: "TURAN KİMYA",
      kayitTipi: "Resmi",
      kdvDurumu: "KDV Hariç",
    },
    {
      id: "a3",
      anaFirma: "Mecit Hakan Gürsü",
      bagliFirma: "TAHA",
      kayitTipi: "Resmi",
      kdvDurumu: "KDV Dahil",
    },
    {
      id: "a4",
      anaFirma: "Mecit Hakan Gürsü",
      bagliFirma: "MİNT / MİND",
      kayitTipi: "Gayri Resmi",
      kdvDurumu: "KDV Hesaplanmaz",
    },
  ];

  private readonly mailKisileri = [
    {
      id: "m1",
      firma: "Mecit Hakan",
      departman: "Muhasebe",
      kisiAdi: "Muhasebe 1",
      eposta: "muhasebe1@example.com",
      varsayilan: "Evet",
      aktif: "Evet",
    },
    {
      id: "m2",
      firma: "Mecit Hakan",
      departman: "Muhasebe",
      kisiAdi: "Muhasebe 2",
      eposta: "muhasebe2@example.com",
      varsayilan: "Hayır",
      aktif: "Evet",
    },
    {
      id: "m3",
      firma: "Mecit Hakan Gürsü",
      departman: "Satış",
      kisiAdi: "Satış 1",
      eposta: "satis1@example.com",
      varsayilan: "Evet",
      aktif: "Evet",
    },
  ];

  getFirmaEsleme() {
    return this.firmaEsleme;
  }
  getMailKisileri(payload?: {
    mainCompanyId?: string;
    mainCompanySlug?: string;
  }) {
    const slug = this.requireMainCompanySlug(
      payload?.mainCompanyId,
      payload?.mainCompanySlug,
    );
    return this.db.readMainCompanyStore<any[]>(slug, "email-contacts", []);
  }

  getFirmaKartlari(payload?: {
    mainCompanyId?: string;
    mainCompanySlug?: string;
  }) {
    const slug = this.requireMainCompanySlug(
      payload?.mainCompanyId,
      payload?.mainCompanySlug,
    );
    return this.db.readMainCompanyStore<any[]>(slug, "companies", []);
  }

  saveFirmaKarti(payload: Record<string, any>) {
    const slug = this.requireMainCompanySlug(
      payload.mainCompanyId,
      payload.mainCompanySlug,
    );
    const rows = this.db.readMainCompanyStore<any[]>(slug, "companies", []);
    const now = this.nowIso();
    const id = payload.id || Date.now();
    const idx = rows.findIndex((row) => String(row.id) === String(id));
    const next = {
      ...(idx >= 0 ? rows[idx] : {}),
      ...payload,
      id,
      updatedAt: now,
      createdAt: idx >= 0 ? rows[idx].createdAt || now : now,
    };
    if (idx >= 0) rows[idx] = next;
    else rows.unshift(next);
    this.db.writeMainCompanyStore(slug, "companies", rows);
    return next;
  }

  getFirmaContacts(
    firmId: string,
    payload?: { mainCompanyId?: string; mainCompanySlug?: string },
  ) {
    const slug = this.requireMainCompanySlug(
      payload?.mainCompanyId,
      payload?.mainCompanySlug,
    );
    const rows = this.db.readMainCompanyStore<any[]>(
      slug,
      "email-contacts",
      [],
    );
    return rows.filter(
      (row) =>
        String(row.firmId || row.companyId || row.relatedCompanyId || "") ===
          String(firmId) || String(row.firmaId || "") === String(firmId),
    );
  }

  saveFirmaContact(payload: Record<string, any>) {
    const slug = this.requireMainCompanySlug(
      payload.mainCompanyId,
      payload.mainCompanySlug,
    );
    const rows = this.db.readMainCompanyStore<any[]>(
      slug,
      "email-contacts",
      [],
    );
    const now = this.nowIso();
    const id = payload.id || Date.now();
    const idx = rows.findIndex((row) => String(row.id) === String(id));
    const next = {
      ...(idx >= 0 ? rows[idx] : {}),
      ...payload,
      id,
      updatedAt: now,
      createdAt: idx >= 0 ? rows[idx].createdAt || now : now,
    };
    if (idx >= 0) rows[idx] = next;
    else rows.unshift(next);
    this.db.writeMainCompanyStore(slug, "email-contacts", rows);
    return next;
  }
  getKdvBaglantisi() {
    return this.firmaEsleme.filter(
      (x) => x.kayitTipi === "Resmi" && x.kdvDurumu !== "KDV Hesaplanmaz",
    );
  }
  getYedekleme() {
    return {
      varsayilanFormat: "Excel",
      hedefKlasor: "D:\\KY-ERP\\backup",
      bolumler: ["Muhasebe", "Personel", "İmalat", "Tüm Sistem"],
    };
  }
  getLoglar() {
    return [];
  }

  private readonly ADMIN_SETTINGS_FILE = "admin-settings.json";
  private readonly DEFAULT_DELETE_COMPANY_PASSWORD = "admin123";

  private getAdminSettings() {
    return this.db.readStore<{
      deleteCompanyPassword?: string;
      updatedAt?: string;
    }>(this.ADMIN_SETTINGS_FILE, {
      deleteCompanyPassword: this.DEFAULT_DELETE_COMPANY_PASSWORD,
      updatedAt: this.nowIso(),
    });
  }

  getDeleteCompanyPassword() {
    const envPassword = this.cleanText(
      process.env.KY_ERP_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD,
    );
    if (envPassword) {
      return {
        password: envPassword,
        source: "env",
      };
    }
    const settings = this.getAdminSettings();
    return {
      password:
        this.cleanText(settings?.deleteCompanyPassword) ||
        this.DEFAULT_DELETE_COMPANY_PASSWORD,
      source: "file",
    };
  }

  getSecuritySummary() {
    const security = this.getDeleteCompanyPassword();
    return {
      deleteCompanyPasswordConfigured: Boolean(security.password),
      deleteCompanyPasswordSource: security.source,
      usesDefaultDeleteCompanyPassword:
        security.source === "file" &&
        security.password === this.DEFAULT_DELETE_COMPANY_PASSWORD,
    };
  }

  validateDeleteCompanyPassword(rawPassword: any) {
    const submitted = this.cleanText(rawPassword);
    if (!submitted) {
      throw new BadRequestException("Admin şifresi zorunludur.");
    }
    const security = this.getDeleteCompanyPassword();
    if (submitted !== security.password) {
      throw new BadRequestException("Admin şifresi hatalı.");
    }
    return true;
  }

  // ─── Main Company Management ────────────────────────────────
  private readonly MC_FILE = "main-companies";
  private readonly COMPANY_ALIAS_FILE = "company-aliases";
  private readonly PRODUCT_ALIAS_FILE = "product-aliases";
  private readonly COMPANY_CARD_FILE = "companies";
  private readonly PRODUCT_CARD_FILE = "products";
  private readonly COMPANY_STOP_WORDS = new Set([
    "SAN",
    "SANAYI",
    "TIC",
    "TICARET",
    "VE",
    "LTD",
    "LIMITED",
    "STI",
    "SIRKETI",
    "A",
    "S",
    "AS",
    "ANONIM",
    "PAZARLAMA",
    "DIS",
    "DISTIC",
    "DISTICARET",
    "DIŞ",
    "DIŞTIC",
    "DIŞTİC",
    "DIŞTICARET",
    "DIŞTİCARET",
  ]);

  private nowIso() {
    return new Date().toISOString();
  }

  private cleanText(value: any) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeAscii(value: any) {
    return this.cleanText(value)
      .toLocaleUpperCase("tr-TR")
      .replace(/İ/g, "I")
      .replace(/İ/g, "I")
      .replace(/ı/g, "I")
      .replace(/Ş/g, "S")
      .replace(/Ğ/g, "G")
      .replace(/Ü/g, "U")
      .replace(/Ö/g, "O")
      .replace(/Ç/g, "C");
  }

  private normalizeCompanyKey(value: any) {
    const base = this.normalizeAscii(value)
      .replace(/[.\-/()\\_[\],;+]+/g, " ")
      .replace(/[^A-Z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const tokens = base
      .split(" ")
      .filter(Boolean)
      .filter((token) => !this.COMPANY_STOP_WORDS.has(token));
    return tokens.join("").toLocaleLowerCase("tr-TR");
  }

  private normalizeProductKey(value: any) {
    const base = this.normalizeAscii(value)
      .replace(/[.\-/()\\_[\],;+]+/g, " ")
      .replace(/([A-Z])(\d)/g, "$1 $2")
      .replace(/(\d)([A-Z])/g, "$1 $2")
      .replace(/[^A-Z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return base.replace(/\s+/g, "").toLocaleLowerCase("tr-TR");
  }

  private resolveMainCompanySlug(
    mainCompanyId?: string,
    mainCompanySlug?: string,
  ) {
    return (
      this.db.resolveMainCompany(mainCompanyId, mainCompanySlug)?.slug || ""
    );
  }

  private requireMainCompanySlug(
    mainCompanyId?: string,
    mainCompanySlug?: string,
  ) {
    const requestedSlug = this.cleanText(mainCompanySlug);
    const requestedId = this.cleanText(mainCompanyId);
    const resolved = this.db.resolveMainCompany(requestedId, requestedSlug);
    if (!resolved?.slug) {
      throw new BadRequestException(
        "Geçerli bir ana firma bulunamadı. mainCompanySlug ve mainCompanyId kontrol edin.",
      );
    }
    if (requestedSlug && resolved.slug !== requestedSlug) {
      throw new BadRequestException(
        "Gönderilen mainCompanySlug geçerli aktif ana firma ile eşleşmiyor.",
      );
    }
    if (requestedId && resolved.id !== requestedId) {
      throw new BadRequestException(
        "Gönderilen mainCompanyId ile mainCompanySlug aynı ana firmayı göstermiyor.",
      );
    }
    return resolved.slug;
  }

  private getCompanyAliasesRaw(slug: string) {
    if (!slug) return [] as CompanyAliasRow[];
    return this.db.readMainCompanyStore<CompanyAliasRow[]>(
      slug,
      this.COMPANY_ALIAS_FILE,
      [],
    );
  }

  private saveCompanyAliasesRaw(slug: string, rows: CompanyAliasRow[]) {
    this.db.writeMainCompanyStore(slug, this.COMPANY_ALIAS_FILE, rows);
    return rows;
  }

  private getProductAliasesRaw(slug: string) {
    if (!slug) return [] as ProductAliasRow[];
    return this.db.readMainCompanyStore<ProductAliasRow[]>(
      slug,
      this.PRODUCT_ALIAS_FILE,
      [],
    );
  }

  private saveProductAliasesRaw(slug: string, rows: ProductAliasRow[]) {
    this.db.writeMainCompanyStore(slug, this.PRODUCT_ALIAS_FILE, rows);
    return rows;
  }

  private getCompanyCardsRaw(slug: string) {
    if (!slug) return [] as any[];
    return this.db.readMainCompanyStore<any[]>(
      slug,
      this.COMPANY_CARD_FILE,
      [],
    );
  }

  private getProductCardsRaw(slug: string) {
    if (!slug) return [] as any[];
    return this.db.readMainCompanyStore<any[]>(
      slug,
      this.PRODUCT_CARD_FILE,
      [],
    );
  }

  private sortAliases<
    T extends { isDeleted?: boolean; isActive?: boolean; hitCount?: number },
  >(rows: T[]) {
    return rows.sort((a, b) => {
      if ((a.isDeleted === true) !== (b.isDeleted === true))
        return a.isDeleted ? 1 : -1;
      if (Boolean(a.isActive) !== Boolean(b.isActive))
        return a.isActive ? -1 : 1;
      return Number(b.hitCount || 0) - Number(a.hitCount || 0);
    });
  }
  private slugify(name: string): string {
    return name
      .toLocaleLowerCase("tr-TR")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ş/g, "s")
      .replace(/ı/g, "i")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private ensureMainCompanies(): MainCompany[] {
    const rows = this.db.readStore<MainCompany[]>(this.MC_FILE, []);
    const now = this.nowIso();
    const defaults: MainCompany[] = [
      {
        id: "main-mecit-hakan",
        name: "Mecit Hakan",
        slug: "mecit-hakan",
        note: "",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ];

    const next = Array.isArray(rows) ? [...rows] : [];
    let changed = false;

    for (const seed of defaults) {
      const byId = next.find((item) => item.id === seed.id);
      const bySlug = next.find((item) => item.slug === seed.slug);
      const existing = byId || bySlug;
      if (!existing) {
        next.push(seed);
        changed = true;
        continue;
      }

      // Backward-safe normalization for legacy records missing required fields.
      const normalized: MainCompany = {
        id: String(existing.id || seed.id),
        name: String(existing.name || seed.name),
        slug: this.slugify(
          String(existing.slug || seed.slug || existing.name || seed.name),
        ),
        note: String(existing.note || ""),
        isActive: existing.isActive !== false,
        createdAt: String(existing.createdAt || now),
        updatedAt: String(existing.updatedAt || now),
      };

      if (
        normalized.id !== existing.id ||
        normalized.name !== existing.name ||
        normalized.slug !== existing.slug ||
        normalized.note !== existing.note ||
        normalized.isActive !== existing.isActive ||
        normalized.createdAt !== existing.createdAt ||
        normalized.updatedAt !== existing.updatedAt
      ) {
        const idx = next.indexOf(existing);
        next[idx] = normalized;
        changed = true;
      }
    }

    if (changed || next.length === 0) {
      this.db.writeStore(this.MC_FILE, next);
    }

    for (const mc of next) {
      this.ensureMainCompanyStorage(mc);
    }
    return next;
  }

  ensureMainCompanyStorage(mainCompany: MainCompany) {
    const now = this.nowIso();
    this.db.getMainCompanyDir(mainCompany.slug);
    this.db.writeMainCompanyStore(mainCompany.slug, "meta.json", {
      mainCompanyId: mainCompany.id,
      mainCompanyName: mainCompany.name,
      slug: mainCompany.slug,
      lastUpdatedAt: now,
    });

    for (const fileName of this.MAIN_COMPANY_FILES) {
      this.db.readMainCompanyStore(mainCompany.slug, fileName, []);
    }
  }

  getMainCompanies(): MainCompany[] {
    return this.ensureMainCompanies();
  }

  createMainCompany(payload: Record<string, any>) {
    const rows = this.ensureMainCompanies();
    const name = String(payload.name || "").trim();
    if (!name) throw new Error("Ana firma adı zorunludur.");
    const slug = this.slugify(String(payload.slug || name));
    if (!slug) throw new Error("Geçerli bir firma adı girin.");
    const dup = rows.find(
      (r) =>
        r.slug === slug ||
        r.name.toLocaleLowerCase("tr-TR") === name.toLocaleLowerCase("tr-TR"),
    );
    if (dup) throw new ConflictException("Bu ana firma zaten kayıtlı.");
    const now = this.nowIso();
    const mc: MainCompany = {
      id: `main-${slug}-${Date.now()}`,
      name,
      slug,
      note: String(payload.note || "").trim(),
      isActive: payload.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };
    rows.push(mc);
    this.db.writeStore(this.MC_FILE, rows);
    this.ensureMainCompanyStorage(mc);
    return mc;
  }

  updateMainCompany(id: string, payload: Record<string, any>) {
    if (!id) throw new BadRequestException("Ana firma id zorunludur.");
    const rows = this.ensureMainCompanies();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) throw new BadRequestException("Ana firma bulunamadı.");
    const existing = rows[idx];
    const name = String(payload.name ?? existing.name).trim();
    const slug = this.slugify(String(payload.slug ?? name)) || existing.slug;
    const dup = rows.find(
      (r) =>
        r.id !== id &&
        (r.slug === slug ||
          r.name.toLocaleLowerCase("tr-TR") ===
            name.toLocaleLowerCase("tr-TR")),
    );
    if (dup)
      throw new ConflictException("Bu isimde başka bir ana firma zaten var.");
    const now = this.nowIso();
    rows[idx] = {
      ...existing,
      name,
      slug,
      note:
        payload.note !== undefined
          ? String(payload.note).trim()
          : existing.note,
      isActive:
        payload.isActive !== undefined
          ? Boolean(payload.isActive)
          : existing.isActive,
      updatedAt: now,
    };
    this.db.writeStore(this.MC_FILE, rows);
    this.ensureMainCompanyStorage(rows[idx]);
    return rows[idx];
  }

  getCompanyAliases(payload: {
    mainCompanyId?: string;
    mainCompanySlug?: string;
    includeDeleted?: boolean;
  }) {
    const slug = this.requireMainCompanySlug(
      payload.mainCompanyId,
      payload.mainCompanySlug,
    );
    const rows = this.getCompanyAliasesRaw(slug).filter(
      (item) => payload.includeDeleted || item.isDeleted !== true,
    );
    return this.sortAliases(rows);
  }

  saveCompanyAlias(payload: Record<string, any>) {
    const slug = this.requireMainCompanySlug(
      payload.mainCompanyId,
      payload.mainCompanySlug,
    );

    const rawName = this.cleanText(payload.rawName);
    if (!rawName) throw new BadRequestException("Ham firma adı zorunludur.");

    const cards = this.getCompanyCardsRaw(slug);
    const matchedCompanyId = Number(payload.matchedCompanyId || 0);
    const matchedCard = cards.find(
      (item) => Number(item.id) === matchedCompanyId,
    );
    if (!matchedCard)
      throw new BadRequestException("Eşleşecek firma kartı bulunamadı.");

    const normalizedRawName =
      this.cleanText(payload.normalizedRawName) ||
      this.normalizeCompanyKey(rawName);
    const now = this.nowIso();
    const rows = this.getCompanyAliasesRaw(slug);
    const existing = rows.find(
      (item) => item.normalizedRawName === normalizedRawName,
    );
    if (existing) {
      existing.rawName = rawName;
      existing.matchedCompanyId = matchedCard.id;
      existing.matchedCompanyName = this.cleanText(matchedCard.firma);
      existing.sourceType = this.cleanText(
        payload.sourceType || existing.sourceType || "MANUAL",
      );
      existing.hitCount = Number(existing.hitCount || 0) + 1;
      existing.lastSeenAt = now;
      existing.updatedAt = now;
      existing.isActive =
        payload.isActive !== undefined ? Boolean(payload.isActive) : true;
      existing.isDeleted = false;
      existing.deletedAt = "";
      existing.note =
        payload.note !== undefined
          ? this.cleanText(payload.note)
          : this.cleanText(existing.note);
      this.saveCompanyAliasesRaw(slug, rows);
      return existing;
    }

    const next: CompanyAliasRow = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      rawName,
      normalizedRawName,
      matchedCompanyId: matchedCard.id,
      matchedCompanyName: this.cleanText(matchedCard.firma),
      sourceType: this.cleanText(payload.sourceType || "MANUAL"),
      hitCount: 1,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
      isActive: payload.isActive !== false,
      isDeleted: false,
      deletedAt: "",
      note: this.cleanText(payload.note),
    };
    rows.unshift(next);
    this.saveCompanyAliasesRaw(slug, rows);
    return next;
  }

  updateCompanyAlias(id: string, payload: Record<string, any>) {
    const slug = this.requireMainCompanySlug(
      payload.mainCompanyId,
      payload.mainCompanySlug,
    );

    const rows = this.getCompanyAliasesRaw(slug);
    const alias = rows.find((item) => Number(item.id) === Number(id));
    if (!alias) throw new BadRequestException("Alias kaydı bulunamadı.");

    const cards = this.getCompanyCardsRaw(slug);
    const matchedCompanyId = Number(
      payload.matchedCompanyId || alias.matchedCompanyId || 0,
    );
    const matchedCard = cards.find(
      (item) => Number(item.id) === matchedCompanyId,
    );
    if (!matchedCard)
      throw new BadRequestException("Eşleşecek firma kartı bulunamadı.");

    alias.rawName = this.cleanText(payload.rawName || alias.rawName);
    alias.normalizedRawName =
      this.cleanText(payload.normalizedRawName) ||
      this.normalizeCompanyKey(alias.rawName);
    alias.matchedCompanyId = matchedCard.id;
    alias.matchedCompanyName = this.cleanText(matchedCard.firma);
    alias.sourceType = this.cleanText(
      payload.sourceType || alias.sourceType || "MANUAL",
    );
    alias.isActive =
      payload.isActive !== undefined
        ? Boolean(payload.isActive)
        : alias.isActive;
    if (payload.isDeleted !== undefined) {
      alias.isDeleted = Boolean(payload.isDeleted);
      alias.deletedAt = alias.isDeleted ? this.nowIso() : "";
      if (alias.isDeleted) alias.isActive = false;
    }
    if (payload.note !== undefined) alias.note = this.cleanText(payload.note);
    alias.updatedAt = this.nowIso();
    if (payload.hitCount !== undefined)
      alias.hitCount = Number(payload.hitCount || 0);
    if (payload.lastSeenAt !== undefined)
      alias.lastSeenAt = this.cleanText(payload.lastSeenAt);

    this.saveCompanyAliasesRaw(slug, rows);
    return alias;
  }

  activateCompanyAlias(payload: Record<string, any>, id: string) {
    return this.updateCompanyAlias(id, {
      ...payload,
      isActive: true,
      isDeleted: false,
    });
  }

  deactivateCompanyAlias(payload: Record<string, any>, id: string) {
    return this.updateCompanyAlias(id, {
      ...payload,
      isActive: false,
    });
  }

  deleteCompanyAlias(payload: Record<string, any>, id: string) {
    return this.updateCompanyAlias(id, {
      ...payload,
      isDeleted: true,
      isActive: false,
    });
  }

  restoreCompanyAlias(payload: Record<string, any>, id: string) {
    return this.updateCompanyAlias(id, {
      ...payload,
      isDeleted: false,
      isActive: true,
    });
  }

  getProductAliases(payload: {
    mainCompanyId?: string;
    mainCompanySlug?: string;
    includeDeleted?: boolean;
  }) {
    const slug = this.requireMainCompanySlug(
      payload.mainCompanyId,
      payload.mainCompanySlug,
    );
    const rows = this.getProductAliasesRaw(slug).filter(
      (item) => payload.includeDeleted || item.isDeleted !== true,
    );
    return this.sortAliases(rows);
  }

  saveProductAlias(payload: Record<string, any>) {
    const slug = this.requireMainCompanySlug(
      payload.mainCompanyId,
      payload.mainCompanySlug,
    );

    const rawName = this.cleanText(payload.rawName);
    if (!rawName) throw new BadRequestException("Ham ürün adı zorunludur.");

    const products = this.getProductCardsRaw(slug);
    const matchedProductId = Number(payload.matchedProductId || 0);
    const matchedProduct = products.find(
      (item) => Number(item.id) === matchedProductId,
    );
    if (!matchedProduct)
      throw new BadRequestException("Eşleşecek ürün kartı bulunamadı.");

    const normalizedRawName =
      this.cleanText(payload.normalizedRawName) ||
      this.normalizeProductKey(rawName);
    const now = this.nowIso();
    const rows = this.getProductAliasesRaw(slug);
    const existing = rows.find(
      (item) => item.normalizedRawName === normalizedRawName,
    );
    const matchedProductName = this.cleanText(
      matchedProduct.urunAdi || matchedProduct.ticariAdi,
    );
    const matchedProductCode = this.cleanText(
      matchedProduct.urunKodu || matchedProduct.stokKodu || matchedProduct.kod,
    );

    if (existing) {
      existing.rawName = rawName;
      existing.matchedProductId = matchedProduct.id;
      existing.matchedProductName = matchedProductName;
      existing.matchedProductCode = matchedProductCode;
      existing.sourceType = this.cleanText(
        payload.sourceType || existing.sourceType || "MANUAL",
      );
      existing.hitCount = Number(existing.hitCount || 0) + 1;
      existing.lastSeenAt = now;
      existing.updatedAt = now;
      existing.isActive =
        payload.isActive !== undefined ? Boolean(payload.isActive) : true;
      existing.isDeleted = false;
      existing.deletedAt = "";
      existing.note =
        payload.note !== undefined
          ? this.cleanText(payload.note)
          : this.cleanText(existing.note);
      this.saveProductAliasesRaw(slug, rows);
      return existing;
    }

    const next: ProductAliasRow = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      rawName,
      normalizedRawName,
      matchedProductId: matchedProduct.id,
      matchedProductName,
      matchedProductCode,
      sourceType: this.cleanText(payload.sourceType || "MANUAL"),
      hitCount: 1,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
      isActive: payload.isActive !== false,
      isDeleted: false,
      deletedAt: "",
      note: this.cleanText(payload.note),
    };
    rows.unshift(next);
    this.saveProductAliasesRaw(slug, rows);
    return next;
  }

  updateProductAlias(id: string, payload: Record<string, any>) {
    const slug = this.requireMainCompanySlug(
      payload.mainCompanyId,
      payload.mainCompanySlug,
    );

    const rows = this.getProductAliasesRaw(slug);
    const alias = rows.find((item) => Number(item.id) === Number(id));
    if (!alias) throw new BadRequestException("Ürün alias kaydı bulunamadı.");

    const products = this.getProductCardsRaw(slug);
    const matchedProductId = Number(
      payload.matchedProductId || alias.matchedProductId || 0,
    );
    const matchedProduct = products.find(
      (item) => Number(item.id) === matchedProductId,
    );
    if (!matchedProduct)
      throw new BadRequestException("Eşleşecek ürün kartı bulunamadı.");

    alias.rawName = this.cleanText(payload.rawName || alias.rawName);
    alias.normalizedRawName =
      this.cleanText(payload.normalizedRawName) ||
      this.normalizeProductKey(alias.rawName);
    alias.matchedProductId = matchedProduct.id;
    alias.matchedProductName = this.cleanText(
      matchedProduct.urunAdi || matchedProduct.ticariAdi,
    );
    alias.matchedProductCode = this.cleanText(
      matchedProduct.urunKodu || matchedProduct.stokKodu || matchedProduct.kod,
    );
    alias.sourceType = this.cleanText(
      payload.sourceType || alias.sourceType || "MANUAL",
    );
    alias.isActive =
      payload.isActive !== undefined
        ? Boolean(payload.isActive)
        : alias.isActive;
    if (payload.isDeleted !== undefined) {
      alias.isDeleted = Boolean(payload.isDeleted);
      alias.deletedAt = alias.isDeleted ? this.nowIso() : "";
      if (alias.isDeleted) alias.isActive = false;
    }
    if (payload.note !== undefined) alias.note = this.cleanText(payload.note);
    alias.updatedAt = this.nowIso();
    if (payload.hitCount !== undefined)
      alias.hitCount = Number(payload.hitCount || 0);
    if (payload.lastSeenAt !== undefined)
      alias.lastSeenAt = this.cleanText(payload.lastSeenAt);

    this.saveProductAliasesRaw(slug, rows);
    return alias;
  }

  activateProductAlias(payload: Record<string, any>, id: string) {
    return this.updateProductAlias(id, {
      ...payload,
      isActive: true,
      isDeleted: false,
    });
  }

  deactivateProductAlias(payload: Record<string, any>, id: string) {
    return this.updateProductAlias(id, {
      ...payload,
      isActive: false,
    });
  }

  deleteProductAlias(payload: Record<string, any>, id: string) {
    return this.updateProductAlias(id, {
      ...payload,
      isDeleted: true,
      isActive: false,
    });
  }

  restoreProductAlias(payload: Record<string, any>, id: string) {
    return this.updateProductAlias(id, {
      ...payload,
      isDeleted: false,
      isActive: true,
    });
  }

  // ─── Main Company Delete ─────────────────────────────────────
  deleteMainCompany(id: string, adminPassword: any) {
    this.validateDeleteCompanyPassword(adminPassword);

    const rows = this.ensureMainCompanies();
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) throw new BadRequestException("Ana firma bulunamadı.");

    const mc = rows[idx];
    const slug = mc.slug;

    // Yedek klasörü: backup/deleted-main-companies/{slug}/{timestamp}
    const stamp =
      new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .replace("T", "T")
        .slice(0, 23) + "Z";
    const backupRoot = path.resolve(
      process.cwd(),
      "..",
      "..",
      "backup",
      "deleted-main-companies",
      slug,
      stamp,
    );
    fs.mkdirSync(backupRoot, { recursive: true });

    // Ana firma meta verisini yedekle
    const writeBackup = (fileName: string, data: any) => {
      const fullPath = path.join(backupRoot, fileName);
      fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), "utf8");
    };
    writeBackup("main-company.json", mc);

    // Ana firmanın tüm data dosyalarını yedekle
    const mcDir = path.join(
      path.resolve(process.cwd(), "uploads", "kyerp-data"),
      "main-companies",
      slug,
    );
    const altMcDir = path.join(
      path.resolve(
        process.cwd(),
        "app",
        "ky-erp-backend",
        "uploads",
        "kyerp-data",
      ),
      "main-companies",
      slug,
    );
    const resolvedMcDir = fs.existsSync(mcDir)
      ? mcDir
      : fs.existsSync(altMcDir)
        ? altMcDir
        : null;

    if (resolvedMcDir) {
      try {
        const files = fs.readdirSync(resolvedMcDir);
        for (const file of files) {
          const src = path.join(resolvedMcDir, file);
          const dest = path.join(backupRoot, file);
          try {
            fs.copyFileSync(src, dest);
          } catch {
            /* dosya kopyalanamadıysa geç */
          }
        }
      } catch {
        /* klasör okunamadıysa geç */
      }
    }

    writeBackup("summary.json", {
      mainCompanyId: mc.id,
      mainCompanyName: mc.name,
      mainCompanySlug: slug,
      backupAt: new Date().toISOString(),
      backupPath: backupRoot,
      dataDir: resolvedMcDir || "(bulunamadı)",
    });

    // Ana firmayı listeden kaldır
    rows.splice(idx, 1);
    this.db.writeStore(this.MC_FILE, rows);

    return {
      success: true,
      deletedId: mc.id,
      deletedName: mc.name,
      backupPath: backupRoot,
      message: `"${mc.name}" ana firması yedeklendi ve silindi.`,
    };
  }

  // ─── Main Company Transfer ──────────────────────────────────
  transferMainCompanyData(
    sourceId: string,
    targetId: string,
    adminPassword: any,
  ) {
    this.validateDeleteCompanyPassword(adminPassword);

    const rows = this.ensureMainCompanies();
    const source = rows.find((r) => r.id === sourceId);
    const target = rows.find((r) => r.id === targetId);
    if (!source) throw new BadRequestException("Kaynak ana firma bulunamadı.");
    if (!target) throw new BadRequestException("Hedef ana firma bulunamadı.");
    if (source.id === target.id)
      throw new BadRequestException("Kaynak ve hedef aynı olamaz.");

    const resolveDir = (slug: string) => {
      const a = path.join(
        path.resolve(process.cwd(), "uploads", "kyerp-data"),
        "main-companies",
        slug,
      );
      const b = path.join(
        path.resolve(
          process.cwd(),
          "app",
          "ky-erp-backend",
          "uploads",
          "kyerp-data",
        ),
        "main-companies",
        slug,
      );
      return fs.existsSync(a) ? a : fs.existsSync(b) ? b : a;
    };

    const safeReadArray = (filePath: string): any[] => {
      try {
        if (!fs.existsSync(filePath)) return [];
        return JSON.parse(fs.readFileSync(filePath, "utf8")) || [];
      } catch {
        return [];
      }
    };

    const safeWrite = (filePath: string, data: any) => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    };

    const srcDir = resolveDir(source.slug);
    const tgtDir = resolveDir(target.slug);
    fs.mkdirSync(tgtDir, { recursive: true });

    // ── 1. Transfer companies — ID çakışma haritası ──
    const companyIdMap = new Map<number, number>();
    {
      const srcPath = path.join(srcDir, "companies");
      const tgtPath = path.join(tgtDir, "companies");
      const srcRows = safeReadArray(srcPath);
      const tgtRows = safeReadArray(tgtPath);
      const tgtIdSet = new Set(tgtRows.map((r: any) => r.id));
      let maxId = tgtRows.reduce(
        (m: number, r: any) =>
          typeof r.id === "number" && r.id > m ? r.id : m,
        0,
      );
      const newSrcRows = srcRows.map((r: any) => {
        const copy = { ...r };
        if (tgtIdSet.has(copy.id)) {
          const oldId = copy.id;
          maxId++;
          copy.id = maxId;
          companyIdMap.set(oldId, maxId);
        }
        return copy;
      });
      safeWrite(tgtPath, [...tgtRows, ...newSrcRows]);
    }

    // ── 2. Transfer products — ID çakışma haritası ──
    const productIdMap = new Map<number, number>();
    {
      const srcPath = path.join(srcDir, "products");
      const tgtPath = path.join(tgtDir, "products");
      const srcRows = safeReadArray(srcPath);
      const tgtRows = safeReadArray(tgtPath);
      const tgtIdSet = new Set(tgtRows.map((r: any) => r.id));
      let maxId = tgtRows.reduce(
        (m: number, r: any) =>
          typeof r.id === "number" && r.id > m ? r.id : m,
        0,
      );
      const newSrcRows = srcRows.map((r: any) => {
        const copy = { ...r };
        if (tgtIdSet.has(copy.id)) {
          const oldId = copy.id;
          maxId++;
          copy.id = maxId;
          productIdMap.set(oldId, maxId);
        }
        return copy;
      });
      safeWrite(tgtPath, [...tgtRows, ...newSrcRows]);
    }

    // ── 3. Diğer tüm array JSON dosyaları ──
    const remapRecord = (r: any): any => {
      const copy = { ...r };
      // Firma referansları
      if (
        copy.relatedCompanyId != null &&
        companyIdMap.has(copy.relatedCompanyId)
      )
        copy.relatedCompanyId = companyIdMap.get(copy.relatedCompanyId);
      if (
        copy.matchedCompanyId != null &&
        companyIdMap.has(copy.matchedCompanyId)
      )
        copy.matchedCompanyId = companyIdMap.get(copy.matchedCompanyId);
      if (copy.companyId != null && companyIdMap.has(copy.companyId))
        copy.companyId = companyIdMap.get(copy.companyId);
      // Ürün referansları
      if (
        copy.matchedProductId != null &&
        productIdMap.has(copy.matchedProductId)
      )
        copy.matchedProductId = productIdMap.get(copy.matchedProductId);
      // Ana firma bilgileri
      if ("mainCompanyId" in copy) copy.mainCompanyId = target.id;
      if ("mainCompanySlug" in copy) copy.mainCompanySlug = target.slug;
      if ("mainCompanyName" in copy) copy.mainCompanyName = target.name;
      return copy;
    };

    const arrayFiles = [
      "documents",
      "cari-movements",
      "checks",
      "payments",
      "payment-types.json",
      "company-aliases",
      "product-aliases",
      "product-documents",
      "credit-cards",
      "activity-logs",
      "boyahane.colors",
      "boyahane.lots",
      "boyahane.materials",
      "boyahane.movements",
      "boyahane.recipes",
      "boyahane.runs",
      "uretim.kalite",
      "uretim.kayitlar",
      "uretim.makinalar",
      "model-takip",
      "vat-periods",
      "email-contacts",
    ];

    let transferredRecords = 0;
    for (const fname of arrayFiles) {
      const srcPath = path.join(srcDir, fname);
      if (!fs.existsSync(srcPath)) continue;
      const srcRows = safeReadArray(srcPath);
      if (!Array.isArray(srcRows) || srcRows.length === 0) continue;
      const tgtPath = path.join(tgtDir, fname);
      const tgtRows = safeReadArray(tgtPath);
      const tgtIdSet = new Set(tgtRows.map((r: any) => String(r.id)));
      let maxNumId = tgtRows.reduce(
        (m: number, r: any) =>
          typeof r.id === "number" && r.id > m ? r.id : m,
        0,
      );
      const newRows = srcRows.map((r: any) => {
        const copy = remapRecord(r);
        if (typeof copy.id === "number" && tgtIdSet.has(String(copy.id))) {
          maxNumId++;
          copy.id = maxNumId;
        }
        return copy;
      });
      safeWrite(tgtPath, [...tgtRows, ...newRows]);
      transferredRecords += newRows.length;
    }

    // ── 4. DRF JSON ve PDF dosyalarını kopyala ──
    let copiedFiles = 0;
    try {
      const allFiles = fs.readdirSync(srcDir);
      for (const fname of allFiles) {
        if (
          !fname.startsWith("DRF-") &&
          !fname.endsWith(".pdf") &&
          !fname.endsWith(".tmp")
        )
          continue;
        if (fname.endsWith(".tmp")) continue;
        const src = path.join(srcDir, fname);
        let dest = path.join(tgtDir, fname);
        if (fs.existsSync(dest)) {
          const ext = path.extname(fname);
          const base = path.basename(fname, ext);
          dest = path.join(tgtDir, `${base}-from-${source.slug}${ext}`);
        }
        try {
          fs.copyFileSync(src, dest);
          copiedFiles++;
        } catch {
          /* geç */
        }
      }
    } catch {
      /* geç */
    }

    return {
      success: true,
      sourceId: source.id,
      sourceName: source.name,
      targetId: target.id,
      targetName: target.name,
      transferredRecords,
      copiedFiles,
      message: `"${source.name}" firmasındaki ${transferredRecords} kayıt ve ${copiedFiles} dosya "${target.name}" firmasına aktarıldı.`,
    };
  }
}
