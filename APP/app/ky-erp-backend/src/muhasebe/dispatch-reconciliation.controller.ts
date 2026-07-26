import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { DispatchReconciliationService } from "./dispatch-reconciliation.service";
import { CurrentUser } from "../auth/current-user.decorator";

@Controller(["muhasebe", "api/muhasebe"])
export class DispatchReconciliationController {
  constructor(private readonly service: DispatchReconciliationService) {}

  private slug(query: any = {}, body: any = {}) {
    return String(body?.mainCompanySlug || query?.mainCompanySlug || "").trim();
  }

  @Get("customer-dispatches/summary")
  summary(@Query() query: any) {
    return this.service.summary(this.slug(query), query);
  }

  @Get("customer-dispatches")
  list(@Query() query: any) {
    return this.service.list(this.slug(query), query);
  }

  @Get("customer-dispatches/:id")
  detail(@Param("id") id: string, @Query() query: any) {
    return this.service.detail(this.slug(query), id);
  }

  @Patch("customer-dispatches/:id")
  updateDispatch(@Param("id") id: string, @Query() query: any, @Body() body: any) {
    return this.service.updateDispatch(this.slug(query, body), id, body);
  }

  @Patch("customer-dispatch-lines/:id")
  updateLine(@Param("id") id: string, @Query() query: any, @Body() body: any) {
    return this.service.updateDispatchLine(this.slug(query, body), id, body);
  }

  @Post("customer-dispatch-lines/:id/link-model")
  linkModel(@Param("id") id: string, @Query() query: any, @Body() body: any) {
    return this.service.linkModel(this.slug(query, body), id, body);
  }

  @Post("customer-dispatch-lines/:id/create-model")
  createAndLinkModel(@Param("id") id: string, @Query() query: any, @Body() body: any) {
    return this.service.createAndLinkModel(this.slug(query, body), id, body);
  }

  @Delete("customer-dispatch-lines/:id/link-model")
  unlinkModel(@Param("id") id: string, @Query() query: any) {
    return this.service.linkModel(this.slug(query), id, query, true);
  }

  @Post("customer-dispatch-lines/:id/production")
  addProduction(@Param("id") id: string, @Query() query: any, @Body() body: any) {
    return this.service.addProduction(this.slug(query, body), id, body);
  }

  @Post("customer-dispatch-lines/:id/non-billable")
  addNonBillable(@Param("id") id: string, @Query() query: any, @Body() body: any, @CurrentUser() user: any) {
    return this.service.createNonBillable(this.slug(query, body), id, body, user?.id || user?.sub || "user");
  }

  @Post("customer-dispatch-lines/:id/approve-partial")
  approvePartial(@Param("id") id: string, @Query() query: any, @Body() body: any, @CurrentUser() user: any) {
    return this.service.approvePartialDifference(this.slug(query, body), id, body, user?.id || user?.sub || "user");
  }

  @Post("customer-dispatch-lines/approve-partials")
  approvePartials(@Query() query: any, @Body() body: any, @CurrentUser() user: any) {
    return this.service.approvePartialDifferences(this.slug(query, body), body, user?.id || user?.sub || "user");
  }

  @Post("customer-dispatch-lines/:id/resolve-review")
  resolveReview(@Param("id") id: string, @Query() query: any, @Body() body: any, @CurrentUser() user: any) {
    return this.service.resolveReview(this.slug(query, body), id, body, user?.id || user?.sub || "user");
  }

  @Post("customer-dispatch-lines/resolve-reviews")
  resolveReviews(@Query() query: any, @Body() body: any, @CurrentUser() user: any) {
    return this.service.resolveReviews(this.slug(query, body), body, user?.id || user?.sub || "user");
  }

  @Patch("customer-dispatch-lines/:id/non-billable/:allocationId")
  updateNonBillable(@Param("id") id: string, @Param("allocationId") allocationId: string, @Query() query: any, @Body() body: any, @CurrentUser() user: any) {
    return this.service.updateNonBillable(this.slug(query, body), id, allocationId, body, user?.id || user?.sub || "user");
  }

  @Delete("customer-dispatch-lines/:id/non-billable/:allocationId")
  removeNonBillable(@Param("id") id: string, @Param("allocationId") allocationId: string, @Query() query: any, @CurrentUser() user: any) {
    return this.service.removeNonBillable(this.slug(query), id, allocationId, user?.id || user?.sub || "user");
  }

  @Get("dispatch-invoice-control/summary")
  invoiceSummary(@Query() query: any) {
    return this.service.summary(this.slug(query), query);
  }

  @Get("dispatch-invoice-control")
  invoiceControl(@Query() query: any) {
    return this.service.list(this.slug(query), query);
  }

  @Post("dispatch-invoice-control/recalculate")
  recalculate(@Query() query: any, @Body() body: any) {
    return this.service.recalculate(this.slug(query, body), body?.userId || body?.actor || "system", body);
  }

  @Get("dispatch-invoice-control/:dispatchLineId/candidates")
  candidates(@Param("dispatchLineId") id: string, @Query() query: any) {
    return this.service.invoiceCandidates(this.slug(query), id);
  }

  @Post("dispatch-invoice-control/:dispatchLineId/match")
  match(@Param("dispatchLineId") id: string, @Query() query: any, @Body() body: any) {
    return this.service.manualMatch(this.slug(query, body), id, body);
  }

  @Patch("dispatch-invoice-control/matches/:matchId")
  updateMatch(@Param("matchId") id: string, @Query() query: any, @Body() body: any) {
    return this.service.updateMatch(this.slug(query, body), id, body);
  }

  @Delete("dispatch-invoice-control/matches/:matchId")
  deleteMatch(@Param("matchId") id: string, @Query() query: any) {
    return this.service.deleteMatch(this.slug(query), id, query);
  }

  @Post("dispatch-invoice-control/matches/:matchId/approve")
  approve(@Param("matchId") id: string, @Query() query: any, @Body() body: any) {
    return this.service.decideMatch(this.slug(query, body), id, true, body);
  }

  @Post("dispatch-invoice-control/matches/:matchId/reject")
  reject(@Param("matchId") id: string, @Query() query: any, @Body() body: any) {
    return this.service.decideMatch(this.slug(query, body), id, false, body);
  }

  @Get("dispatch-invoice-control/:dispatchLineId/history")
  history(@Param("dispatchLineId") id: string, @Query() query: any) {
    return this.service.history(this.slug(query), id);
  }
}
