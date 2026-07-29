import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, value) {
  fs.writeFileSync(path, value.replace(/\r?\n/g, "\n"), "utf8");
}

function exact(path, search, replacement, label) {
  const source = read(path);
  if (!source.includes(search)) throw new Error(`Yama noktası bulunamadı: ${label}`);
  write(path, source.replace(search, replacement));
  console.log(`OK ${label}`);
}

function regex(path, pattern, replacement, label) {
  const source = read(path);
  if (!pattern.test(source)) throw new Error(`Yama deseni bulunamadı: ${label}`);
  pattern.lastIndex = 0;
  write(path, source.replace(pattern, replacement));
  console.log(`OK ${label}`);
}

const backend = "APP/app/ky-erp-backend";
const frontend = "APP/app/ky-erp-frontend";

const desen = `${backend}/src/modules/desen/desen-workflow.service.ts`;
exact(
  desen,
  'import { PrismaService } from "../../prisma/prisma.service";',
  'import { PrismaService } from "../../prisma/prisma.service";\nimport { ModelService } from "../models/model.service";',
  "Desen ModelService import",
);
exact(
  desen,
  "  constructor(private readonly prisma: PrismaService) {}",
  "  constructor(\n    private readonly prisma: PrismaService,\n    private readonly modelService: ModelService,\n  ) {}",
  "Desen constructor",
);
exact(
  desen,
  `  private workflowDb(client: any = this.prisma) {
    return client as any;
  }
`,
  `  private workflowDb(client: any = this.prisma) {
    return client as any;
  }

  private async ensureCanonicalModel(model: any, companyName = "") {
    const existing = await this.workflowDb().designModelLink.findFirst({
      where: { mainCompanySlug: model.mainCompanySlug, designRecordId: model.id },
    });
    if (existing?.modelId) return existing.modelId;
    const canonical = await this.modelService.create({
      mainCompanySlug: model.mainCompanySlug,
      modelName: model.modelName,
      modelCode: model.modelCode,
      companyId: model.companyId,
      firmaId: model.companyId,
      firmaAdi: companyName || (model.metadata as any)?.companyName || "",
      groundColor: model.groundColor,
      sourceModule: "DESEN",
      sourceType: model.sourceType || "DESEN_WORKFLOW",
      sourceExternalId: model.id,
      printRegions: [],
      canonicalModel: true,
    });
    await this.workflowDb().designModelLink.create({
      data: {
        mainCompanySlug: model.mainCompanySlug,
        designRecordId: model.id,
        modelId: canonical.id,
        raw: { source: "DESEN_WORKFLOW" },
      },
    });
    const metadata = model.metadata && typeof model.metadata === "object" ? model.metadata : {};
    await this.workflowDb().designWorkflowModel.update({
      where: { id: model.id },
      data: { metadata: { ...metadata, canonicalModelId: canonical.id } },
    });
    return canonical.id;
  }
`,
  "Desen kanonik model yardımcısı",
);
exact(
  desen,
  "    const [channels, groups, files, logs, companies] = await Promise.all([",
  "    const [channels, groups, files, logs, companies, canonicalLinks] = await Promise.all([",
  "Desen toplu link sorgusu değişkeni",
);
exact(
  desen,
  '      this.workflowDb().company.findMany({ where: { id: { in: models.map((row) => row.companyId).filter(Boolean) } }, select: { id: true, name: true } }),\n    ]);',
  '      this.workflowDb().company.findMany({ where: { id: { in: models.map((row) => row.companyId).filter(Boolean) } }, select: { id: true, name: true } }),\n      this.workflowDb().designModelLink.findMany({ where: { mainCompanySlug: models[0]?.mainCompanySlug, designRecordId: { in: modelIds } } }),\n    ]);',
  "Desen toplu link sorgusu",
);
exact(
  desen,
  "    return Promise.all(models.map(async (model) => {\n      const modelOperations = operations.filter((row: any) => row.modelId === model.id);",
  "    return Promise.all(models.map(async (model) => {\n      const canonicalModelId = canonicalLinks.find((row: any) => row.designRecordId === model.id)?.modelId || await this.ensureCanonicalModel(model, companyMap.get(model.companyId) || \"\");\n      const modelOperations = operations.filter((row: any) => row.modelId === model.id);",
  "Desen modeline kanonik ID ata",
);
exact(
  desen,
  "        ...model,\n        companyName: companyMap.get(model.companyId) || (model.metadata as any)?.companyName || \"-\",",
  "        ...model,\n        canonicalModelId,\n        modelRecordId: canonicalModelId,\n        companyName: companyMap.get(model.companyId) || (model.metadata as any)?.companyName || \"-\",",
  "Desen API kanonik alanları",
);
exact(
  desen,
  "      const workflowPayload = { modelId: model.id, companyId: model.companyId,",
  "      const workflowPayload = { modelId: model.canonicalModelId || model.id, designWorkflowModelId: model.id, companyId: model.companyId,",
  "Boyahane kanonik model ID",
);
exact(
  desen,
  "(row.raw as any)?.designWorkflow?.modelId === model.id && (row.raw as any)?.designWorkflow?.printAreaId === operation.id",
  "((row.raw as any)?.designWorkflow?.designWorkflowModelId || (row.raw as any)?.designWorkflow?.modelId) === model.id && (row.raw as any)?.designWorkflow?.printAreaId === operation.id",
  "Boyahane tekrar kontrolü",
);

