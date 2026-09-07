import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { IkAdvancedService } from "./ik-advanced.service";

@Controller(["ik/advanced", "api/ik/advanced"])
export class IkAdvancedController {
  constructor(private readonly service: IkAdvancedService) {}
  @Get("month") month(@Query() query: Record<string, any>) { return this.service.month(query); }
  @Get("quick-list") quickList(@Query() query: Record<string, any>) { return this.service.quickList(query); }
  @Get("person-calendar/:employeeId") personCalendar(@Param("employeeId") employeeId: string, @Query() query: Record<string, any>) { return this.service.personCalendar(employeeId, query); }
  @Get("exception-history") exceptionHistory(@Query() query: Record<string, any>) { return this.service.exceptionHistory(query); }
  @Get("control-matrix") controlMatrix(@Query() query: Record<string, any>) { return this.service.controlMatrix(query); }
  @Get("audit-logs") auditLogs(@Query() query: Record<string, any>) { return this.service.auditLogs(query); }
  @Get("payroll") payroll(@Query() query: Record<string, any>) { return this.service.payrollCalculation(query); }
  @Get("period-state") periodState(@Query() query: Record<string, any>) { return this.service.periodState(query); }
  @Post("period-prepare") periodPrepare(@Body() body: Record<string, any>) { return this.service.preparePeriod(body); }
  @Get("leave-center") leaveCenter(@Query() query: Record<string, any>) { return this.service.leaveCenter(query); }
  @Post("person-card/:employeeId") personCard(@Param("employeeId") employeeId: string, @Body() body: Record<string, any>) { return this.service.savePersonCard(employeeId, body); }
  @Post("attendance") attendance(@Body() body: Record<string, any>) { return this.service.saveAttendance(body); }
  @Post("exception") exception(@Body() body: Record<string, any>) { return this.service.saveException(body); }
  @Post("leave") leave(@Body() body: Record<string, any>) { return this.service.saveLeaveRecord(body); }
  @Post("leave/preview") leavePreview(@Body() body: Record<string, any>) { return this.service.previewLeave(body); }
  @Post("leave/policy") leavePolicy(@Body() body: Record<string, any>) { return this.service.saveLeavePolicy(body); }
  @Post("leave/cancel") leaveCancel(@Body() body: Record<string, any>) { return this.service.cancelLeavePlan(body); }
  @Post("exception/delete") deleteException(@Body() body: Record<string, any>) { return this.service.deleteException(body); }
  @Post("bulk-preview") bulkPreview(@Body() body: Record<string, any>) { return this.service.bulkPreview(body); }
  @Post("bulk-confirm") bulkConfirm(@Body() body: Record<string, any>) { return this.service.bulkConfirm(body); }
  @Post("finance-movement") financeMovement(@Body() body: Record<string, any>) { return this.service.saveFinanceMovement(body); }
  @Post("finance-movement/update") updateFinanceMovement(@Body() body: Record<string, any>) { return this.service.updateFinanceMovement(body); }
  @Post("finance-movement/delete") deleteFinanceMovement(@Body() body: Record<string, any>) { return this.service.deleteFinanceMovement(body); }
  @Post("payroll/override") payrollOverride(@Body() body: Record<string, any>) { return this.service.savePayrollOverride(body); }
  @Post("payroll/save") payrollSave(@Body() body: Record<string, any>) { return this.service.savePayrollLines(body); }
  @Post("settlement-draft") settlementDraft(@Body() body: Record<string, any>) { return this.service.settlementDraft(body); }
  @Post("documents/upload") @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() })) documentUpload(@UploadedFile() file: any, @Body() body: Record<string, any>) { return this.service.uploadDocument(file, body); }
  @Post("sgk/preview") @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() })) sgkPreview(@UploadedFile() file: any, @Body() body: Record<string, any>) { return this.service.previewSgk(file, body); }
  @Post("sgk/confirm") sgkConfirm(@Body() body: Record<string, any>) { return this.service.confirmSgk(body); }
  @Post("sgk/import") @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() })) sgkImport(@UploadedFile() file: any, @Body() body: Record<string, any>) { return this.service.importSgk(file, body); }
  @Post("card/preview") @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() })) cardPreview(@UploadedFile() file: any, @Body() body: Record<string, any>) { return this.service.previewCard(file, body); }
  @Post("card/confirm") cardConfirm(@Body() body: Record<string, any>) { return this.service.confirmCard(body); }
  @Post("card/import") @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() })) cardImport(@UploadedFile() file: any, @Body() body: Record<string, any>) { return this.service.importCard(file, body); }
  @Post("close-check") closeCheck(@Body() body: Record<string, any>) { return this.service.closeCheck(body); }
}
