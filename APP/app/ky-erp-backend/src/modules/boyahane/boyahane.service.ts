import { BadRequestException, Injectable } from "@nestjs/common";
import { SqlStoreService } from "../../kyerp-core/sql-store.service";
import * as fs from "fs";
import * as path from "path";

type OwnedRow = {
  mainCompanyId?: string;
  mainCompanySlug?: string;
  mainCompanyName?: string;
};

type ColorMaster = OwnedRow & {
  id: string;
  colorCode: string;
  colorName: string;
  codeType: string;
  hex: string;
  status: string;
  createdAt: string;
};

type RecipeRow = {
  id: string;
  productName: string;
  finalKg: number;
};

type ColorRecipe = OwnedRow & {
  id: string;
  colorId: string;
  paintType: string;
  version: string;
  status: string;
  description: string;
  workType: string;
  totalGramaj: number;
  createdAt: string;
  rows: RecipeRow[];
};

type RawMaterial = OwnedRow & {
  id: string;
  productName: string;
  brand: string;
  materialType: string;
  hex: string;
  status: string;
};

type Lot = OwnedRow & {
  id: string;
  rawMaterialId: string;
  lotNo: string;
  supplier: string;
  invoiceNo: string;
  entryDate: string;
  package: string;
  incomingKg: number;
  availableKg: number;
  reservedKg: number;
  status: string;
  note: string;
};

type LotMovement = OwnedRow & {
  id: string;
  lotId: string;
  type: string;
  source: string;
  quantityKg: number;
  remainingKg: number;
  user: string;
  createdAt: string;
  description: string;
};

type LotConsumption = OwnedRow & {
  id: string;
  modelId: string;
  recipeRunId: string;
  productId: string;
  lotId: string;
  lotNo: string;
  usedQuantity: number;
  unit: string;
  usedAt: string;
  notes: string;
  status: string;
  createdAt: string;
};

type DyeRun = OwnedRow & {
  id: string;
  colorId: string;
  recipeId: string;
  workType: string;
  version: string;
  katSayisi: number;
  oneLayerTotal: number;
  totalProductionKg: number;
  createdAt: string;
};

@Injectable()
export class BoyahaneService {
  constructor(private readonly db: SqlStoreService) {}
  private importedSeedCache: {
    colors: ColorMaster[];
    recipes: ColorRecipe[];
  } | null = null;

  private readonly files = {
    colors: "boyahane.colors",
    recipes: "boyahane.recipes",
    materials: "boyahane.materials",
    lots: "boyahane.lots",
    movements: "boyahane.movements",
    lotConsumptions: "boyahane.lot-consumptions.json",
    runs: "boyahane.runs",
  } as const;

  private cleanText(value: any) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private nowIso() {
    return new Date().toISOString();
  }

