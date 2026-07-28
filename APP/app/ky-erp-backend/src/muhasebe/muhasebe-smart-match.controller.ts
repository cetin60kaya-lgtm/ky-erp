import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { MuhasebeSmartMatchService } from "./muhasebe-smart-match.service";

@Controller(["muhasebe/smart-match", "api/muhasebe/smart-match"])
export class MuhasebeSmartMatchController {
  constructor(private readonly service: MuhasebeSmartMatchService) {}

  @Get("summary")
  summary(@Query() query: Record<string, any>) {
    return this.service.summary(query);
  }

  @Get("company-aliases")
  companyAliases(@Query() query: Record<string, any>) {
    return this.service.listCompanyAliases(query);
  }

  @Post("company-aliases")
  createCompanyAlias(@Body() body: Record<string, any>) {
    return this.service.createCompanyAlias(body);
  }

  @Delete("company-aliases/:id")
  passiveCompanyAlias(
    @Param("id") id: string,
    @Query() query: Record<string, any>,
  ) {
    return this.service.passiveCompanyAlias(id, query);
  }

  @Get("product-aliases")
  productAliases(@Query() query: Record<string, any>) {
    return this.service.listProductAliases(query);
  }

  @Post("product-aliases")
  createProductAlias(@Body() body: Record<string, any>) {
    return this.service.createProductAlias(body);
  }

  @Delete("product-aliases/:id")
  passiveProductAlias(
    @Param("id") id: string,
    @Query() query: Record<string, any>,
  ) {
    return this.service.passiveProductAlias(id, query);
  }

  @Get("pending-product-lines")
  pendingProductLines(@Query() query: Record<string, any>) {
    return this.service.pendingProductLines(query);
  }

  @Post("pending-product-lines/:lineId/assign")
  assignProductLine(
    @Param("lineId") lineId: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.assignProductLine(lineId, body);
  }

  @Patch("products/:productId/rule")
  setProductRule(
    @Param("productId") productId: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.setProductRule(productId, body);
  }

  @Post("supplier-routing/sync")
  synchronizeSupplierRouting(@Body() body: Record<string, any>) {
    return this.service.synchronizeSupplierRouting(body);
  }

  @Get("lot-stock")
  lotStock(@Query() query: Record<string, any>) {
    return this.service.lotStock(query);
  }
}
