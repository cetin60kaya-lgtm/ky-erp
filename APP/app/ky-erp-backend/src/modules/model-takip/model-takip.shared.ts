import { BadRequestException } from "@nestjs/common";
import { SqlStoreService } from "../../kyerp-core/sql-store.service";

export type ModelTakipLogRow = {
  id: string;
  tarih: string;
  tip: string;
  aciklama: string;
};

export type MusteriIrsaliyeBagRow = {
  dispatchNo: string;
  date: string;
  quantity: number;
  companyName: string;
  zemin: string;
  piyonNo: string;
  kesimhaneAdi: string;
  sourceBelgeId: string;
  note: string;
};

export type ModelTakipRow = {
  id: string;
  anaFirma: string;
  musteriFirma: string;
  modelAdi: string;
  musteriIrsaliyeleri?: MusteriIrsaliyeBagRow[];
  musteriIrsaliyeNo: string;
  zemin: string;
  gelenAdet: number;
  kesimhaneBilgisi: string;
  kesimYeri: string;
  kesimSorumlusu: string;
  kesimNotu: string;
  desenGorseli: string;
  yerlesimGorseli: string;
  not: string;
  durum: string;
  aktif: boolean;
  tarih: string;
  kaynak: string;
  gelenBelgeId: string;
  kaynakBelgeId: string;
  gelenBelgePdf: string;
  createdAt: string;
  updatedAt: string;
  onaylandi: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
  sourceKey?: string;
  docModelKey?: string;
  history: ModelTakipLogRow[];
  mainCompanyId: string;
  mainCompanySlug: string;
  mainCompanyName: string;
};

export type ModelTakipSummaryRow = ModelTakipRow & {
  imalattanCikanAdet: number;
  kesilenIrsaliyeAdedi: number;
  kesilenFaturaAdedi: number;
  toplamUretimAdedi: number;
  toplamIrsaliyeAdedi: number;
  toplamFaturaAdedi: number;
  kalanAdet: number;
  farkAdet: number;
  aktifDurum: string;
  aktifMakinaSayisi: number;
  makinaDurumu: string;
  gelenBelgeVar: boolean;
  bagliIrsaliyeSayisi: number;
  sonIrsaliyeNo: string;
  sonIrsaliyeTarihi: string;
  totalIncomingQty: number;
  totalProductionQty: number;
  totalInvoiceQty: number;
  remainingQty: number;
};

export type ModelTakipDetail = {
  modelKaydi: ModelTakipSummaryRow;
  gelenIrsaliye: any | null;
  gidenIrsaliyeler: any[];
  gidenFaturalar: any[];
  uretimKayitlari: any[];
  kaliteKayitlari: any[];
  lotHammaddeKayitlari: any[];
  sonUretimHareketleri: any[];
  logs: ModelTakipLogRow[];
};

type MainCompany = {
  id: string;
  slug: string;
  name: string;
};

export class ModelTakipStore {
  private readonly files = {
    kayitlar: "model-takip",
    belgeler: "documents",
    uretimKayitlari: "uretim.kayitlar",
    kaliteKayitlari: "uretim.kalite",
    urunler: "products",
  } as const;

  constructor(private readonly db: SqlStoreService) {}

  private cleanText(value: any) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private nowIso() {
    return new Date().toISOString();
  }

  private today() {
    return new Date().toISOString().slice(0, 10);
  }