const coordinator = `${backend}/src/muhasebe/isnet-dispatch-flow-coordinator.service.ts`;
exact(
  coordinator,
  'import { PrismaService } from "../prisma/prisma.service";',
  'import { PrismaService } from "../prisma/prisma.service";\nimport { CanonicalModelFlowService } from "../modules/models/canonical-model-flow.service";',
  "İşNet kanonik servis import",
);
exact(
  coordinator,
  "    private readonly businessSettings: IsnetBusinessSettingsService,\n  ) {}",
  "    private readonly businessSettings: IsnetBusinessSettingsService,\n    private readonly canonicalModels: CanonicalModelFlowService,\n  ) {}",
  "İşNet kanonik servis injection",
);
exact(
  coordinator,
  "          intake = assigned.intake;\n        } else {",
  "          intake = assigned.intake;\n          await this.canonicalModels.linkDispatch({ mainCompanySlug: slug, documentIntakeId: intake.id, modelId: clean(intake.modelId || assigned.model?.id) });\n        } else {",
  "İşNet otomatik model planı",
);
exact(
  coordinator,
  "      const preview: any = await this.operations.incomingDispatchDraft(sourceId, {",
  "      if (clean(intake.modelId)) {\n        await this.canonicalModels.linkDispatch({ mainCompanySlug: slug, documentIntakeId: intake.id, modelId: clean(intake.modelId) });\n      }\n      const preview: any = await this.operations.incomingDispatchDraft(sourceId, {",
  "İşNet mevcut model planı",
);
exact(
  coordinator,
  "    flow.status = \"OUTGOING_DRAFT_READY\";\n    flow.updatedAt = new Date().toISOString();\n    await this.writeRows(slug, rows);",
  "    flow.status = \"OUTGOING_DRAFT_READY\";\n    flow.updatedAt = new Date().toISOString();\n    await this.canonicalModels.linkDispatch({ mainCompanySlug: slug, documentIntakeId: flow.incomingIntakeId, modelId: flow.modelId });\n    await this.writeRows(slug, rows);",
  "İşNet kullanıcı model planı",
);

