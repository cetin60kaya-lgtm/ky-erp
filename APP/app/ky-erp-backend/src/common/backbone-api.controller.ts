import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { BackboneApiService } from "./backbone-api.service";

function ok(data: any) {
  return Promise.resolve(data).then((resolved) => ({ ok: true, data: resolved }));
}

@Controller()
export class BackboneApiController {
  constructor(private readonly api: BackboneApiService) {}

  @Get("muhasebe/firmalar") firms(@Query() q: any) { return ok(this.api.list("company", q, ["name", "normalizedName", "taxNo"])); }
  @Post("muhasebe/firmalar") createFirm(@Body() b: any) { return ok(this.api.create("company", b, "FIRM_CREATE")); }
  @Patch("muhasebe/firmalar/:id") patchFirm(@Param("id") id: string, @Body() b: any) { return ok(this.api.patch("company", id, b, "FIRM_UPDATE")); }
  @Get("muhasebe/firma-kisileri") firmPeople(@Query() q: any) { return ok(this.api.list("companyContact", q, ["fullName", "email", "department"])); }
  @Post("muhasebe/firma-kisileri") createFirmPeople(@Body() b: any) { return ok(this.api.create("companyContact", b, "CONTACT_CREATE")); }
  @Patch("muhasebe/firma-kisileri/:id") patchFirmPeople(@Param("id") id: string, @Body() b: any) { return ok(this.api.patch("companyContact", id, b, "CONTACT_UPDATE")); }
  @Get("muhasebe/model-havuzu") accountingModelPool(@Query() q: any) { return ok(this.api.list("modelOrder", q, ["orderNo", "sourceDispatchNo"])); }
  @Post("muhasebe/model-belge-paketi") modelDocumentPackage(@Body() b: any) { return ok(this.api.create("modelOrder", b, "MODEL_DOCUMENT_PACKAGE")); }

  @Get("desen/model-renkleri/:modelOrderId") designColors(@Param("modelOrderId") modelOrderId: string, @Query() q: any) {
    return ok(this.api.list("modelColor", { ...q, filter: { modelOrderId } }, ["colorName", "customerColorCode", "pantone"]));
  }
  @Post("desen/model-renkleri") createDesignColor(@Body() b: any) { return ok(this.api.create("modelColor", b, "MODEL_COLOR_CREATE")); }
  @Patch("desen/model-renkleri/:id") patchDesignColor(@Param("id") id: string, @Body() b: any) { return ok(this.api.patch("modelColor", id, b, "MODEL_COLOR_UPDATE")); }

  @Get("uretim/havuz") productionPool(@Query() q: any) { return ok(this.api.list("productionPlanLine", q, ["orderNo", "sourceDispatchNo", "printArea"])); }
  @Get("api/uretim/havuz") productionPoolAlias(@Query() q: any) { return ok(this.api.list("productionPlanLine", q, ["orderNo", "sourceDispatchNo", "printArea"])); }
  @Get("imalat/havuz") imalatPool(@Query() q: any) { return ok(this.api.list("productionPlanLine", q, ["orderNo", "sourceDispatchNo", "printArea"])); }
  @Get("api/imalat/havuz") imalatPoolAlias(@Query() q: any) { return ok(this.api.list("productionPlanLine", q, ["orderNo", "sourceDispatchNo", "printArea"])); }
  @Post("uretim/havuz/manual") manualProduction(@Body() b: any) { return ok(this.api.create("productionPlanLine", b, "PRODUCTION_MANUAL_TASK")); }
  @Post("imalat/manuel-is") manualImalat(@Body() b: any) { return ok(this.api.create("productionPlanLine", b, "PRODUCTION_MANUAL_TASK")); }
  @Post("api/imalat/manuel-is") manualImalatAlias(@Body() b: any) { return ok(this.api.create("productionPlanLine", b, "PRODUCTION_MANUAL_TASK")); }
  @Post("uretim/giris") createProductionEntry(@Body() b: any) { return ok(this.api.create("productionEntry", b, "PRODUCTION_ENTRY")); }
  @Post("imalat/havuz/:planLineId/giris") createImalatEntry(@Param("planLineId") planLineId: string, @Body() b: any) { return ok(this.api.create("productionEntry", { ...b, planLineId }, "PRODUCTION_ENTRY")); }
  @Get("imalat/havuz/:planLineId/girisler") imalatEntries(@Param("planLineId") planLineId: string, @Query() q: any) { return ok(this.api.list("productionEntry", { ...q, filter: { planLineId } }, ["shift", "note"])); }
  @Patch("uretim/giris/:id") patchProductionEntry(@Param("id") id: string, @Body() b: any) { return ok(this.api.patch("productionEntry", id, b, "PRODUCTION_ENTRY_UPDATE")); }
  @Get("uretim/makine-vardiya") machineShift(@Query() q: any) { return ok(this.api.list("machineShiftAssignment", q, ["shift"])); }
  @Get("imalat/makine-vardiya") imalatMachineShift(@Query() q: any) { return ok(this.api.list("machineShiftAssignment", q, ["shift"])); }
  @Post("imalat/makine-vardiya") saveImalatMachineShift(@Body() b: any) { return ok(this.api.create("machineShiftAssignment", b, "MACHINE_SHIFT_SAVE")); }
  @Post("uretim/makine") createMachine(@Body() b: any) { return ok(this.api.create("machine", b, "MACHINE_CREATE")); }
  @Patch("uretim/makine/:id") patchMachine(@Param("id") id: string, @Body() b: any) { return ok(this.api.patch("machine", id, b, "MACHINE_UPDATE")); }
  @Get("uretim/raporlar") productionReports(@Query() q: any) { return ok(this.api.summary(q)); }
  @Get("imalat/raporlar") imalatReports(@Query() q: any) { return ok(this.api.summary(q)); }
  @Get("api/imalat/raporlar") imalatReportsAlias(@Query() q: any) { return ok(this.api.summary(q)); }

