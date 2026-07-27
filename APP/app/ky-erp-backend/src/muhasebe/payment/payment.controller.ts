import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { AccountingApiService } from "../accounting-api.service";

@Controller(["muhasebe/payments", "api/muhasebe/payments"])
export class PaymentController {
  constructor(private readonly service: AccountingApiService) {}

  @Get() list(@Query() query: Record<string, any>) { return this.service.listPayments(query); }
  @Post() create(@Body() body: Record<string, any>) { return this.service.createPayment(body); }
  @Patch(":id") update(@Param("id") id: string, @Body() body: Record<string, any>) { return this.service.updatePayment(id, body); }
  @Post(":id/upload-front-image") front(@Param("id") id: string, @Body() body: Record<string, any>) { return this.service.uploadPaymentImage(id, "front", body); }
  @Post(":id/upload-back-image") back(@Param("id") id: string, @Body() body: Record<string, any>) { return this.service.uploadPaymentImage(id, "back", body); }
}