const uretim = `${backend}/src/modules/uretim/uretim.service.ts`;
exact(
  uretim,
  'import { ModelService } from "../models/model.service";',
  'import { CanonicalModelFlowService } from "../models/canonical-model-flow.service";\nimport { ModelService } from "../models/model.service";',
  "Üretim kanonik servis import",
);
exact(
  uretim,
  "    private readonly modelService: ModelService,\n    private readonly prisma: PrismaService,\n  ) {",
  "    private readonly modelService: ModelService,\n    private readonly prisma: PrismaService,\n    private readonly canonicalModels: CanonicalModelFlowService,\n  ) {",
  "Üretim kanonik servis injection",
);
regex(
  uretim,
  /  private async getSeriModelRows\(mainCompanySlug: string\) \{[\s\S]*?\n  \}\n\n  private async searchSeriModels/,
  `  private async getSeriModelRows(mainCompanySlug: string) {
    const result = await this.modelService.list({ mainCompanySlug, pageSize: 5000 });
    const rows = Array.isArray(result) ? result : result.rows || [];
    return rows.map((row: any) => {
      const raw = row?.raw && typeof row.raw === "object" ? row.raw : {};
      const modelName = this.cleanText(row.modelName || row.modelAdi || row.name);
      return {
        id: this.cleanText(row.id),
        modelId: this.cleanText(row.id),
        model: modelName,
        modelAdi: modelName,
        aciklama: this.cleanText(row.aciklama || raw.description || raw.aciklama),
        firma: this.cleanText(row.firmaAdi || row.musteriFirma || raw.firmaAdi || raw.firma || raw.companyName),
        siparisNo: this.cleanText(row.siparisNo || row.orderNo || raw.siparisNo),
        irsaliyeNo: this.cleanText(row.musteriIrsaliyeNo || row.sourceDispatchNo || raw.irsaliyeNo),
        irsaliyeAdedi: this.parseNumber(row.gelenAdet || row.incomingQty || row.dispatchQty || raw.gelenAdet),
        faturaKesilenAdet: this.parseNumber(row.toplamFatura || row.invoiceQty || row.invoicedQty),
        birimFiyat: this.parseNumber(row.birimFiyat || row.unitPrice || raw.unitPrice),
        gorsel: this.cleanText(row.desenImageThumb || row.imageUrl || row.thumbnail || row.desenGorseli),
        durum: this.cleanText(row.durum || row.status || "Aktif"),
        kaynak: "Desen Tek Merkez",
        raw,
        searchText: this.modelSearchText(row),
      };
    });
  }

  private async searchSeriModels`,
  "Üretim model sözlüğünü tek merkez yap",
);
exact(
  uretim,
  "    [...storageRows, ...mapped]",
  "    [...mapped]",
  "Üretim aramasında sentetik desen ID kaldır",
);
exact(
  uretim,
  "          totalQuantity: Math.round(nextRaw.netAdet || nextProduced),",
  "          totalQuantity: Math.round(nextProduced),",
  "Üretim güncellemede brüt adet sakla",
);
exact(
  uretim,
  "          totalQuantity: Math.round(newRow.netAdet || newRow.uretimAdedi || 0),",
  "          totalQuantity: Math.round(newRow.uretimAdedi || 0),",
  "Üretim oluşturmada brüt adet sakla",
);
exact(
  uretim,
  "          assistant: newRow.yardimciPersonel || null,\n          printDefect:",
  "          assistant: newRow.yardimciPersonel || null,\n          printArea: cleanPrintArea,\n          printDefect:",
  "Üretim baskı bölgesini kolonuna yaz",
);
exact(
  uretim,
  "           this.parseNumber(planLine.producedQty) + this.parseNumber(newRow.netAdet || newRow.uretimAdedi);",
  "           this.parseNumber(planLine.producedQty) + this.parseNumber(newRow.uretimAdedi);",
  "Üretim planında brüt adet kullan",
);
exact(
  uretim,
  "    const next = [newRow, ...rows];",
  "    if (cleanOrderNo) {\n      await this.canonicalModels.refreshPlanTotals({ mainCompanySlug: company.slug, modelId: modelKaydi.id, dispatchNo: cleanOrderNo });\n    }\n\n    const next = [newRow, ...rows];",
  "Üretim sonrası plan denklemini yenile",
);