  private parseNumber(value: any) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = this.cleanText(value).replace(/[^\d,.-]/g, "");
    if (!raw) return 0;
    const normalized =
      raw.includes(",") && raw.includes(".")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.includes(",")
          ? raw.replace(",", ".")
          : raw;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private uid(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private requireMainCompany(mainCompanySlug?: string, mainCompanyId?: string) {
    try {
      return this.db.requireMainCompany(mainCompanyId, mainCompanySlug);
    } catch {
      throw new BadRequestException(
        "mainCompanyId veya mainCompanySlug zorunludur.",
      );
    }
  }

  private colorSeed(mainCompany: {
    id: string;
    slug: string;
    name: string;
  }): ColorMaster[] {
    return [];
  }

  private recipeSeed(mainCompany: {
    id: string;
    slug: string;
    name: string;
  }): ColorRecipe[] {
    return [];
  }

  private materialSeed(mainCompany: {
    id: string;
    slug: string;
    name: string;
  }): RawMaterial[] {
    return [];
  }

  private lotSeed(mainCompany: {
    id: string;
    slug: string;
    name: string;
  }): Lot[] {
    return [];
  }

  private movementSeed(mainCompany: {
    id: string;
    slug: string;
    name: string;
  }): LotMovement[] {
    return [];
  }

  private runSeed(mainCompany: {
    id: string;
    slug: string;
    name: string;
  }): DyeRun[] {
    return [];
  }

  private normalizePaintType(raw: string) {
    const value = this.cleanText(raw).toLocaleLowerCase("tr-TR");
    if (value.includes("subaz")) return "Subazlı";
    if (value.includes("eco")) return "Ecoplast";
    if (value.includes("pigment")) return "Pigment Baskı";
    if (value.includes("silikon")) return "Silikon";
    if (value.includes("aşındır") || value.includes("asindir"))
      return "Aşındırma";
    return this.cleanText(raw) || "Diğer";
  }

  private loadImportedSeed(mainCompany: {
    id: string;
    slug: string;
    name: string;
  }) {
    if (this.importedSeedCache) return this.importedSeedCache;

    const candidates = [
      path.join(
        process.cwd(),
        "..",
        "..",
        "tools",
        "kayitli_renkler_rows.json",
      ),
      path.join(process.cwd(), "tools", "kayitli_renkler_rows.json"),
      path.join(
        process.cwd(),
        "..",
        "..",
        "..",
        "tools",
        "kayitli_renkler_rows.json",
      ),
    ];
    const filePath = candidates.find((p) => fs.existsSync(p));
    if (!filePath) {
      this.importedSeedCache = { colors: [], recipes: [] };
      return this.importedSeedCache;
    }

    let rows: any[] = [];
    try {
      rows = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      this.importedSeedCache = { colors: [], recipes: [] };
      return this.importedSeedCache;
    }

    const colors: ColorMaster[] = [];
    const recipes: ColorRecipe[] = [];
    const colorMap = new Map<string, string>();

    for (const row of Array.isArray(rows) ? rows.slice(1) : []) {
      const colorCode = this.cleanText(row?.[0]);
      const colorName = this.cleanText(row?.[1]);
      const codeType = this.cleanText(row?.[2] || "GENEL");
      const hex = this.cleanText(row?.[3] || "#9CA3AF");
      if (!colorCode && !colorName) continue;
      const colorKey = `${colorCode}|${colorName}|${codeType}|${hex}`;
      let colorId = colorMap.get(colorKey) || "";
      if (!colorId) {
        colorId = this.uid("cmseed");
        colorMap.set(colorKey, colorId);
        colors.push({
          id: colorId,
          colorCode: colorCode || colorName,
          colorName: colorName || colorCode,
          codeType,
          hex,
          status: "Aktif",
          createdAt: "26.04.2026",
          mainCompanyId: mainCompany.id,
          mainCompanySlug: mainCompany.slug,
          mainCompanyName: mainCompany.name,
        });
      }

      const recipeRows: RecipeRow[] = [];
      for (let i = 10; i <= 28; i += 2) {
        const productName = this.cleanText(row?.[i]);
        const finalKg = this.parseNumber(row?.[i + 1]);
        if (!productName) continue;
        recipeRows.push({
          id: this.uid("rrseed"),
          productName,
          finalKg,
        });
      }

      recipes.push({
        id: this.uid("crseed"),
        colorId,
        paintType: this.normalizePaintType(
          this.cleanText(row?.[5] || "Subazlı"),
        ),
        version: this.cleanText(row?.[6] || "V1"),
        status: "Aktif",
        description: this.cleanText(
          row?.[9] || `${this.cleanText(row?.[7] || "NUMUNE")} kaydı`,
        ),
        workType: this.cleanText(row?.[7] || "NUMUNE"),
        totalGramaj: this.parseNumber(row?.[8]),
        createdAt: "26.04.2026",
        rows: recipeRows,
        mainCompanyId: mainCompany.id,
        mainCompanySlug: mainCompany.slug,
        mainCompanyName: mainCompany.name,
      });
    }

    this.importedSeedCache = { colors, recipes };
    return this.importedSeedCache;
  }

  private readColors(slug: string) {
    const company = this.requireMainCompany(slug);
    return this.db.readMainCompanyStore<ColorMaster[]>(
      company.slug,
      this.files.colors,
      this.colorSeed(company),
    );
  }

  private writeColors(slug: string, rows: ColorMaster[]) {
    return this.db.writeMainCompanyStore(slug, this.files.colors, rows);
  }

  private readRecipes(slug: string) {
    const company = this.requireMainCompany(slug);
    return this.db.readMainCompanyStore<ColorRecipe[]>(
      company.slug,
      this.files.recipes,
      this.recipeSeed(company),
    );
  }

  private writeRecipes(slug: string, rows: ColorRecipe[]) {
    return this.db.writeMainCompanyStore(slug, this.files.recipes, rows);
  }

  private readMaterials(slug: string) {
    const company = this.requireMainCompany(slug);
    return this.db.readMainCompanyStore<RawMaterial[]>(
      company.slug,
      this.files.materials,
      this.materialSeed(company),
    );
  }

  private writeMaterials(slug: string, rows: RawMaterial[]) {
    return this.db.writeMainCompanyStore(slug, this.files.materials, rows);
  }

  private readLots(slug: string) {
    const company = this.requireMainCompany(slug);
    return this.db.readMainCompanyStore<Lot[]>(
      company.slug,
      this.files.lots,
      this.lotSeed(company),
    );
  }

  private writeLots(slug: string, rows: Lot[]) {
    return this.db.writeMainCompanyStore(slug, this.files.lots, rows);
  }

  private readMovements(slug: string) {
    const company = this.requireMainCompany(slug);
    return this.db.readMainCompanyStore<LotMovement[]>(
      company.slug,
      this.files.movements,
      this.movementSeed(company),
    );
  }

  private writeMovements(slug: string, rows: LotMovement[]) {
    return this.db.writeMainCompanyStore(slug, this.files.movements, rows);
  }

  private readLotConsumptions(slug: string) {
    const company = this.requireMainCompany(slug);
    return this.db.readMainCompanyStore<LotConsumption[]>(
      company.slug,
      this.files.lotConsumptions,
      [],
    );
  }

  private writeLotConsumptions(slug: string, rows: LotConsumption[]) {
    return this.db.writeMainCompanyStore(slug, this.files.lotConsumptions, rows);
  }

  private readRuns(slug: string) {
    const company = this.requireMainCompany(slug);
    return this.db.readMainCompanyStore<DyeRun[]>(
      company.slug,
      this.files.runs,
      this.runSeed(company),
    );
  }

  private writeRuns(slug: string, rows: DyeRun[]) {
    return this.db.writeMainCompanyStore(slug, this.files.runs, rows);
  }

  getAccountingRawMaterialLots(mainCompanySlug: string, filters: any = {}) {
    const company = this.requireMainCompany(mainCompanySlug);
    const productId = this.cleanText(filters.productId);
    const lotNo = this.cleanText(filters.lotNo).toLocaleUpperCase("tr-TR");
    const root = path.join(
      this.db.getMainCompanyDir(company.slug),
      "raw-material-lots",
    );
    if (!fs.existsSync(root)) return [];
    return fs
      .readdirSync(root)
      .filter((name) => /^\d{4}-\d{2}\.json$/.test(name))
      .sort((a, b) => b.localeCompare(a))
      .flatMap((name) =>
        this.db.readMainCompanyStore<any[]>(
          company.slug,
          path.join("raw-material-lots", name).replace(/\\/g, "/"),
          [],
        ),
      )
      .filter((row) => {
        if (productId && this.cleanText(row.productId) !== productId)
          return false;
        if (
          lotNo &&
          this.cleanText(row.lotNo).toLocaleUpperCase("tr-TR") !== lotNo
        )
          return false;
        return true;
      });
  }

  getBootstrap(mainCompanySlug: string) {
    const slug = this.requireMainCompany(mainCompanySlug).slug;
    const colors = this.readColors(slug);
    const recipes = this.readRecipes(slug);
    const materials = this.readMaterials(slug);
    const lots = this.readLots(slug);
    const accountingRawMaterialLots = this.getAccountingRawMaterialLots(slug);
    const movements = this.readMovements(slug);
    const runs = this.readRuns(slug);
    return {
      colors,
      recipes,
      materials,
      lots,
      accountingRawMaterialLots,
      movements,
      runs,
    };
  }

  createColor(payload: Partial<ColorMaster>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const colorCode = this.cleanText(payload.colorCode);
    const colorName = this.cleanText(payload.colorName);
    if (!colorCode || !colorName) {
      throw new BadRequestException("Renk kodu ve adı zorunludur.");
    }
    const rows = this.readColors(company.slug);
    const row: ColorMaster = {
      id: this.uid("cm"),
      colorCode,
      colorName,
      codeType: this.cleanText(payload.codeType || "GENEL"),
      hex: this.cleanText(payload.hex || "#9CA3AF"),
      status: this.cleanText(payload.status || "Aktif"),
      createdAt: this.cleanText(
        payload.createdAt || this.nowIso().slice(0, 10),
      ),
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
    };
    this.writeColors(company.slug, [row, ...rows]);
    return row;
  }

  updateColor(id: string, payload: Partial<ColorMaster>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const rows = this.readColors(company.slug);
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) throw new BadRequestException("Renk kaydı bulunamadı.");
    const current = rows[index];
    const updated: ColorMaster = {
      ...current,
      colorCode: this.cleanText(payload.colorCode || current.colorCode),
      colorName: this.cleanText(payload.colorName || current.colorName),
      codeType: this.cleanText(payload.codeType || current.codeType),
      hex: this.cleanText(payload.hex || current.hex),
      status: this.cleanText(payload.status || current.status),
    };
    rows[index] = updated;
    this.writeColors(company.slug, rows);
    return updated;
  }

