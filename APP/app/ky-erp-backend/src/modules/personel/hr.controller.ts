import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { HrService } from "./hr.service";

@Controller("personel/hr")
export class HrController {
  constructor(private readonly hrService: HrService) {}

  @Get("bootstrap")
  bootstrap() {
    return this.hrService.bootstrap();
  }

  @Post("bordro/calculate-all")
  calculateAllBordro(@Body() body: Record<string, any>) {
    return this.hrService.calculateAllBordro(body ?? {});
  }

  @Post("bordro-havuz/fill")
  fillBordroHavuz(@Body() body: Record<string, any>) {
    return this.hrService.fillBordroHavuz(body ?? {});
  }

  @Post("bordro-havuz/add")
  addToBordroHavuz(@Body() body: Record<string, any>) {
    return this.hrService.fillBordroHavuz(body ?? {});
  }

  @Delete("bordro-havuz/:id")
  removeFromBordroHavuz(@Param("id") id: string) {
    return this.hrService.removeFromBordroHavuz(id);
  }

  @Post("bordro-havuz/clear")
  clearBordroHavuz(@Body() body: Record<string, any>) {
    return this.hrService.clearBordroHavuz(body ?? {});
  }

  @Post("bordro/calculate-pool")
  calculatePoolBordro(@Body() body: Record<string, any>) {
    return this.hrService.calculatePoolBordro(body ?? {});
  }

  @Post("bordro/save-pool")
  savePoolBordro(@Body() body: Record<string, any>) {
    return this.hrService.savePoolBordro(body ?? {});
  }

  @Get("overview")
  overview(@Query() query: Record<string, any>) {
    return this.hrService.overview(query ?? {});
  }

  @Get("monthly")
  listMonthly(@Query() query: Record<string, any>) {
    return this.hrService.list("personel", query ?? {});
  }

  @Post("monthly")
  createMonthly(@Body() body: Record<string, any>) {
    return this.hrService.createMonthly(body ?? {});
  }

  @Post("monthly/import")
  async importMonthly(@Body() body: Record<string, any>) {
    return { ok: true, data: await this.hrService.importMonthly(body ?? {}) };
  }

  @Patch("monthly/:id")
  updateMonthly(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.hrService.updateMonthly(id, body ?? {});
  }

  @Patch("monthly/:id/status")
  updateMonthlyStatus(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.hrService.updateMonthlyStatus(id, body ?? {});
  }

  @Delete("monthly/:id")
  removeMonthly(@Param("id") id: string) {
    return this.hrService.removeMonthly(id);
  }

  @Get("overtime-leave")
  overtimeLeave(@Query() query: Record<string, any>) {
    return this.hrService.overtimeLeave(query ?? {});
  }

  @Post("overtime")
  createOvertime(@Body() body: Record<string, any>) {
    return this.hrService.createOvertime(body ?? {});
  }

  @Patch("overtime/:id")
  updateOvertime(
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.hrService.updateOvertime(id, body ?? {});
  }

  @Delete("overtime/:id")
  removeOvertime(@Param("id") id: string) {
    return this.hrService.removeOvertime(id);
  }

  @Post("leave")
  createLeave(@Body() body: Record<string, any>) {
    return this.hrService.createLeave(body ?? {});
  }

  @Patch("leave/:id")
  updateLeave(@Param("id") id: string, @Body() body: Record<string, any>) {
    return this.hrService.updateLeave(id, body ?? {});
  }

  @Delete("leave/:id")
  removeLeave(@Param("id") id: string) {
    return this.hrService.removeLeave(id);
  }

  @Get("leave-summary")
  leaveSummary(@Query() query: Record<string, any>) {
    return this.hrService.leaveSummary(query ?? {});
  }

  @Get("payroll/candidates")
  payrollCandidates(@Query() query: Record<string, any>) {
    return this.hrService.payrollCandidates(query ?? {});
  }

  @Get("payroll/pool")
  payrollPool(@Query() query: Record<string, any>) {
    return this.hrService.payrollPool(query ?? {});
  }

  @Post("payroll/pool/add")
  payrollPoolAdd(@Body() body: Record<string, any>) {
    return this.hrService.payrollPoolAdd(body ?? {});
  }

  @Post("payroll/calculate")
  payrollCalculate(@Body() body: Record<string, any>) {
    return this.hrService.payrollCalculate(body ?? {});
  }

  @Post("payroll/save")
  payrollSave(@Body() body: Record<string, any>) {
    return this.hrService.payrollSave(body ?? {});
  }

  @Get("payment-control")
  paymentControl(@Query() query: Record<string, any>) {
    return this.hrService.paymentControl(query ?? {});
  }

  @Post("payment-control/calculate")
  paymentControlCalculate(@Body() body: Record<string, any>) {
    return this.hrService.paymentControlCalculate(body ?? {});
  }

  @Post("payment-control/save")
  paymentControlSave(@Body() body: Record<string, any>) {
    return this.hrService.paymentControlSave(body ?? {});
  }

  @Post("payment-control/export-excel")
  paymentControlExportExcel(@Body() body: Record<string, any>) {
    return this.hrService.paymentControlExportExcel(body ?? {});
  }

  @Post("payment-control/create-slip")
  paymentControlCreateSlip(@Body() body: Record<string, any>) {
    return this.hrService.paymentControlCreateSlip(body ?? {});
  }

  @Get(":resource")
  list(@Param("resource") resource: string, @Query() query: Record<string, any>) {
    return this.hrService.list(resource, query ?? {});
  }

  @Post(":resource")
  create(
    @Param("resource") resource: string,
    @Body() body: Record<string, any>,
  ) {
    return this.hrService.create(resource, body ?? {});
  }

  @Put(":resource/:id")
  update(
    @Param("resource") resource: string,
    @Param("id") id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.hrService.update(resource, id, body ?? {});
  }

  @Delete(":resource/:id")
  remove(@Param("resource") resource: string, @Param("id") id: string) {
    return this.hrService.remove(resource, id);
  }
}