  private normalizeKey(value: any) {
    return this.cleanText(value)
      .toLocaleUpperCase("tr-TR")
      .replace(/İ/g, "I")
      .replace(/İ/g, "I")
      .replace(/Ğ/g, "G")
      .replace(/Ü/g, "U")
      .replace(/Ş/g, "S")
      .replace(/Ö/g, "O")
      .replace(/Ç/g, "C")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private parseAmount(value: any) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const raw = this.cleanText(value).replace(/[^\d,.\-]/g, "");
    if (!raw) return 0;
    const negative = raw.startsWith("-");
    const unsigned = raw.replace(/-/g, "");
    const lastComma = unsigned.lastIndexOf(",");
    const lastDot = unsigned.lastIndexOf(".");
    let decimalSeparator = "";

    if (lastComma >= 0 && lastDot >= 0) {
      decimalSeparator = lastComma > lastDot ? "," : ".";
    } else if (lastComma >= 0) {
      const digitsAfter = unsigned.length - lastComma - 1;
      decimalSeparator = digitsAfter === 1 || digitsAfter === 2 ? "," : "";
    } else if (lastDot >= 0) {
      const digitsAfter = unsigned.length - lastDot - 1;
      decimalSeparator = digitsAfter === 1 || digitsAfter === 2 ? "." : "";
    }

    let normalized = unsigned;
    if (decimalSeparator === ",") {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else if (decimalSeparator === ".") {
      normalized = normalized.replace(/,/g, "");
    } else {
      normalized = normalized.replace(/[.,]/g, "");
    }

    const parsed = Number(`${negative ? "-" : ""}${normalized}`);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private buildBindingKey(modelAdi: string, irsaliyeNo: string) {
    return [this.normalizeKey(modelAdi), this.normalizeKey(irsaliyeNo)].join(
      "|",
    );
  }

  private buildModelKey(payload: {
    anaFirma?: string;
    musteriFirma?: string;
    modelAdi?: string;
  }) {
    return [
      this.normalizeKey(payload.anaFirma),
      this.normalizeKey(payload.musteriFirma),
      this.normalizeKey(payload.modelAdi),
    ].join("|");
  }

  private buildLooseModelKey(payload: { musteriFirma?: string; modelAdi?: string }) {
    return [
      this.normalizeKey(payload.musteriFirma),
      this.normalizeKey(payload.modelAdi),
    ].join("|");
  }

  private buildDisplayKey(...values: any[]) {
    return values.map((value) => this.normalizeKey(value)).filter(Boolean).join("|");
  }

  private deletedIdentityKeys(company: MainCompany) {
    const modelKeys = new Set<string>();
    const looseKeys = new Set<string>();
    const sourceKeys = new Set<string>();
    const displayKeys = new Set<string>();

    for (const row of this.getRawRows(company.slug)) {
      if (!row.isDeleted && !row.deletedAt) continue;
      modelKeys.add(
        this.buildModelKey({
          anaFirma: row.anaFirma || company.name,
          musteriFirma: row.musteriFirma,
          modelAdi: row.modelAdi,
        }),
      );
      looseKeys.add(
        this.buildLooseModelKey({
          musteriFirma: row.musteriFirma,
          modelAdi: row.modelAdi,
        }),
      );
      [
        row.id,
        row.sourceKey,
        row.docModelKey,
        row.gelenBelgeId,
        row.kaynakBelgeId,
        row.musteriIrsaliyeNo,
      ]
        .map((value) => this.cleanText(value))
        .filter(Boolean)
        .forEach((value) => sourceKeys.add(value));
      [
        this.buildDisplayKey(row.modelAdi, row.musteriIrsaliyeNo),
        this.buildDisplayKey(row.modelAdi, row.musteriFirma),
        this.buildDisplayKey(row.modelAdi, row.zemin),
        this.buildDisplayKey(row.modelAdi, row.gelenAdet),
      ]
        .filter(Boolean)
        .forEach((value) => displayKeys.add(value));
    }

    return { modelKeys, looseKeys, sourceKeys, displayKeys };
  }

  isModelHidden(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    payload: {
      id?: string;
      sourceKey?: string;
      docModelKey?: string;
      modelAdi?: string;
      modelName?: string;
      model?: string;
      musteriFirma?: string;
      musteri?: string;
      customer?: string;
      customerName?: string;
      anaFirma?: string;
      belgeNo?: string;
      irsaliyeNo?: string;
      displayName?: string;
      cardTitle?: string;
      zemin?: string;
      givenQty?: string | number;
    },
  ) {
    const company = this.requireMainCompany(mainCompanySlug, mainCompanyId);
    const hidden = this.deletedIdentityKeys(company);
    const modelAdi = this.cleanText(
      payload.modelAdi || payload.modelName || payload.model,
    );
    const musteriFirma = this.cleanText(
      payload.musteriFirma || payload.musteri || payload.customerName || payload.customer,
    );
    const sourceCandidates = [
      payload.id,
      payload.sourceKey,
      payload.docModelKey,
      payload.belgeNo,
      payload.irsaliyeNo,
    ]
      .map((value) => this.cleanText(value))
      .filter(Boolean);
    if (sourceCandidates.some((value) => hidden.sourceKeys.has(value))) return true;
    const displayCandidates = [
      this.buildDisplayKey(payload.displayName || payload.cardTitle),
      this.buildDisplayKey(modelAdi, payload.irsaliyeNo || payload.belgeNo),
      this.buildDisplayKey(modelAdi, musteriFirma),
      this.buildDisplayKey(modelAdi, payload.zemin),
      this.buildDisplayKey(modelAdi, payload.givenQty),
    ].filter(Boolean);
    if (displayCandidates.some((value) => hidden.displayKeys.has(value))) return true;
    if (
      modelAdi &&
      musteriFirma &&
      hidden.modelKeys.has(
        this.buildModelKey({
          anaFirma: payload.anaFirma || company.name,
          musteriFirma,
          modelAdi,
        }),
      )
    ) {
      return true;
    }
    return (
      modelAdi &&
      musteriFirma &&
      hidden.looseKeys.has(this.buildLooseModelKey({ musteriFirma, modelAdi }))
    );
  }

  private buildStorageKey(payload: {
    anaFirma?: string;
    musteriFirma?: string;
    modelAdi?: string;
    musteriIrsaliyeNo?: string;
  }) {
    return [
      this.normalizeKey(payload.anaFirma),
      this.normalizeKey(payload.musteriFirma),
      this.normalizeKey(payload.modelAdi),
      this.normalizeKey(payload.musteriIrsaliyeNo),
    ].join("|");
  }

  private normalizeIrsaliyeBag(item: any): MusteriIrsaliyeBagRow {
    const dispatchNo = this.cleanText(
      item?.dispatchNo || item?.irsaliyeNo || item?.documentNo,
    );
    return {
      dispatchNo,
      date: this.cleanText(item?.date || item?.tarih),
      quantity: this.parseAmount(item?.quantity ?? item?.gelenAdet ?? 0),
      companyName: this.cleanText(item?.companyName || item?.firma),
      zemin: this.cleanText(item?.zemin),
      piyonNo: this.cleanText(item?.piyonNo),
      kesimhaneAdi: this.cleanText(
        item?.kesimhaneAdi || item?.kesimhaneBilgisi,
      ),
      sourceBelgeId: this.cleanText(item?.sourceBelgeId || item?.gelenBelgeId),
      note: this.cleanText(item?.note || item?.not),
    };
  }

  private mergeIrsaliyeList(
    ...sources: Array<Array<any> | undefined>
  ): MusteriIrsaliyeBagRow[] {
    const merged = new Map<string, MusteriIrsaliyeBagRow>();
    for (const source of sources) {
      for (const raw of Array.isArray(source) ? source : []) {
        const normalized = this.normalizeIrsaliyeBag(raw);
        if (!normalized.dispatchNo) continue;
        const key = this.normalizeKey(normalized.dispatchNo);
        const prev = merged.get(key);
        merged.set(key, {
          dispatchNo: normalized.dispatchNo,
          date: normalized.date || prev?.date || "",
          quantity:
            normalized.quantity > 0
              ? normalized.quantity
              : Number(prev?.quantity || 0),
          companyName: normalized.companyName || prev?.companyName || "",
          zemin: normalized.zemin || prev?.zemin || "",
          piyonNo: normalized.piyonNo || prev?.piyonNo || "",
          kesimhaneAdi: normalized.kesimhaneAdi || prev?.kesimhaneAdi || "",
          sourceBelgeId: normalized.sourceBelgeId || prev?.sourceBelgeId || "",
          note: normalized.note || prev?.note || "",
        });
      }
    }
    return Array.from(merged.values()).sort((a, b) =>
      `${b.date || ""}-${b.dispatchNo || ""}`.localeCompare(
        `${a.date || ""}-${a.dispatchNo || ""}`,
      ),
    );
  }

  private listToplamGelenAdet(list: MusteriIrsaliyeBagRow[]) {
    return Number(
      list.reduce((sum, item) => sum + this.parseAmount(item?.quantity), 0),
    );
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

  private readRows<T>(slug: string, fileName: string, fallback: T) {
    return this.db.readMainCompanyStore<T>(slug, fileName, fallback);
  }

  private writeRows<T>(slug: string, fileName: string, rows: T) {
    return this.db.writeMainCompanyStore(slug, fileName, rows);
  }

  private getRawRows(slug: string) {
    return [];
  }

  private saveRawRows(slug: string, rows: ModelTakipRow[]) {
    return rows;
  }

  private getDocuments(slug: string) {
    return [];
  }

  private getUretimKayitlari(slug: string) {
    return [];
  }

  private getKaliteKayitlari(slug: string) {
    return [];
  }

  private getProducts(slug: string) {
    return [];
  }

  private documentFlowType(document: any) {
    return this.normalizeKey(
      document?.header?.flowType || document?.workflowType || "",
    );
  }

  private sumDocumentQty(document: any) {
    const header = document?.header || {};
    const itemTotal = Array.isArray(document?.items)
      ? document.items.reduce((sum: number, item: any) => {
          return (
            sum +
            this.parseAmount(
              item?.miktar ?? item?.quantity ?? item?.adet ?? item?.kg,
            )
          );
        }, 0)
      : 0;
    return (
      this.parseAmount(header?.belgeAdediToplami) ||
      this.parseAmount(header?.irsaliyeAdedi) ||
      this.parseAmount(header?.faturalananAdet) ||
      itemTotal
    );
  }

  private getDocumentRefs(document: any) {
    const header = document?.header || {};
    return [
      header?.irsaliyeNo,
      header?.bagliIrsaliyeNo,
      header?.dispatchNo,
      header?.documentNo,
      ...(Array.isArray(header?.dispatchReferences)
        ? header.dispatchReferences
        : []),
      ...(Array.isArray(document?.dispatchReferences)
        ? document.dispatchReferences
        : []),
    ]
      .map((item) => this.cleanText(item))
      .filter(Boolean);
  }

  private matchDocumentToModel(document: any, modelKaydi: ModelTakipRow) {
    if (this.cleanText(document?.modelKaydiId) === modelKaydi.id) return true;
    const header = document?.header || {};
    const headerModel = this.cleanText(header?.modelAdi || document?.modelAdi);
    const sameModel =
      !headerModel ||
      this.normalizeKey(headerModel) === this.normalizeKey(modelKaydi.modelAdi);
    const refs = this.getDocumentRefs(document);
    const irsaliyeSet = new Set(
      this.mergeIrsaliyeList(
        modelKaydi.musteriIrsaliyeleri,
        modelKaydi.musteriIrsaliyeNo
          ? [{ dispatchNo: modelKaydi.musteriIrsaliyeNo }]
          : [],
      ).map((item) => this.normalizeKey(item.dispatchNo)),
    );
    const sameIrsaliye = refs.some((item) =>
      irsaliyeSet.has(this.normalizeKey(item)),
    );
    return sameModel && sameIrsaliye;
  }

  private getLotHammaddeKayitlari(slug: string, modelKaydi: ModelTakipRow) {
    const products = this.getProducts(slug);
    return products
      .flatMap((product: any) => {
        const productName = this.cleanText(
          product?.urunAdi || product?.ticariAdi || product?.matchedProductName,
        );
        const baseAmbalaj = this.cleanText(
          product?.varsayilanAmbalaj || product?.ambalaj,
        );
        const usages = [
          ...(Array.isArray(product?.modelBazliHammaddeKullanimi)
            ? product.modelBazliHammaddeKullanimi
            : []),
          ...(Array.isArray(product?.kullanilanLotlar)
            ? product.kullanilanLotlar
            : []),
        ];

        return usages
          .filter((usage: any) => {
            if (this.cleanText(usage?.bagliModelKaydiId) === modelKaydi.id)
              return true;
            return false;
          })
          .map((usage: any) => {
            const lotNo = this.cleanText(usage?.lotNo || usage?.lot);
            const lotRows = Array.isArray(product?.lotKayitlari)
              ? product.lotKayitlari
              : [];
            const lotMeta =
              lotRows.find(
                (lot: any) =>
                  this.normalizeKey(lot?.lotNo) === this.normalizeKey(lotNo),
              ) || null;

            return {
              id: this.cleanText(usage?.id || `${productName}-${lotNo}`),
              bagliUrun: productName || "-",
              ambalaj: this.cleanText(
                usage?.ambalaj || lotMeta?.ambalaj || baseAmbalaj,
              ),
              lotNo: lotNo || this.cleanText(lotMeta?.lotNo),
              kullanimMiktari: this.parseAmount(
                usage?.kullanilanMiktar || usage?.miktar,
              ),
              tarih: this.cleanText(
                usage?.kullanimTarihi ||
                  lotMeta?.girisTarihi ||
                  lotMeta?.belgeTarihi,
              ),
              belgeNo: this.cleanText(lotMeta?.belgeNo),
              tedarikciFirma: this.cleanText(lotMeta?.tedarikciFirma),
            };
          });
      })
      .sort((a, b) =>
        String(b.tarih || "").localeCompare(String(a.tarih || "")),
      );
  }

  private makeBaseRow(company: MainCompany, payload: Partial<ModelTakipRow>) {
    const now = this.nowIso();
    const normalizedList = this.mergeIrsaliyeList(
      payload.musteriIrsaliyeleri,
      payload.musteriIrsaliyeNo
        ? [
            {
              dispatchNo: payload.musteriIrsaliyeNo,
              date: payload.tarih,
              quantity: payload.gelenAdet,
              companyName: payload.musteriFirma,
              zemin: payload.zemin,
              kesimhaneAdi: payload.kesimhaneBilgisi,
              sourceBelgeId: payload.gelenBelgeId || payload.kaynakBelgeId,
              note: payload.not,
            },
          ]
        : [],
    );
    const latestIrsaliye = normalizedList[0] || null;
    const calculatedGelen = this.listToplamGelenAdet(normalizedList);
    return {
      id: this.cleanText(payload.id || `mdl-${Date.now()}`),
      anaFirma: this.cleanText(payload.anaFirma || company.name),
      musteriFirma: this.cleanText(payload.musteriFirma),
      modelAdi: this.cleanText(payload.modelAdi),
      musteriIrsaliyeleri: normalizedList,
      musteriIrsaliyeNo: this.cleanText(
        latestIrsaliye?.dispatchNo || payload.musteriIrsaliyeNo,
      ),
      zemin: this.cleanText(latestIrsaliye?.zemin || payload.zemin),
      gelenAdet:
        calculatedGelen > 0
          ? calculatedGelen
          : this.parseAmount(payload.gelenAdet),
      kesimhaneBilgisi: this.cleanText(
        latestIrsaliye?.kesimhaneAdi || payload.kesimhaneBilgisi,
      ),
      kesimYeri: this.cleanText(payload.kesimYeri),
      kesimSorumlusu: this.cleanText(payload.kesimSorumlusu),
      kesimNotu: this.cleanText(payload.kesimNotu),
      desenGorseli: this.cleanText(payload.desenGorseli),
      yerlesimGorseli: this.cleanText(payload.yerlesimGorseli),
      not: this.cleanText(payload.not),
      durum: this.cleanText(payload.durum || "İşlem Bekliyor"),
      aktif: payload.aktif !== false,
      tarih: this.cleanText(payload.tarih || this.today()),
      kaynak: this.cleanText(payload.kaynak || "Model Takip"),
      gelenBelgeId: this.cleanText(payload.gelenBelgeId),
      kaynakBelgeId: this.cleanText(
        payload.kaynakBelgeId || payload.gelenBelgeId,
      ),
      gelenBelgePdf: this.cleanText(payload.gelenBelgePdf),
      createdAt: this.cleanText(payload.createdAt || now),
      updatedAt: now,
      onaylandi: Boolean(payload.onaylandi),
      history: Array.isArray(payload.history) ? payload.history : [],
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
    } satisfies ModelTakipRow;
  }

  private ensureRequiredModelFields(payload: Partial<ModelTakipRow>) {
    if (!this.cleanText(payload.musteriFirma)) {
      throw new BadRequestException("Müşteri firma zorunludur.");
    }
    if (!this.cleanText(payload.modelAdi)) {
      throw new BadRequestException("Model adı zorunludur.");
    }
    const list = this.mergeIrsaliyeList(payload.musteriIrsaliyeleri);
    if (!list.length && !this.cleanText(payload.musteriIrsaliyeNo)) {
      throw new BadRequestException("Müşteri irsaliye no zorunludur.");
    }
  }

  private mergeIncomingIrsaliyeRows(company: MainCompany) {
    const docs = this.getDocuments(company.slug);
    const manualRows = this.getRawRows(company.slug);
    const map = new Map<string, ModelTakipRow>();
    const deletedKeys = this.deletedIdentityKeys(company);

    for (const row of manualRows) {
      const key = this.buildModelKey({
        anaFirma: row.anaFirma,
        musteriFirma: row.musteriFirma,
        modelAdi: row.modelAdi,
      });
      if (row.isDeleted || row.deletedAt) continue;
      const list = this.mergeIrsaliyeList(
        row.musteriIrsaliyeleri,
        row.musteriIrsaliyeNo
          ? [
              {
                dispatchNo: row.musteriIrsaliyeNo,
                date: row.tarih,
                quantity: row.gelenAdet,
                companyName: row.musteriFirma,
                zemin: row.zemin,
                kesimhaneAdi: row.kesimhaneBilgisi,
                sourceBelgeId: row.gelenBelgeId || row.kaynakBelgeId,
                note: row.not,
              },
            ]
          : [],
      );
      map.set(key, {
        ...row,
        musteriIrsaliyeleri: list,
        musteriIrsaliyeNo: this.cleanText(
          list[0]?.dispatchNo || row.musteriIrsaliyeNo,
        ),
        gelenAdet:
          this.listToplamGelenAdet(list) > 0
            ? this.listToplamGelenAdet(list)
            : this.parseAmount(row.gelenAdet),
      });
    }

    for (const doc of docs) {
      const flow = this.documentFlowType(doc);
      if (flow !== "GELEN_IRSALIYE") continue;
      const header = doc?.header || {};
      const modelAdi = this.cleanText(header?.modelAdi);
      const musteriIrsaliyeNo = this.cleanText(
        header?.irsaliyeNo || header?.dispatchNo || header?.documentNo,
      );
      if (!modelAdi || !musteriIrsaliyeNo) continue;
      const musteriFirma = this.cleanText(
        doc?.relatedCompanyName ||
          header?.cariFirma ||
          header?.companyName ||
          "",
      );
      const key = this.buildModelKey({
        anaFirma: header?.anaFirma || company.name,
        musteriFirma,
        modelAdi,
      });
      if (deletedKeys.modelKeys.has(key)) continue;
      if (
        deletedKeys.looseKeys.has(
          this.buildLooseModelKey({ musteriFirma, modelAdi }),
        )
      ) {
        continue;
      }
      const existing = map.get(key);
      const docIrsaliye = {
        dispatchNo: musteriIrsaliyeNo,
        date: this.cleanText(header?.date || doc?.updatedAt || this.today()),
        quantity: this.sumDocumentQty(doc),
        companyName: musteriFirma,
        zemin: this.cleanText(header?.zemin),
        piyonNo: this.cleanText(header?.piyonNo),
        kesimhaneAdi: this.cleanText(
          header?.kesimhaneAdi || header?.kesimhaneBilgisi,
        ),
        sourceBelgeId: this.cleanText(doc?.documentId),
        note: this.cleanText(header?.aciklama),
      };
      const mergedList = this.mergeIrsaliyeList(
        existing?.musteriIrsaliyeleri,
        existing?.musteriIrsaliyeNo
          ? [
              {
                dispatchNo: existing.musteriIrsaliyeNo,
                date: existing.tarih,
                quantity: existing.gelenAdet,
                companyName: existing.musteriFirma,
                zemin: existing.zemin,
                kesimhaneAdi: existing.kesimhaneBilgisi,
                sourceBelgeId: existing.gelenBelgeId || existing.kaynakBelgeId,
                note: existing.not,
              },
            ]
          : [],
        [docIrsaliye],
      );
      const autoRow = this.makeBaseRow(company, {
        ...existing,
        modelAdi,
        musteriIrsaliyeleri: mergedList,
        musteriIrsaliyeNo: this.cleanText(
          mergedList[0]?.dispatchNo || musteriIrsaliyeNo,
        ),
        anaFirma: header?.anaFirma || company.name,
        musteriFirma,
        zemin: this.cleanText(
          mergedList[0]?.zemin || existing?.zemin || header?.zemin || "",
        ),
        gelenAdet: this.listToplamGelenAdet(mergedList),
        tarih: this.cleanText(
          mergedList[0]?.date ||
            header?.date ||
            existing?.tarih ||
            this.today(),
        ),
        not: existing?.not || "",
        kesimhaneBilgisi: this.cleanText(
          mergedList[0]?.kesimhaneAdi || existing?.kesimhaneBilgisi || "",
        ),
        kesimYeri: existing?.kesimYeri || "",
        kesimSorumlusu: existing?.kesimSorumlusu || "",
        kesimNotu: existing?.kesimNotu || "",
        desenGorseli: existing?.desenGorseli || "",
        yerlesimGorseli: existing?.yerlesimGorseli || "",
        gelenBelgeId: this.cleanText(
          mergedList[0]?.sourceBelgeId ||
            doc?.documentId ||
            existing?.gelenBelgeId ||
            "",
        ),
        kaynakBelgeId:
          this.cleanText(mergedList[0]?.sourceBelgeId || doc?.documentId) ||
          existing?.kaynakBelgeId ||
          existing?.gelenBelgeId ||
          "",
        gelenBelgePdf:
          doc?.metrics?.previewUrl ||
          doc?.pdfFileName ||
          existing?.gelenBelgePdf ||
          "",
        kaynak: existing?.kaynak || "Müşteri İrsaliye",
        history: existing?.history || [],
        onaylandi: existing?.onaylandi || false,
      });
      map.set(key, autoRow);
    }

    const merged = Array.from(map.values());
    this.saveRawRows(company.slug, merged);
    return merged;
  }

  syncFromIncomingDocuments(mainCompanySlug?: string, mainCompanyId?: string) {
    const company = this.requireMainCompany(mainCompanySlug, mainCompanyId);
    return this.mergeIncomingIrsaliyeRows(company);
  }

  getSummaryRows(mainCompanySlug?: string, mainCompanyId?: string) {
    const company = this.requireMainCompany(mainCompanySlug, mainCompanyId);
    const rows = this
      .mergeIncomingIrsaliyeRows(company)
      .filter((row) => !row.isDeleted && !row.deletedAt);
    const docs = this.getDocuments(company.slug);
    const uretimRows = this.getUretimKayitlari(company.slug);

    return rows
      .map((row) => {
        const irsaliyeList = this.mergeIrsaliyeList(
          row.musteriIrsaliyeleri,
          row.musteriIrsaliyeNo
            ? [
                {
                  dispatchNo: row.musteriIrsaliyeNo,
                  date: row.tarih,
                  quantity: row.gelenAdet,
                  companyName: row.musteriFirma,
                  zemin: row.zemin,
                  kesimhaneAdi: row.kesimhaneBilgisi,
                  sourceBelgeId: row.gelenBelgeId || row.kaynakBelgeId,
                  note: row.not,
                },
              ]
            : [],
        );
        const bindingRefs = new Set(
          irsaliyeList.map((item) =>
            this.buildBindingKey(row.modelAdi, item.dispatchNo),
          ),
        );
        const relatedUretim = uretimRows.filter((item) => {
          const itemKey = this.buildBindingKey(
            item?.modelAdi,
            item?.musteriIrsaliyeNo,
          );
          return item?.modelKaydiId === row.id || bindingRefs.has(itemKey);
        });
        const activeMakinaSet = new Set(
          relatedUretim
            .map((item) => this.cleanText(item?.makina))
            .filter(Boolean),
        );
        const imalattanCikanAdet = relatedUretim.reduce(
          (sum, item) => sum + this.parseAmount(item?.uretimAdedi),
          0,
        );

        const gidenIrsaliyeler = docs.filter((doc) => {
          const flow = this.documentFlowType(doc);
          if (flow !== "GIDEN_IRSALIYE") return false;
          return this.matchDocumentToModel(doc, row);
        });
        const gidenFaturalar = docs.filter((doc) => {
          const flow = this.documentFlowType(doc);
          if (flow !== "GIDEN_FATURA") return false;
          return this.matchDocumentToModel(doc, row);
        });
        const kesilenIrsaliyeAdedi = gidenIrsaliyeler.reduce(
          (sum, doc) => sum + this.sumDocumentQty(doc),
          0,
        );
        const kesilenFaturaAdedi = gidenFaturalar.reduce(
          (sum, doc) => sum + this.sumDocumentQty(doc),
          0,
        );

        const gelenAdet =
          this.listToplamGelenAdet(irsaliyeList) > 0
            ? this.listToplamGelenAdet(irsaliyeList)
            : this.parseAmount(row.gelenAdet);
        const kalanAdet = Math.max(
          gelenAdet - Math.max(imalattanCikanAdet, kesilenFaturaAdedi),
          0,
        );
        const farkAdet = imalattanCikanAdet - kesilenFaturaAdedi;

        const tolerance = Math.max(1, Math.round(gelenAdet * 0.05));
        const belgeUretimUyumlu =
          imalattanCikanAdet > 0 &&
          kesilenFaturaAdedi > 0 &&
          Math.abs(imalattanCikanAdet - kesilenFaturaAdedi) <= tolerance;

        let aktifDurum = "İşlem Bekliyor";
        if (row.onaylandi || row.aktif === false) {
          aktifDurum = "Tamamlandı";
        } else if (
          gelenAdet > 0 &&
          Math.max(
            imalattanCikanAdet,
            kesilenIrsaliyeAdedi,
            kesilenFaturaAdedi,
          ) >= gelenAdet &&
          belgeUretimUyumlu
        ) {
          aktifDurum = "Kapanmaya Hazır";
        } else if (activeMakinaSet.size > 0) {
          aktifDurum = "İmalatta";
        } else if (kesilenFaturaAdedi > 0 && kesilenFaturaAdedi < gelenAdet) {
          aktifDurum = "Kısmi Faturalandı";
        } else if (imalattanCikanAdet > 0 && imalattanCikanAdet < gelenAdet) {
          aktifDurum = "Kısmi Üretildi";
        }

        const makinaDurumu =
          activeMakinaSet.size <= 0
            ? "makina başlamadı"
            : activeMakinaSet.size === 1
              ? "1 makina çalışıyor"
              : `${activeMakinaSet.size} makina başladı`;

        return {
          ...row,
          musteriIrsaliyeleri: irsaliyeList,
          musteriIrsaliyeNo: this.cleanText(
            irsaliyeList[0]?.dispatchNo || row.musteriIrsaliyeNo,
          ),
          zemin: this.cleanText(irsaliyeList[0]?.zemin || row.zemin),
          kesimhaneBilgisi: this.cleanText(
            irsaliyeList[0]?.kesimhaneAdi || row.kesimhaneBilgisi,
          ),
          gelenAdet,
          durum: aktifDurum,
          aktifDurum,
          imalattanCikanAdet,
          kesilenIrsaliyeAdedi,
          kesilenFaturaAdedi,
          toplamUretimAdedi: imalattanCikanAdet,
          toplamIrsaliyeAdedi: kesilenIrsaliyeAdedi,
          toplamFaturaAdedi: kesilenFaturaAdedi,
          kalanAdet,
          farkAdet,
          aktifMakinaSayisi: activeMakinaSet.size,
          makinaDurumu,
          gelenBelgeVar: Boolean(row.gelenBelgeId || row.gelenBelgePdf),
          bagliIrsaliyeSayisi: irsaliyeList.length,
          sonIrsaliyeNo: this.cleanText(
            irsaliyeList[0]?.dispatchNo || row.musteriIrsaliyeNo,
          ),
          sonIrsaliyeTarihi: this.cleanText(
            irsaliyeList[0]?.date || row.tarih || "",
          ),
          totalIncomingQty: gelenAdet,
          totalProductionQty: imalattanCikanAdet,
          totalInvoiceQty: kesilenFaturaAdedi,
          remainingQty: kalanAdet,
          updatedAt: row.updatedAt || this.nowIso(),
        } satisfies ModelTakipSummaryRow;
      })
      .sort((a, b) =>
        `${a.musteriFirma} ${a.modelAdi}`.localeCompare(
          `${b.musteriFirma} ${b.modelAdi}`,
          "tr",
          { sensitivity: "base" },
        ),
      );
  }

  getById(mainCompanySlug?: string, mainCompanyId?: string, id?: string) {
    const rows = this.getSummaryRows(mainCompanySlug, mainCompanyId);
    return rows.find((item) => item.id === this.cleanText(id)) || null;
  }

  saveModel(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    payload: Partial<ModelTakipRow> & { forceNewModel?: boolean },
  ) {
    const company = this.requireMainCompany(mainCompanySlug, mainCompanyId);
    this.ensureRequiredModelFields(payload);
    const rows = this.getRawRows(company.slug);
    const key = this.buildModelKey({
      anaFirma: payload.anaFirma || company.name,
      musteriFirma: payload.musteriFirma,
      modelAdi: payload.modelAdi,
    });
    const existing = rows.find((item) => item.id === payload.id) || null;
    const forceNewModel = Boolean((payload as any)?.forceNewModel);
    const tombstone = rows.find(
      (item) =>
        (item.isDeleted || item.deletedAt) &&
        this.buildModelKey({
          anaFirma: item.anaFirma,
          musteriFirma: item.musteriFirma,
          modelAdi: item.modelAdi,
        }) === key,
    );
    if (tombstone && !forceNewModel && !existing) {
      throw new BadRequestException(
        "Bu model arşivlenmiş. Yeniden açmak için yeni model olarak oluşturun.",
      );
    }
    const duplicate = rows.find((item) => {
      if (existing && item.id === existing.id) return false;
      if (item.isDeleted || item.deletedAt) return false;
      return (
        this.buildModelKey({
          anaFirma: item.anaFirma,
          musteriFirma: item.musteriFirma,
          modelAdi: item.modelAdi,
        }) === key
      );
    });

    if (duplicate && !forceNewModel && !existing) {
      const mergedPayload = {
        ...duplicate,
        ...payload,
        id: duplicate.id,
        musteriIrsaliyeleri: this.mergeIrsaliyeList(
          duplicate.musteriIrsaliyeleri,
          duplicate.musteriIrsaliyeNo
            ? [
                {
                  dispatchNo: duplicate.musteriIrsaliyeNo,
                  date: duplicate.tarih,
                  quantity: duplicate.gelenAdet,
                  companyName: duplicate.musteriFirma,
                  zemin: duplicate.zemin,
                  kesimhaneAdi: duplicate.kesimhaneBilgisi,
                  sourceBelgeId:
                    duplicate.gelenBelgeId || duplicate.kaynakBelgeId,
                  note: duplicate.not,
                },
              ]
            : [],
          (payload as any).musteriIrsaliyeleri,
          payload.musteriIrsaliyeNo
            ? [
                {
                  dispatchNo: payload.musteriIrsaliyeNo,
                  date: payload.tarih,
                  quantity: payload.gelenAdet,
                  companyName: payload.musteriFirma,
                  zemin: payload.zemin,
                  kesimhaneAdi: payload.kesimhaneBilgisi,
                  sourceBelgeId: payload.gelenBelgeId || payload.kaynakBelgeId,
                  note: payload.not,
                },
              ]
            : [],
        ),
      };
      return this.saveModel(mainCompanySlug, mainCompanyId, mergedPayload);
    }

    const isCloseApproveAction =
      Boolean(payload.onaylandi) &&
      payload.aktif === false &&
      !Boolean(existing?.onaylandi);

    const nextRow = this.makeBaseRow(company, {
      ...existing,
      ...payload,
      id: this.cleanText(
        payload.id ||
          existing?.id ||
          (duplicate && forceNewModel
            ? `mdl-${Date.now()}-${Math.floor(Math.random() * 1000)}`
            : `mdl-${Date.now()}`),
      ),
      history: [
        ...(Array.isArray(existing?.history) ? existing.history : []),
        {
          id: `log-${Date.now()}`,
          tarih: this.nowIso(),
          tip: isCloseApproveAction
            ? "ONAY_KAPAT"
            : existing
              ? "GUNCELLEME"
              : "OLUSTURMA",
          aciklama: existing
            ? isCloseApproveAction
              ? "Model kaydı onaylanarak tamamlandı"
              : "Model takip ana kaydı güncellendi"
            : "Model takip ana kaydı oluşturuldu",
        },
      ],
    });

    const nextRows = [
      nextRow,
      ...rows.filter((item) => item.id !== nextRow.id),
    ];
    this.saveRawRows(company.slug, nextRows);
    return this.getById(company.slug, company.id, nextRow.id);
  }

  saveVisuals(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    payload: Partial<ModelTakipRow>,
  ) {
    const row = this.getById(mainCompanySlug, mainCompanyId, payload.id);
    if (!row) {
      throw new BadRequestException("Güncellenecek model kaydı bulunamadı.");
    }
    return this.saveModel(mainCompanySlug, mainCompanyId, {
      ...row,
      desenGorseli: this.cleanText(payload.desenGorseli || row.desenGorseli),
      yerlesimGorseli: this.cleanText(
        payload.yerlesimGorseli || row.yerlesimGorseli,
      ),
      kesimhaneBilgisi: this.cleanText(
        payload.kesimhaneBilgisi || row.kesimhaneBilgisi,
      ),
      kesimYeri: this.cleanText(payload.kesimYeri || row.kesimYeri),
      kesimSorumlusu: this.cleanText(
        payload.kesimSorumlusu || row.kesimSorumlusu,
      ),
      kesimNotu: this.cleanText(payload.kesimNotu || row.kesimNotu),
      not: this.cleanText(payload.not || row.not),
    });
  }

  deleteModel(
    mainCompanySlug: string | undefined,
    mainCompanyId: string | undefined,
    id?: string,
    payload: Record<string, any> = {},
  ) {
    const company = this.requireMainCompany(mainCompanySlug, mainCompanyId);
    const targetId = this.cleanText(id);
    const current = this.getById(company.slug, company.id, targetId);
    const rows = this.getRawRows(company.slug);
    const existing = rows.find((item) => item.id === targetId) || current;
    const payloadModelName = this.cleanText(
      payload.modelName || payload.modelAdi || payload.model,
    );
    const payloadCustomer = this.cleanText(
      payload.customerName ||
        payload.customer ||
        payload.musteri ||
        payload.musteriFirma,
    );
    const isVirtualDelete =
      targetId.startsWith("doc-model-") || (!existing && payloadModelName);
    if (!existing && !isVirtualDelete) {
      throw new BadRequestException("Silinecek model kaydı bulunamadı.");
    }
    const deletedAt = this.nowIso();
    const sourceKey = this.cleanText(
      payload.sourceKey || payload.docModelKey || payload.sourceId || targetId,
    );
    const displayName = this.cleanText(
      payload.displayName ||
        payload.cardTitle ||
        [payloadModelName, payload.irsaliyeNo || payload.belgeNo]
          .filter(Boolean)
          .join(" - "),
    );
    const virtualRow = !existing;
    const baseRow: ModelTakipRow =
      existing ||
      ({
        id: targetId || `hidden-${Date.now()}`,
        anaFirma: company.name,
        musteriFirma: payloadCustomer,
        modelAdi: payloadModelName || targetId,
        musteriIrsaliyeleri: [],
        musteriIrsaliyeNo: this.cleanText(
          payload.irsaliyeNo || payload.belgeNo || payload.siparisNo || sourceKey,
        ),
        zemin: this.cleanText(payload.zemin || payload.floor || payload.ground),
        gelenAdet: 0,
        kesimhaneBilgisi: "",
        kesimYeri: "",
        kesimSorumlusu: "",
        kesimNotu: "",
        desenGorseli: "",
        yerlesimGorseli: "",
        not: "Belge kaynaklı sanal model gizlendi.",
        durum: "Arşiv",
        aktif: false,
        tarih: this.today(),
        kaynak: this.cleanText(payload.sourceType || payload.kaynak || "Muhasebe"),
        gelenBelgeId: this.cleanText(payload.belgeNo || payload.documentId),
        kaynakBelgeId: this.cleanText(payload.documentId || payload.belgeNo),
        gelenBelgePdf: "",
        createdAt: deletedAt,
        updatedAt: deletedAt,
        onaylandi: false,
        history: [],
        mainCompanyId: company.id,
        mainCompanySlug: company.slug,
        mainCompanyName: company.name,
      } satisfies ModelTakipRow);
    const deletedRow: ModelTakipRow = {
      ...baseRow,
      aktif: false,
      durum: "Arşiv",
      isDeleted: true,
      deletedAt,
      sourceKey,
      docModelKey: this.cleanText(payload.docModelKey || targetId),
      updatedAt: deletedAt,
      history: [
        ...(Array.isArray(baseRow.history) ? baseRow.history : []),
        {
          id: `log-${Date.now()}`,
          tarih: deletedAt,
          tip: "ARSIV",
          aciklama: virtualRow
            ? "Belge kaynaklı sanal model gizlendi"
            : "Model kaydı arşive alındı",
        },
      ],
      mainCompanyId: company.id,
      mainCompanySlug: company.slug,
      mainCompanyName: company.name,
    };
    const hiddenKeys = [
      targetId,
      deletedRow.id,
      deletedRow.sourceKey,
      deletedRow.docModelKey,
      sourceKey,
      payload.belgeNo,
      payload.irsaliyeNo,
      displayName,
      this.buildDisplayKey(deletedRow.modelAdi, deletedRow.musteriIrsaliyeNo),
      this.buildDisplayKey(deletedRow.modelAdi, deletedRow.musteriFirma),
      this.buildDisplayKey(deletedRow.modelAdi, deletedRow.zemin),
      this.buildLooseModelKey({
        musteriFirma: deletedRow.musteriFirma,
        modelAdi: deletedRow.modelAdi,
      }),
    ]
      .map((value) => this.cleanText(value))
      .filter(Boolean);
    this.saveRawRows(
      company.slug,
      [
        deletedRow,
        ...rows.filter((item) => item.id !== targetId),
      ],
    );
    return {
      ok: true,
      id: targetId,
      archived: true,
      virtual: virtualRow,
      mode: "soft-delete",
      deletedAt,
      hiddenKeys,
      removedKeys: hiddenKeys,
      modelName: deletedRow.modelAdi,
      displayName,
      sourceKey: deletedRow.sourceKey,
      docModelKey: deletedRow.docModelKey,
      message: virtualRow
        ? "Belge kaynaklı model gizlendi."
        : "Model kaydı arşive alındı.",
    };
  }

  getDetail(
    mainCompanySlug?: string,
    mainCompanyId?: string,
    id?: string,
  ): ModelTakipDetail | null {
    const company = this.requireMainCompany(mainCompanySlug, mainCompanyId);
    const modelKaydi = this.getById(company.slug, company.id, id);
    if (!modelKaydi) return null;
    const docs = this.getDocuments(company.slug);
    const relatedUretimKayitlari = this.getUretimKayitlari(company.slug).filter(
      (item) => {
        if (this.cleanText(item?.modelKaydiId) === modelKaydi.id) return true;
        return (
          this.buildBindingKey(item?.modelAdi, item?.musteriIrsaliyeNo) ===
          this.buildBindingKey(
            modelKaydi.modelAdi,
            modelKaydi.musteriIrsaliyeNo,
          )
        );
      },
    );
    return {
      modelKaydi,
      gelenIrsaliye:
        docs.find(
          (doc) =>
            this.documentFlowType(doc) === "GELEN_IRSALIYE" &&
            this.matchDocumentToModel(doc, modelKaydi),
        ) || null,
      gidenIrsaliyeler: docs.filter(
        (doc) =>
          this.documentFlowType(doc) === "GIDEN_IRSALIYE" &&
          this.matchDocumentToModel(doc, modelKaydi),
      ),
      gidenFaturalar: docs.filter(
        (doc) =>
          this.documentFlowType(doc) === "GIDEN_FATURA" &&
          this.matchDocumentToModel(doc, modelKaydi),
      ),
      uretimKayitlari: relatedUretimKayitlari,
      kaliteKayitlari: this.getKaliteKayitlari(company.slug).filter((item) => {
        if (this.cleanText(item?.modelKaydiId) === modelKaydi.id) return true;
        return (
          this.normalizeKey(item?.model) ===
          this.normalizeKey(modelKaydi.modelAdi)
        );
      }),
      lotHammaddeKayitlari: this.getLotHammaddeKayitlari(
        company.slug,
        modelKaydi,
      ),
      sonUretimHareketleri: relatedUretimKayitlari
        .slice()
        .sort((a, b) =>
          `${b?.tarih || ""}-${b?.id || ""}`.localeCompare(
            `${a?.tarih || ""}-${a?.id || ""}`,
          ),
        )
        .slice(0, 6),
      logs: Array.isArray(modelKaydi.history) ? modelKaydi.history : [],
    };
  }
}