  deleteColor(mainCompanySlug: string, colorId: string) {
    const company = this.requireMainCompany(mainCompanySlug);
    const colors = this.readColors(company.slug).filter(
      (row) => row.id !== colorId,
    );
    const recipes = this.readRecipes(company.slug).filter(
      (row) => row.colorId !== colorId,
    );
    this.writeColors(company.slug, colors);
    this.writeRecipes(company.slug, recipes);
    return { deleted: true, colorId };
  }

  createRecipe(payload: Partial<ColorRecipe>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const colorId = this.cleanText(payload.colorId);
    if (!colorId) throw new BadRequestException("Renk seçimi zorunludur.");
    const rows = this.readRecipes(company.slug);
    const recipeRows = Array.isArray(payload.rows)
      ? payload.rows.map((row: any, idx: number) => ({
          id: this.cleanText(row.id || this.uid(`rr${idx + 1}`)),
          productName: this.cleanText(row.productName),
          finalKg: this.parseNumber(row.finalKg),
        }))
      : [];
    const recipe: ColorRecipe = {
      id: this.uid("cr"),
      colorId,
      paintType: this.cleanText(payload.paintType || "Subazlı"),
      version: this.cleanText(payload.version || "V1"),
      status: this.cleanText(payload.status || "Aktif"),
      description: this.cleanText(payload.description || "Yeni reçete"),
      workType: this.cleanText(payload.workType || "NUMUNE"),
      totalGramaj: this.parseNumber(payload.totalGramaj),
      createdAt: this.cleanText(
        payload.createdAt || this.nowIso().slice(0, 10),
      ),
      rows: recipeRows,
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
    };
    this.writeRecipes(company.slug, [recipe, ...rows]);
    return recipe;
  }