  @Get("boyahane/ozet") dyeSummary(@Query() q: any) { return ok(this.api.summary(q)); }
  @Get("api/boyahane/ozet") dyeSummaryAlias(@Query() q: any) { return ok(this.api.summary(q)); }
  @Get("boyahane/model-havuzu") dyeModelPool(@Query() q: any) { return ok(this.api.list("modelOrder", q, ["orderNo", "sourceDispatchNo"])); }
  @Get("api/boyahane/model-havuzu") dyeModelPoolAlias(@Query() q: any) { return ok(this.api.list("modelOrder", q, ["orderNo", "sourceDispatchNo"])); }
  @Get("boyahane/model-havuzu/:modelId/renkler") dyeModelColors(@Param("modelId") modelId: string, @Query() q: any) {
    return ok(this.api.list("modelColor", { ...q, filter: { modelOrderId: modelId } }, ["colorName", "customerColorCode", "pantone"]));
  }
  @Get("boyahane/renk-recete/:modelColorId") dyeRecipe(@Param("modelColorId") modelColorId: string, @Query() q: any) {
    return ok(this.api.list("dyeRecipe", { ...q, filter: { modelColorId } }, ["colorName", "customerColorCode", "pantone"]));
  }
  @Post("boyahane/renk-recete") createDyeRecipe(@Body() b: any) { return ok(this.api.create("dyeRecipe", b, "DYE_RECIPE_CREATE")); }
  @Patch("boyahane/renk-recete/:id") patchDyeRecipe(@Param("id") id: string, @Body() b: any) { return ok(this.api.patch("dyeRecipe", id, b, "DYE_RECIPE_UPDATE")); }
  @Post("boyahane/tanimsiz-renk/kayitli-renge-cevir") convertColor(@Body() b: any) { return ok(this.api.create("registeredColor", b, "UNDEFINED_COLOR_CONVERT")); }
  @Post("boyahane/model-boya-gideri") modelDyeExpense(@Body() b: any) { return ok(this.api.create("modelDyeExpense", b, "MODEL_DYE_EXPENSE")); }
  @Get("boyahane/kayitli-renkler") registeredColors(@Query() q: any) { return ok(this.api.list("registeredColor", q, ["colorName", "customerColorCode", "pantone"])); }
  @Get("api/boyahane/kayitli-renkler") registeredColorsAlias(@Query() q: any) { return ok(this.api.list("registeredColor", q, ["colorName", "customerColorCode", "pantone"])); }
  @Get("boyahane/hammadde-lot") chemicalLots(@Query() q: any) { return ok(this.api.list("chemicalLot", q, ["productName", "lotNo", "supplierName"])); }
  @Get("api/boyahane/hammadde-lot") chemicalLotsAlias(@Query() q: any) { return ok(this.api.list("chemicalLot", q, ["productName", "lotNo", "supplierName"])); }
  @Post("boyahane/hammadde-lot") createChemicalLot(@Body() b: any) { return ok(this.api.create("chemicalLot", b, "CHEMICAL_LOT_CREATE")); }
  @Patch("boyahane/hammadde-lot/:id") patchChemicalLot(@Param("id") id: string, @Body() b: any) { return ok(this.api.patch("chemicalLot", id, b, "CHEMICAL_LOT_UPDATE")); }
  @Post("boyahane/hammadde-lot/:id/varsayilan-yap") makeDefaultLot(@Param("id") id: string, @Body() b: any) { return ok(this.api.patch("chemicalLot", id, { ...b, isDefault: true }, "CHEMICAL_LOT_DEFAULT")); }
  @Post("boyahane/hammadde-lot/:id/pasife-al") passiveLot(@Param("id") id: string, @Body() b: any) { return ok(this.api.softDelete("chemicalLot", id, b)); }
  @Get("boyahane/onayli-envanter") approvedInventory(@Query() q: any) { return ok(this.api.list("approvedChemicalInventory", q, ["productName", "shortName", "productCode"])); }
  @Post("boyahane/onayli-envanter") createApprovedInventory(@Body() b: any) { return ok(this.api.create("approvedChemicalInventory", b, "APPROVED_INVENTORY_CREATE")); }
  @Patch("boyahane/onayli-envanter/:id") patchApprovedInventory(@Param("id") id: string, @Body() b: any) { return ok(this.api.patch("approvedChemicalInventory", id, b, "APPROVED_INVENTORY_UPDATE")); }
  @Get("boyahane/evraklar") chemicalDocuments(@Query() q: any) { return ok(this.api.list("chemicalDocument", q, ["productName", "documentType", "documentNo"])); }
  @Post("boyahane/evraklar") createChemicalDocument(@Body() b: any) { return ok(this.api.create("chemicalDocument", b, "CHEMICAL_DOCUMENT_CREATE")); }
  @Patch("boyahane/evraklar/:id") patchChemicalDocument(@Param("id") id: string, @Body() b: any) { return ok(this.api.patch("chemicalDocument", id, b, "CHEMICAL_DOCUMENT_UPDATE")); }
  @Get("boyahane/raporlar") dyeReports(@Query() q: any) { return ok(this.api.summary(q)); }