const imalatApi = `${frontend}/src/services/imalatApi.js`;
regex(
  imalatApi,
  /export async function createManuelIs\(activeMainCompany, payload = \{\}\) \{[\s\S]*?\n\}\n\nexport async function addUretimGirisi/,
  `export async function createManuelIs(activeMainCompany, payload = {}) {
  const result = unwrap(
    await apiPost(
      "/model-flow/quick-create",
      withCompany(activeMainCompany, {
        modelName: payload?.model || payload?.modelAdi,
        firmaId: payload?.firmaId,
        firmaAdi: payload?.firma,
        companyName: payload?.firma,
        siparisNo: payload?.siparisNo,
        dispatchNo: payload?.irsaliyeNo || payload?.siparisNo,
        expectedQty: payload?.beklenenAdet,
        baskiBolgesi: payload?.baskiBolgesi,
        printRegions: payload?.baskiBolgesi,
        sourceModule: "IMALAT",
      }),
    ),
  );
  const model = result?.model || {};
  const plan = result?.planLines?.[0] || {};
  return {
    ...plan,
    id: plan.id || model.id,
    modelId: model.id,
    modelName: model.modelName || payload?.model,
    companyName: model.firmaAdi || payload?.firma,
    sourceDispatchNo: plan.sourceDispatchNo || payload?.siparisNo,
    orderNo: plan.orderNo || payload?.siparisNo,
    expectedQty: plan.expectedQty || payload?.beklenenAdet,
    printArea: plan.printArea || payload?.baskiBolgesi || "Ön",
    status: plan.status || "WAITING",
    raw: { kaynak: "Desen Tek Merkez", modelId: model.id },
  };
}

export async function addUretimGirisi`,
  "Manuel işi tek merkezde aç",
);
exact(
  imalatApi,
  "        hataliAdet: payload?.hataliAdet || 0,\n        not: payload?.not,",
  "        hataliAdet: payload?.hataliAdet || 0,\n        baskiHatasiAdet: payload?.baskiHatasiAdet || 0,\n        kumasHatasiAdet: payload?.kumasHatasiAdet || 0,\n        not: payload?.not,",
  "Üretim API sakat ayrımı",
);

