import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { SqlStoreService } from "../../kyerp-core/sql-store.service";
import { apiSuccess } from "../../common/api-helpers";
import { LiveDbService } from "../../database/live-db.service";
import { BoyahaneService } from "./boyahane.service";

@Controller("boyahane")
export class BoyahaneController {
  constructor(
    private readonly service: BoyahaneService,
    private readonly db: SqlStoreService,
    private readonly liveDb: LiveDbService,
  ) {}

  private resolveSlug(mainCompanySlug?: string, mainCompanyId?: string) {
    const requestedSlug = String(mainCompanySlug || "").trim();
    const requestedId = String(mainCompanyId || "").trim();
    const resolved = this.db.resolveMainCompany(requestedId, requestedSlug);
    if (!resolved?.slug) {
      throw new BadRequestException(
        "Geçerli bir ana firma bulunamadı. mainCompanySlug veya mainCompanyId gönderin.",
      );
    }
    return resolved.slug;
  }

  @Get("bootstrap")
  getBootstrap(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.getBootstrap(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
    );
  }

  @Post("colors")
  createColor(@Body() body: any) {
    return this.service.createColor(body);
  }

  @Get("models")
  getModels(@Query() query: Record<string, any>) {
    return this.liveDb.list("dyehouseModel", query, ["modelName", "status"]);
  }

  @Patch("colors/:id")
  updateColor(@Param("id") id: string, @Body() body: any) {
    return this.service.updateColor(id, body);
  }

  @Delete("colors/:id")
  deleteColor(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.deleteColor(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
      id,
    );
  }

  @Post("recipes")
  createRecipe(@Body() body: any) {
    return this.service.createRecipe(body);
  }

  @Patch("recipes/:id")
  updateRecipe(@Param("id") id: string, @Body() body: any) {
    return this.service.updateRecipe(id, body);
  }

  @Delete("recipes/:id")
  deleteRecipe(
    @Param("id") id: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return this.service.deleteRecipe(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
      id,
    );
  }

  @Post("materials")
  createMaterial(@Body() body: any) {
    return this.service.createMaterial(body);
  }

  @Post("lots")
  createLot(@Body() body: any) {
    return this.service.createLot(body);
  }

  @Get("accounting-raw-material-lots")
  getAccountingRawMaterialLots(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("productId") productId?: string,
    @Query("lotNo") lotNo?: string,
  ) {
    return this.service.getAccountingRawMaterialLots(
      this.resolveSlug(mainCompanySlug, mainCompanyId),
      { productId, lotNo },
    );
  }

  @Get("raw-material-lots")
  getRawMaterialLots(
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
    @Query("productId") productId?: string,
    @Query("lotNo") lotNo?: string,
  ) {
    if (mainCompanySlug) {
      return this.liveDb.list("rawMaterialLot", { mainCompanySlug, q: lotNo || productId }, ["lotNo"]);
    }
    return apiSuccess(this.service.getAccountingRawMaterialLots(this.resolveSlug(mainCompanySlug, mainCompanyId), { productId, lotNo }));
  }

  @Get("raw-material-lots/by-product/:productId")
  getRawMaterialLotsByProduct(
    @Param("productId") productId: string,
    @Query("mainCompanySlug") mainCompanySlug?: string,
    @Query("mainCompanyId") mainCompanyId?: string,
  ) {
    return apiSuccess(
      this.service.getAccountingRawMaterialLots(
        this.resolveSlug(mainCompanySlug, mainCompanyId),
        { productId },
      ),
    );
  }

  @Post("lot-consumptions")
  createLotConsumption(@Body() body: any) {
    return apiSuccess(this.service.createLotConsumption(body));
  }

  @Patch("lots/:id")
  updateLot(@Param("id") id: string, @Body() body: any) {
    return this.service.updateLot(id, body);
  }

  @Post("lots/:id/movements")
  createMovement(@Param("id") lotId: string, @Body() body: any) {
    return this.service.createMovement(lotId, body);
  }

  @Post("runs")
  createRun(@Body() body: any) {
    return this.service.createRun(body);
  }
}

