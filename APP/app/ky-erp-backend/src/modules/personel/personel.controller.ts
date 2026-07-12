import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Patch,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { LiveDbService } from "../../database/live-db.service";
import { HrService } from "./hr.service";
import { PersonelService } from "./personel.service";

@Controller("personel")
export class PersonelController {
  constructor(
    private readonly service: PersonelService,
    private readonly liveDb: LiveDbService,
    private readonly hrService: HrService,
  ) {}

  @Get("cards")
  getCardsDb(@Query() query: any) {
    return this.liveDb.list("personnel", query, ["fullName", "phone"]);
  }

  @Get("daily/entries")
  getDailyEntriesDb(@Query() query: any) {
    return this.liveDb.list("dailyWageEntry", query, ["shift", "note"]);
  }

  @Get("weekly-summary")
  getWeeklySummaryDb(@Query() query: any) {
    return this.liveDb.list("weeklyPaymentSlip", query, ["week"]);
  }

  @Get("monthly")
  getMonthly(@Query() query: any) {
    return this.hrService.list("personel", query);
  }

  @Post("monthly")
  createMonthly(@Body() body: any) {
    return this.hrService.createMonthly(body);
  }

  @Patch("monthly/:id")
  updateMonthly(@Param("id") id: string, @Body() body: any) {
    return this.hrService.updateMonthly(id, body);
  }

  @Patch("monthly/:id/status")
  updateMonthlyStatus(@Param("id") id: string, @Body() body: any) {
    return this.hrService.updateMonthlyStatus(id, body);
  }

  @Delete("monthly/:id")
  deleteMonthly(@Param("id") id: string) {
    return this.hrService.removeMonthly(id);
  }

  @Post("monthly/import")
  async importMonthly(@Body() body: any) {
    return { ok: true, data: await this.hrService.importMonthly(body ?? {}) };
  }

  @Get("kartlar")
  getKartlar(@Query() query: any) {
    return this.service.getPersoneller(query);
  }

  @Post("kartlar")
  saveKart(@Body() body: any) {
    return this.service.createPersonel(body);
  }

  @Patch("kartlar/:id")
  updateKart(@Param("id") id: string, @Body() body: any) {
    return this.service.updatePersonel(Number(id), body);
  }

  @Delete("kartlar/:id")
  deleteKart(@Param("id") id: string) {
    return this.service.deletePersonel(Number(id));
  }

  @Get("gunluk")
  getGunluk(@Query() query: any) {
    return this.service.getGunlukKayitlar(query);
  }

  @Post("gunluk")
  saveGunluk(@Body() body: any) {
    return this.service.saveGunluk(body);
  }

  @Post("gunluk/havuz-kaydet")
  saveGunlukHavuz(@Body() body: any) {
    return this.service.saveGunlukHavuz(body);
  }

  @Post("import-dataset")
  importDataset(@Body() body: any) {
    return this.service.importDailyPersonelDataset(
      body,
      body?.replaceActiveList !== false,
    );
  }

  @Post("import-daily-table")
  async importDailyTable(@Body() body: any) {
    return {
      ok: true,
      data: await this.service.importDailyPersonelDataset(body, false),
    };
  }

  @Get("haftalik-ozet")
  getHaftalik(@Query() query: any) {
    return this.service.getWeeklySummary(query.startDate, query.endDate, query);
  }

  @Post("receipt-rows")
  getReceiptRows(@Body() body: any) {
    return this.service.getReceiptRows(
      body?.personIds,
      body?.startDate,
      body?.endDate,
      body?.filters || {},
    );
  }

  @Get("odemeler")
  getOdemeler(@Query() query: any) {
    return this.service.getOdemeler(query);
  }

  @Post("odemeler")
  saveOdeme(@Body() body: any) {
    return this.service.saveOdeme(body);
  }

  @Post("odemeler/toplu")
  saveTopluOdeme(@Body() body: any) {
    return this.service.saveTopluOdemeler(body);
  }

  @Get("logs")
  getLogs(@Query() query: any) {
    return this.service.getLogs(query);
  }

  @Post("logs")
  saveLog(@Body() body: any) {
    return this.service.saveLog(body);
  }

  @Get("excel/:type")
  @Header("Content-Type", "application/vnd.ms-excel")
  excel(@Param("type") type: string, @Res() res: Response) {
    const buffer = this.service.excel(type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="personel-${type}.xls"`,
    );
    res.send(buffer);
  }

  @Get("daily/cards")
  async getDailyCards(@Query() query: any) {
    return { ok: true, data: await this.service.getPersoneller(query) };
  }

  @Post("daily/cards")
  async createDailyCard(@Body() body: any) {
    return { ok: true, data: await this.service.createPersonel(body) };
  }

  @Patch("daily/cards/:id")
  async updateDailyCard(@Param("id") id: string, @Body() body: any) {
    return { ok: true, data: await this.service.updatePersonel(id, body) };
  }

  @Delete("daily/cards/:id")
  async deleteDailyCard(@Param("id") id: string) {
    return { ok: true, data: await this.service.deletePersonel(id) };
  }

  @Post("daily/cards/bulk-import")
  async bulkImportDailyCards(@Body() body: any) {
    return {
      ok: true,
      data: await this.service.importDailyPersonelDataset(
        body,
        body?.replaceActiveList !== false,
      ),
    };
  }

  @Get("daily/entry")
  async getDailyEntry(@Query() query: any) {
    const date = query?.date || query?.tarih;
    return {
      ok: true,
      data: {
        cards: await this.service.getPersoneller(query),
        entries: await this.service.getGunlukKayitlar({ ...query, date, tarih: date }),
      },
    };
  }

  @Post("daily/entry/save")
  async saveDailyEntry(@Body() body: any) {
    return { ok: true, data: await this.service.saveGunlukHavuz(body) };
  }

  @Post("daily/entry/clear-day")
  async clearDailyEntry(@Body() body: any) {
    return { ok: true, data: await this.service.clearGunlukDay(body?.date || body?.tarih) };
  }

  @Get("daily/weekly-summary")
  async getDailyWeeklySummary(@Query() query: any) {
    return {
      ok: true,
      data: await this.service.getWeeklySummary(query.start || query.startDate, query.end || query.endDate, query),
    };
  }

  @Post("daily/weekly-summary/create-slip")
  async createDailyWeeklySlip(@Body() body: any) {
    return { ok: true, data: await this.service.createDailyWeeklySlip(body) };
  }

  @Post("daily/weekly-summary/mark-paid")
  async markDailyWeeklyPaid(@Body() body: any) {
    return { ok: true, data: await this.service.createDailyWeeklySlip({ ...body, markPaid: true }) };
  }

  @Get("daily/weekly-summary/pdf")
  getDailyWeeklyPdf(@Query() query: any) {
    return { ok: true, data: { ready: false, query } };
  }

  @Get("daily/payments/history")
  async getDailyPaymentHistory(@Query() query: any) {
    return { ok: true, data: await this.service.getDailyPaymentHistory(query) };
  }

  @Get("daily/payments/history/export")
  exportDailyPaymentHistory(@Query() query: any) {
    return { ok: true, data: { ready: false, rows: this.service.getDailyPaymentHistory(query) } };
  }

  @Get("daily/payments/history/:id")
  async getDailyPaymentHistoryDetail(@Param("id") id: string) {
    return { ok: true, data: await this.service.getDailyPaymentHistoryDetail(id) };
  }
}
