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
import { GunlukOperasyonService } from "./gunluk-operasyon.service";

@Controller("gunluk-operasyon")
export class GunlukOperasyonController {
  constructor(private readonly service: GunlukOperasyonService) {}

  @Get("employees") employees(@Query() query: Record<string, any>) {
    return this.service.dailyEmployees(query);
  }
  @Get("employees/excel")
  async employeesExcel(
    @Query() query: Record<string, any>,
    @Res() response: Response,
  ) {
    const buffer = await this.service.dailyEmployeesExcel(query);
    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="KYERP_Gunluk_Personel_Kartlari.xlsx"`,
    );
    response.send(Buffer.from(buffer));
  }

  @Post("employees/excel-upload")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  importEmployeesExcel(
    @UploadedFile() file: any,
    @Body() body: Record<string, any>,
  ) {
    return this.service.importDailyEmployeesExcel(file, body);
  }
  @Post("employees") createEmployee(@Body() body: Record<string, any>) {
    return this.service.createDailyEmployee(body);
  }

  @Patch("employees/:id") updateEmployee(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.updateDailyEmployee(id, body);
  }

  @Delete("employees/:id") deleteEmployee(@Param("id") id: string) {
    return this.service.deleteDailyEmployee(id);
  }

  @Get("attendance") attendance(@Query() query: Record<string, any>) {
    return this.service.dailyAttendance(query);
  }

  @Post("attendance/save-range") saveRange(@Body() body: Record<string, any>) {
    return this.service.saveDailyRange(body);
  }

  @Get("attendance/weekly-summary") weeklySummary(@Query() query: Record<string, any>) {
    return this.service.weeklySummary(query);
  }
  @Get("attendance/payment-slips") paymentSlips(@Query() query: Record<string, any>) {
    return this.service.paymentSlips(query);
  }

  @Post("attendance/mark-paid") markPaid(@Body() body: Record<string, any>) {
    return this.service.markDailyPaid(body);
  }

  @Get("summary") summary(@Query() query: Record<string, any>) {
    return this.service.focusedDailySummary(query);
  }

  @Get("people") people(@Query() query: Record<string, any>) {
    return this.service.focusedDailyPeople(query);
  }

  @Get("records") records(@Query() query: Record<string, any>) {
    return this.service.focusedDailyRecords(query);
  }

  @Get("roster") roster(@Query() query: Record<string, any>) {
    return this.service.focusedDailyRoster(query);
  }

  @Post("roster") saveRoster(@Body() body: Record<string, any>) {
    return this.service.saveFocusedDailyRoster(body);
  }
  @Post("records") saveRecords(@Body() body: Record<string, any>) {
    return this.service.saveFocusedDailyRecords(body);
  }

  @Patch("records/:id") patchRecord(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.patchFocusedDailyRecord(id, body);
  }

  @Delete("records/:id") deleteRecord(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.deleteFocusedDailyRecord(id, body);
  }

  @Get("skills") skills(@Query() query: Record<string, any>) {
    return this.service.skills(query);
  }

  @Get("weekly-print") weeklyPrint(@Query() query: Record<string, any>) {
    return this.service.focusedDailySummary(query);
  }
  @Get("excel")
  async excel(
    @Query() query: Record<string, any>,
    @Res() response: Response,
  ) {
    const start = String(query.startDate || query.start || "").replace(/-/g, "");
    const end = String(query.endDate || query.end || start).replace(/-/g, "");
    const buffer = await this.service.focusedDailyExcelTemplate(query);
    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="KYERP_Gunluk_Personel_${start}_${end}.xlsx"`,
    );
    response.send(Buffer.from(buffer));
  }

  @Post("excel-upload")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  previewExcel(@UploadedFile() file: any, @Body() body: Record<string, any>) {
    return this.service.previewFocusedDailyExcel(file, body);
  }
  @Post("excel-apply") applyExcel(@Body() body: Record<string, any>) {
    return this.service.applyFocusedDailyExcel(body);
  }
}