  updateRecipe(id: string, payload: Partial<ColorRecipe>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const rows = this.readRecipes(company.slug);
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) throw new BadRequestException("Reçete bulunamadı.");
    const current = rows[index];
    const updatedRows = Array.isArray(payload.rows)
      ? payload.rows.map((row: any, idx: number) => ({
          id: this.cleanText(row.id || this.uid(`rru${idx + 1}`)),
          productName: this.cleanText(row.productName),
          finalKg: this.parseNumber(row.finalKg),
        }))
      : current.rows;
    const updated: ColorRecipe = {
      ...current,
      paintType: this.cleanText(payload.paintType || current.paintType),
      version: this.cleanText(payload.version || current.version),
      status: this.cleanText(payload.status || current.status),
      description: this.cleanText(payload.description || current.description),
      workType: this.cleanText(payload.workType || current.workType),
      totalGramaj: this.parseNumber(payload.totalGramaj ?? current.totalGramaj),
      rows: updatedRows,
    };
    rows[index] = updated;
    this.writeRecipes(company.slug, rows);
    return updated;
  }

  deleteRecipe(mainCompanySlug: string, recipeId: string) {
    const company = this.requireMainCompany(mainCompanySlug);
    const rows = this.readRecipes(company.slug).filter(
      (row) => row.id !== recipeId,
    );
    this.writeRecipes(company.slug, rows);
    return { deleted: true, recipeId };
  }

  createMaterial(payload: Partial<RawMaterial>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const productName = this.cleanText(payload.productName);
    if (!productName) throw new BadRequestException("Ürün adı zorunludur.");
    const rows = this.readMaterials(company.slug);
    const material: RawMaterial = {
      id: this.uid("rm"),
      productName,
      brand: this.cleanText(payload.brand || ""),
      materialType: this.cleanText(payload.materialType || "Subazlı"),
      hex: this.cleanText(payload.hex || ""),
      status: this.cleanText(payload.status || "Aktif"),
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
    };
    this.writeMaterials(company.slug, [material, ...rows]);
    return material;
  }

  createLot(payload: Partial<Lot>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const rawMaterialId = this.cleanText(payload.rawMaterialId);
    if (!rawMaterialId)
      throw new BadRequestException("Hammadde seçimi zorunludur.");
    const lots = this.readLots(company.slug);
    const lot: Lot = {
      id: this.uid("lot"),
      rawMaterialId,
      lotNo: this.cleanText(payload.lotNo || `LOT-${Date.now()}`),
      supplier: this.cleanText(payload.supplier || ""),
      invoiceNo: this.cleanText(payload.invoiceNo || ""),
      entryDate: this.cleanText(
        payload.entryDate || this.nowIso().slice(0, 10),
      ),
      package: this.cleanText(payload.package || "20 KG"),
      incomingKg: this.parseNumber(payload.incomingKg),
      availableKg: this.parseNumber(payload.availableKg ?? payload.incomingKg),
      reservedKg: this.parseNumber(payload.reservedKg),
      status: this.cleanText(payload.status || "Aktif"),
      note: this.cleanText(payload.note || ""),
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
    };
    this.writeLots(company.slug, [lot, ...lots]);
    return lot;
  }

  updateLot(id: string, payload: Partial<Lot>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const lots = this.readLots(company.slug);
    const index = lots.findIndex((row) => row.id === id);
    if (index < 0) throw new BadRequestException("Lot bulunamadı.");
    const current = lots[index];
    const updated: Lot = {
      ...current,
      lotNo: this.cleanText(payload.lotNo || current.lotNo),
      supplier: this.cleanText(payload.supplier || current.supplier),
      invoiceNo: this.cleanText(payload.invoiceNo || current.invoiceNo),
      entryDate: this.cleanText(payload.entryDate || current.entryDate),
      package: this.cleanText(payload.package || current.package),
      incomingKg: this.parseNumber(payload.incomingKg ?? current.incomingKg),
      status: this.cleanText(payload.status || current.status),
      availableKg: this.parseNumber(payload.availableKg ?? current.availableKg),
      reservedKg: this.parseNumber(payload.reservedKg ?? current.reservedKg),
      note: this.cleanText(payload.note ?? current.note),
    };
    lots[index] = updated;
    this.writeLots(company.slug, lots);
    return updated;
  }

  createMovement(lotId: string, payload: Partial<LotMovement>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const lots = this.readLots(company.slug);
    const lotIndex = lots.findIndex((row) => row.id === lotId);
    if (lotIndex < 0) throw new BadRequestException("Lot bulunamadı.");
    const lot = lots[lotIndex];
    const qty = this.parseNumber(payload.quantityKg);
    const nextAvailable = lot.availableKg + qty;
    lot.availableKg = Math.max(0, nextAvailable);
    lots[lotIndex] = lot;
    this.writeLots(company.slug, lots);

    const movements = this.readMovements(company.slug);
    const movement: LotMovement = {
      id: this.uid("mv"),
      lotId,
      type: this.cleanText(payload.type || "Düzeltme"),
      source: this.cleanText(payload.source || "Manuel"),
      quantityKg: qty,
      remainingKg: lot.availableKg,
      user: this.cleanText(payload.user || "Kullanıcı"),
      createdAt: this.cleanText(payload.createdAt || this.nowIso()),
      description: this.cleanText(payload.description || ""),
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
    };
    this.writeMovements(company.slug, [movement, ...movements]);
    return { lot, movement };
  }

  createLotConsumption(payload: Partial<LotConsumption>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const lotId = this.cleanText(payload.lotId);
    if (!lotId) throw new BadRequestException("Lot seçimi zorunludur.");
    const usedQuantity = this.parseNumber(payload.usedQuantity);
    if (!(usedQuantity > 0)) {
      throw new BadRequestException("Kullanım miktarı 0'dan büyük olmalıdır.");
    }

    const rawLots = this.getAccountingRawMaterialLots(company.slug);
    const lot = rawLots.find((row: any) => {
      const rowId = this.cleanText(row.id || row.lotId);
      const rowLotNo = this.cleanText(row.lotNo);
      return rowId === lotId || (rowLotNo && rowLotNo === lotId);
    });
    if (!lot) {
      throw new BadRequestException("Onaylı hammadde lot kaydı bulunamadı.");
    }
    const remainingQuantity = this.parseNumber(
      lot.remainingQuantity ?? lot.availableKg ?? lot.kalanMiktar ?? lot.quantity,
    );
    if (usedQuantity > remainingQuantity) {
      throw new BadRequestException("Kullanım kalan miktardan fazla olamaz.");
    }

    const rows = this.readLotConsumptions(company.slug);
    const consumption: LotConsumption = {
      id: this.uid("lc"),
      modelId: this.cleanText(payload.modelId),
      recipeRunId: this.cleanText(payload.recipeRunId),
      productId: this.cleanText(payload.productId || lot.productId),
      lotId,
      lotNo: this.cleanText(payload.lotNo || lot.lotNo),
      usedQuantity,
      unit: this.cleanText(payload.unit || lot.unit || "KG"),
      usedAt: this.cleanText(payload.usedAt || this.nowIso()),
      notes: this.cleanText(payload.notes),
      status: "Taslak",
      createdAt: this.nowIso(),
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
    };

    // TODO: Onaylı tüketim akışı tamamlanınca remainingQuantity düşümü
    // Muhasebe hammadde lot servisinde atomik olarak yapılacak.
    this.writeLotConsumptions(company.slug, [consumption, ...rows]);
    return consumption;
  }

  createRun(payload: Partial<DyeRun>) {
    const company = this.requireMainCompany(
      payload.mainCompanySlug,
      payload.mainCompanyId,
    );
    const run: DyeRun = {
      id: this.uid("run"),
      colorId: this.cleanText(payload.colorId),
      recipeId: this.cleanText(payload.recipeId),
      workType: this.cleanText(payload.workType || "NUMUNE"),
      version: this.cleanText(payload.version || "V1"),
      katSayisi: this.parseNumber(payload.katSayisi || 1),
      oneLayerTotal: this.parseNumber(payload.oneLayerTotal || 0),
      totalProductionKg: this.parseNumber(payload.totalProductionKg || 0),
      createdAt: this.cleanText(payload.createdAt || this.nowIso()),
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
    };
    const rows = this.readRuns(company.slug);
    this.writeRuns(company.slug, [run, ...rows]);
    return run;
  }
}
