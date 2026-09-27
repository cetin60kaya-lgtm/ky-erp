import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { memoryStorage } from "multer";
import { IkService } from "./ik.service";

@Controller("ik")
export class IkController {
  constructor(private readonly service: IkService) {}

  @Get("personel") legacyPersonel(@Query() query: Record<string, any>) {
    return this.service.monthlyEmployees(query);
  }
  @Post("personel") legacyCreatePersonel(@Body() body: Record<string, any>) {
    return this.service.createMonthlyEmployee(body);
  }
  @Patch("personel/:id") legacyUpdatePersonel(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.updateMonthlyEmployee(id, body);
  }
  @Delete("personel/:id") legacyDeletePersonel(@Param("id") id: string) {
    return this.service.deleteMonthlyEmployee(id);
  }

  @Post("bordro/hesapla") legacyBordroHesapla(
    @Body() body: Record<string, any>,
  ) {
    return this.service.calculatePayroll(body);
  }
  @Post("bordro/olustur") legacyBordroOlustur(
    @Body() body: Record<string, any>,
  ) {
    return this.service.savePayroll(body);
  }

  @Get("monthly-employees") monthlyEmployees(
    @Query() query: Record<string, any>,
  ) {
    return this.service.monthlyEmployees(query);
  }
  @Get("monthly-employees/:id") monthlyEmployee(@Param("id") id: string) {
    return this.service.monthlyEmployee(id);
  }
  @Post("monthly-employees") createMonthlyEmployee(
    @Body() body: Record<string, any>,
  ) {
    return this.service.createMonthlyEmployee(body);
  }
  @Patch("monthly-employees/:id") updateMonthlyEmployee(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.updateMonthlyEmployee(id, body);
  }
  @Post("monthly-employees/leave-balances")
  updateMonthlyLeaveBalances(@Body() body: Record<string, any>) {
    return this.service.updateMonthlyLeaveBalances(body);
  }
  @Delete("monthly-employees/:id") deleteMonthlyEmployee(
    @Param("id") id: string,
  ) {
    return this.service.deleteMonthlyEmployee(id);
  }

  @Get("monthly-employees/:id/salary-contracts") salaryContracts(
    @Param("id") id: string,
  ) {
    return this.service.salaryContracts(id);
  }
  @Post("monthly-employees/:id/salary-contracts") createSalaryContract(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.createSalaryContract(id, body);
  }

  @Get("leaves") leaves(@Query() query: Record<string, any>) {
    return this.service.leaves(query);
  }
  @Post("leaves") createLeave(@Body() body: Record<string, any>) {
    return this.service.createLeave(body);
  }
  @Patch("leaves/:id") updateLeave(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.updateLeave(id, body);
  }
  @Delete("leaves/:id") deleteLeave(@Param("id") id: string) {
    return this.service.deleteLeave(id);
  }

  @Get("monthly-adjustments") adjustments(@Query() query: Record<string, any>) {
    return this.service.adjustments(query);
  }
  @Post("monthly-adjustments") createAdjustment(
    @Body() body: Record<string, any>,
  ) {
    return this.service.createAdjustment(body);
  }
  @Patch("monthly-adjustments/:id") updateAdjustment(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.updateAdjustment(id, body);
  }
  @Delete("monthly-adjustments/:id") deleteAdjustment(@Param("id") id: string) {
    return this.service.deleteAdjustment(id);
  }

  @Get("official-holidays") officialHolidays(@Query() query: Record<string, any>) {
    return this.service.officialHolidays(query);
  }
  @Post("official-holidays") createOfficialHoliday(
    @Body() body: Record<string, any>,
  ) {
    return this.service.createOfficialHoliday(body);
  }
  @Patch("official-holidays/:id") updateOfficialHoliday(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.updateOfficialHoliday(id, body);
  }

  @Get("payroll") payroll(@Query() query: Record<string, any>) {
    return this.service.payroll(query);
  }
  @Post("payroll/calculate") calculatePayroll(
    @Body() body: Record<string, any>,
  ) {
    return this.service.calculatePayroll(body);
  }
  @Post("payroll/save") savePayroll(@Body() body: Record<string, any>) {
    return this.service.savePayroll(body);
  }
  @Post("payroll/approve-payment") approvePayment(
    @Body() body: Record<string, any>,
  ) {
    return this.service.approvePayment(body);
  }
  @Get("payroll/slips") payrollSlips(@Query() query: Record<string, any>) {
    return this.service.payrollSlips(query);
  }
  @Get("payroll/control-sheet") payrollControlSheet(
    @Query() query: Record<string, any>,
  ) {
    return this.service.payrollControlSheet(query);
  }
  @Get("monthly-audit-logs") monthlyAuditLogs(
    @Query() query: Record<string, any>,
  ) {
    return this.service.monthlyAuditLogs(query);
  }
  @Get("monthly-backup/excel")
  async monthlyBackupExcel(
    @Query() query: Record<string, any>,
    @Res() response: Response,
  ) {
    const year = String(query.year || new Date().getFullYear());
    const month = String(query.month || new Date().getMonth() + 1).padStart(2, "0");
    const buffer = await this.service.monthlyBackupExcel(query);
    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="KYERP_IK_Aylik_Yedek_${year}_${month}.xlsx"`,
    );
    response.send(Buffer.from(buffer));
  }

  @Get("documents") documents(@Query() query: Record<string, any>) {
    return this.service.documents(query);
  }
  @Post("documents") createDocument(@Body() body: Record<string, any>) {
    return this.service.createDocument(body);
  }
  @Delete("documents/:id") deleteDocument(@Param("id") id: string) {
    return this.service.deleteDocument(id);
  }

  @Get("skills") skills(@Query() query: Record<string, any>) {
    return this.service.skills(query);
  }
  @Post("skills") createSkill(@Body() body: Record<string, any>) {
    return this.service.createSkill(body);
  }
  @Patch("skills/:id") updateSkill(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.updateSkill(id, body);
  }
  @Get("skills/duplicates") skillDuplicates(@Query() query: Record<string, any>) {
    return this.service.skillDuplicates(query);
  }
  @Post("skills/merge") mergeSkills(@Body() body: Record<string, any>) {
    return this.service.mergeSkills(body);
  }

}