const entryPage = `${frontend}/src/pages/imalat/UretimGirisHavuzu.jsx`;
exact(entryPage, 'import { fetchMuhasebeModels } from "../../services/muhasebeService";\n', "", "Üretim Muhasebe model importunu kaldır");
exact(entryPage, 'import { getDesenHavuz } from "../../services/desenApi";\n', "", "Üretim ayrı Desen havuz importunu kaldır");
regex(
  entryPage,
  /        const \[rows, machineRows, modelRows, desenRows\] = await Promise\.all\(\[[\s\S]*?        const normalized = sortJobsNewestFirst\(Array\.from\(byId\.values\(\)\)\);/,
  `        const [rows, machineRows] = await Promise.all([
          getImalatGirisHavuzu(activeMainCompany),
          getMakineVardiya(activeMainCompany),
        ]);
        if (cancelled) return;
        const normalized = sortJobsNewestFirst(
          (Array.isArray(rows) ? rows : []).map(normalizeJob),
        );`,
  "Üretim kuyruğunu tek kaynağa indir",
);
regex(
  entryPage,
  /\nfunction firstText\([\s\S]*?\nfunction Kpi/,
  "\nfunction Kpi",
  "Kullanılmayan çoklu model normalizasyonunu kaldır",
);

const isnetApi = `${frontend}/src/services/isnetAutoFlowApi.js`;
exact(
  isnetApi,
  "export const assignIsnetAutoFlowModel = (flowId, payload) =>\n  apiPost(`/isnet/auto-flows/${encodeURIComponent(flowId)}/model`, payload, {\n    timeoutMs: 300_000,\n  }).then(unwrap);",
  "export const assignIsnetAutoFlowModel = (flowId, payload) => {\n  const body = typeof payload === \"string\"\n    ? { candidateId: payload, modelId: payload, source: \"shared-model\" }\n    : payload;\n  return apiPost(`/isnet/auto-flows/${encodeURIComponent(flowId)}/model`, body, {\n    timeoutMs: 300_000,\n  }).then(unwrap);\n};",
  "İşNet model seçim payload düzelt",
);

const isnetPage = `${frontend}/src/pages/modules/isnet/IsnetWorkflowFinalPage.jsx`;
exact(
  isnetPage,
  "  Upload,\n  X,",
  "  Upload,\n  Plus,\n  X,",
  "İşNet hızlı model ikonu",
);
exact(
  isnetPage,
  'import { resolveIsnetBusinessContext } from "../../../services/isnetBusinessSettingsApi";',
  'import { resolveIsnetBusinessContext } from "../../../services/isnetBusinessSettingsApi";\nimport { quickCreateCanonicalModel } from "../../../services/modelFlowApi";',
  "İşNet hızlı model servisi",
);
exact(
  isnetPage,
  "          selectedModelId: \"\",\n        });",
  "          selectedModelId: \"\",\n          newModelName: prepared?.modelName || selectedDocument?.modelName || \"\",\n        });",
  "İşNet model kararına yeni model alanı",
);
exact(
  isnetPage,
  "  async function openFlowPreparation(flow) {",
  `  async function createModelAndContinue() {
    const modelNameValue = String(modelDecision?.newModelName || "").trim();
    if (!modelDecision?.flow?.id || !modelNameValue) return;
    setBusy("new-model");
    try {
      const created = await quickCreateCanonicalModel(activeMainCompany, {
        modelName: modelNameValue,
        companyId: modelDecision.flow.companyId,
        firmaId: modelDecision.flow.companyId,
        firmaAdi: modelDecision.flow.companyName,
        companyName: modelDecision.flow.companyName,
        sourceModule: "ISNET",
      });
      const modelId = created?.canonicalModelId || created?.model?.id;
      const assigned = await assignIsnetAutoFlowModel(modelDecision.flow.id, modelId);
      const refreshed = await refreshIsnetAutoFlow(modelDecision.flow.id);
      setModelDecision(null);
      setPreparationModal(portalModal(refreshed?.flow || assigned?.flow || assigned, refreshed?.preview));
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error?.message || "Yeni model açılamadı." });
    } finally {
      setBusy("");
    }
  }

  async function openFlowPreparation(flow) {`,
  "İşNet hızlı model oluşturma fonksiyonu",
);
regex(
  isnetPage,
  /      \{modelDecision \? \([\s\S]*?      \) : null\}\n\n      \{preparationModal/,
  `      {modelDecision ? (
        <div className="isnet-modal-backdrop"><div className="isnet-modal"><button type="button" className="isnet-modal-close" onClick={() => setModelDecision(null)}><X /></button><h2>Model Onayı</h2><p>Mevcut modeli seçin veya bu irsaliyedeki model adını tek merkezli Desen kaydı olarak açın.</p><select value={modelDecision.selectedModelId} onChange={(event) => setModelDecision({ ...modelDecision, selectedModelId: event.target.value })}><option value="">Model seçin</option>{modelDecision.suggestions.map((row) => <option key={row.id} value={row.id}>{modelName(row)}</option>)}</select><button type="button" className="isnet-btn isnet-btn--primary" onClick={assignModelAndContinue} disabled={!modelDecision.selectedModelId || busy === "model"}>Modeli Bağla ve Devam Et</button><div className="isnet-notice isnet-notice--info"><Plus size={15} /> Listede yoksa yeni model açın</div><input value={modelDecision.newModelName || ""} onChange={(event) => setModelDecision({ ...modelDecision, newModelName: event.target.value })} placeholder="Yeni model adı" /><button type="button" className="isnet-btn isnet-btn--secondary" onClick={createModelAndContinue} disabled={!String(modelDecision.newModelName || "").trim() || busy === "new-model"}><Plus size={15} /> Desen Merkezinde Model Aç ve Bağla</button></div></div>
      ) : null}

      {preparationModal`,
  "İşNet hızlı model modalı",
);

console.log("Üretim tek merkez entegrasyon yaması tamamlandı.");
