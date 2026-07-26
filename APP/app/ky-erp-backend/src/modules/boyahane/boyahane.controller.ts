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
import { BoyahaneWorkflowService } from "./boyahane-workflow.service";
import { CurrentUser } from "../../auth/current-user.decorator";

@Controller("boyahane")
export class BoyahaneController {
  constructor(
    private readonly service: BoyahaneService,
    private readonly db: SqlStoreService,
    private readonly liveDb: LiveDbService,
    private readonly workflow: BoyahaneWorkflowService,
  ) {}

  @Get("jobs")
  async getJobs(@Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.listJobs(query));
  }

  @Get("jobs/:id")
  async getJob(@Param("id") id: string, @Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.getJob(id, query));
  }

  @Patch("jobs/:id")
  async patchJob(@Param("id") id: string, @Body() body: any, @CurrentUser() user: any) {
    return apiSuccess(await this.workflow.updateJob(id, body, user));
  }

  @Post("jobs/:id/start")
  async startJob(@Param("id") id: string, @Body() body: any, @CurrentUser() user: any) {
    return apiSuccess(await this.workflow.startJob(id, body, user));
  }

  @Post("jobs/:id/complete")
  async completeJob(@Param("id") id: string, @Body() body: any, @CurrentUser() user: any) {
    return apiSuccess(await this.workflow.completeJob(id, body, user));
  }

  @Get("jobs/:id/colors")
  async getJobColors(@Param("id") id: string, @Query() query: Record<string, any>) {
    return apiSuccess((await this.workflow.getJob(id, query)).colors);
  }

  @Post("jobs/:id/colors")
  async addJobColor(@Param("id") id: string, @Body() body: any, @CurrentUser() user: any) {
    return apiSuccess(await this.workflow.addJobColor(id, body, user));
  }

  @Patch("job-colors/:id")
  async patchJobColor(@Param("id") id: string, @Body() body: any, @CurrentUser() user: any) {
    return apiSuccess(await this.workflow.updateJobColor(id, body, user));
  }

  @Delete("job-colors/:id")
  async removeJobColor(
    @Param("id") id: string,
    @Query() query: Record<string, any>,
    @CurrentUser() user: any,
  ) {
    return apiSuccess(await this.workflow.deleteJobColor(id, query, user));
  }

  @Get("registered-colors")
  async getRegisteredColors(@Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.listColors(query));
  }

  @Get("registered-colors/:id")
  async getRegisteredColor(@Param("id") id: string, @Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.getColor(id, query));
  }

  @Post("registered-colors")
  async addRegisteredColor(@Body() body: any, @CurrentUser() user: any) {
    return apiSuccess(await this.workflow.createColor(body, user));
  }

  @Get("registered-colors/:id/recipes")
  async getRegisteredColorRecipes(@Param("id") id: string, @Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.listRecipes(id, query));
  }

  @Post("registered-colors/:id/recipes/compare")
  async compareRecipe(@Param("id") id: string, @Body() body: any) {
    return apiSuccess(await this.workflow.compareRecipe(id, body));
  }

  @Post("registered-colors/:id/recipes/new-version")
  async createRecipeVersion(@Param("id") id: string, @Body() body: any, @CurrentUser() user: any) {
    return apiSuccess(await this.workflow.createRecipeVersion(id, body, user));
  }

  @Patch("workflow/recipes/:id")
  async patchWorkflowRecipe(@Param("id") id: string, @Body() body: any, @CurrentUser() user: any) {
    return apiSuccess(await this.workflow.updateRecipe(id, body, user));
  }

  @Get("products")
  async getProducts(@Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.listProducts(query));
  }

  @Get("workflow/lots")
  async getWorkflowLots(@Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.listLots(query));
  }

  @Post("workflow/lots")
  async addWorkflowLot(@Body() body: any, @CurrentUser() user: any) {
    return apiSuccess(await this.workflow.createLot(body, user));
  }

  @Post("workflow/lots/:id/action")
  async workflowLotAction(@Param("id") id: string, @Body() body: any, @CurrentUser() user: any) {
    return apiSuccess(await this.workflow.updateLotAction(id, body, user));
  }

  @Post("productions")
  async addProduction(@Body() body: any, @CurrentUser() user: any) {
    return apiSuccess(await this.workflow.createProduction(body, user));
  }

  @Get("productions")
  async getProductions(@Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.listProductions(query));
  }

  @Get("productions/:id")
  async getProduction(@Param("id") id: string, @Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.getProduction(id, query));
  }

  @Get("workflow/logs")
  async getWorkflowLogs(@Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.listLogs(query));
  }

  @Get("workflow/reports")
  async getWorkflowReports(@Query() query: Record<string, any>) {
    return apiSuccess(await this.workflow.reports(query));
  }

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