  @Get("ik/personel") employees(@Query() q: any) { return ok(this.api.list("employee", q, ["fullName", "department", "role"])); }
  @Post("ik/personel") createEmployee(@Body() b: any) { return ok(this.api.create("employee", b, "EMPLOYEE_CREATE")); }
  @Patch("ik/personel/:id") patchEmployee(@Param("id") id: string, @Body() b: any) { return ok(this.api.patch("employee", id, b, "EMPLOYEE_UPDATE")); }
  @Get("ik/gunluk/giris") dailyAttendance(@Query() q: any) { return ok(this.api.list("dailyAttendance", q, ["shift", "note"])); }
  @Post("ik/gunluk/giris") createDailyAttendance(@Body() b: any) { return ok(this.api.create("dailyAttendance", b, "DAILY_ATTENDANCE_SAVE")); }
  @Get("ik/gunluk/odeme") dailyPayment(@Query() q: any) { return ok(this.api.summary(q)); }
  @Post("ik/gunluk/odeme-hesapla") calculateDailyPayment(@Body() b: any) { return ok(this.api.summary(b)); }
  @Get("ik/aylik/personel") monthlyEmployees(@Query() q: any) { return ok(this.api.list("monthlyEmployee", q, ["fullName", "department", "title"])); }
  @Post("ik/aylik/mesai") monthlyOvertime(@Body() b: any) { return ok(this.api.create("monthlyAttendance", b, "MONTHLY_OVERTIME")); }
  @Post("ik/aylik/izin") monthlyLeave(@Body() b: any) { return ok(this.api.create("leaveRecord", b, "MONTHLY_LEAVE")); }
  @Post("ik/aylik/devamsizlik") monthlyAbsence(@Body() b: any) { return ok(this.api.create("monthlyAttendance", b, "MONTHLY_ABSENCE")); }
  @Post("ik/bordro/hesapla") calculatePayroll(@Body() b: any) { return ok(this.api.summary(b)); }
  @Post("ik/bordro/olustur") createPayroll(@Body() b: any) { return ok(this.api.create("payroll", b, "PAYROLL_CREATE")); }
  @Get("ik/raporlar") hrReports(@Query() q: any) { return ok(this.api.summary(q)); }

  @Get("admin/settings") settings(@Query() q: any) { return ok(this.api.list("setting", q, ["key", "scope"])); }
  @Post("admin/settings") createSetting(@Body() b: any) { return ok(this.api.create("setting", b, "SETTING_CREATE")); }
  @Get("admin/logs") logs(@Query() q: any) { return ok(this.api.list("activityLog", q, ["module", "action", "entityType"])); }
  @Post("admin/backup") backup(@Body() b: any) { return ok({ status: "QUEUED", requestedAt: new Date().toISOString(), ...b }); }
}
